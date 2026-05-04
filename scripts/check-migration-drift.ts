#!/usr/bin/env tsx
/**
 * Migration drift detector — fails CI if any .select() call references
 * a column that doesn't exist in the union of all supabase/migrations/*.sql
 *
 * Run: npm run check-migration-drift
 * CI:  .github/workflows/migration-drift.yml
 *
 * Federico 2026-05-04: the composio column was referenced in a select() but
 * its ALTER TABLE migration was never applied to prod — caused 500s → 404s
 * for every /api/apps/<slug>/run call for hours.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "glob";
import * as ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Types ────────────────────────────────────────────────────────────────────

type ColumnInventory = Map<string, Set<string>>;

interface DriftFinding {
  file: string;
  line: number;
  table: string;
  missingColumns: string[];
  selectStr: string;
}

// ─── Step 1: Build column inventory from migrations ───────────────────────────

function parseMigrations(dir: string): ColumnInventory {
  const inv: ColumnInventory = new Map();

  if (!fs.existsSync(dir)) {
    console.error(`Migrations directory not found: ${dir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // chronological order matters for DROP COLUMN

  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), "utf-8");
    parseSqlIntoInventory(sql, inv);
  }

  return inv;
}

/**
 * Split a string on top-level commas (depth 0), ignoring commas inside
 * parentheses. Used to split multi-clause ALTER TABLE bodies.
 */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i <= s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === "," && depth === 0) || i === s.length) {
      parts.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }

  return parts.filter(Boolean);
}

function parseSqlIntoInventory(sql: string, inv: ColumnInventory): void {
  // Strip single-line comments so they don't confuse the regexes
  const stripped = sql.replace(/--[^\n]*/g, "");

  // ── CREATE TABLE ──────────────────────────────────────────────────────────
  // Handles: CREATE TABLE [IF NOT EXISTS] [public.]name ( ... );
  // Multi-line safe: [\s\S]+? is non-greedy up to the first lone semicolon
  const createTableRe =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]+?)\)\s*;/gi;

  for (const m of stripped.matchAll(createTableRe)) {
    const tableName = m[1].toLowerCase();
    const colsBlock = m[2];

    if (!inv.has(tableName)) inv.set(tableName, new Set());
    const cols = inv.get(tableName)!;

    for (const rawLine of colsBlock.split(",")) {
      const line = rawLine.trim();
      if (!line) continue;

      // Skip constraint declarations
      const firstWord = line.split(/\s+/)[0].toLowerCase();
      if (
        ["constraint", "primary", "foreign", "unique", "check", "exclude"].includes(
          firstWord
        )
      )
        continue;

      // Column name is the first identifier token on the line
      const colMatch = line.match(/^(\w+)\s+/);
      if (colMatch) cols.add(colMatch[1].toLowerCase());
    }
  }

  // ── ALTER TABLE blocks ────────────────────────────────────────────────────
  // Handles multi-clause ALTER TABLE statements:
  //   ALTER TABLE [public.]name
  //     add column if not exists foo text,
  //     drop column bar,
  //     alter column baz ...;
  //
  // Strategy: find each ALTER TABLE block (everything up to the semicolon),
  // then scan the block body for `add column` / `drop column` clauses.
  // We also handle single-line forms on the same match pass.
  const alterTableRe =
    /alter\s+table\s+(?:public\.)?(\w+)([\s\S]+?);/gi;

  for (const m of stripped.matchAll(alterTableRe)) {
    const tableName = m[1].toLowerCase();
    const body = m[2];

    // Each clause is separated by a comma (or is the only clause).
    // Split on commas that are NOT inside parentheses (constraint expressions).
    const clauses = splitTopLevel(body);

    for (const clause of clauses) {
      const addMatch = clause.match(
        /add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/i
      );
      if (addMatch) {
        const colName = addMatch[1].toLowerCase();
        if (!inv.has(tableName)) inv.set(tableName, new Set());
        inv.get(tableName)!.add(colName);
        continue;
      }

      const dropMatch = clause.match(
        /drop\s+column\s+(?:if\s+exists\s+)?(\w+)/i
      );
      if (dropMatch) {
        const colName = dropMatch[1].toLowerCase();
        inv.get(tableName)?.delete(colName);
      }
    }
  }
}

// ─── Step 2: Parse select columns from a Supabase PostgREST select string ────

interface SelectColumns {
  /** Top-level column names on the primary table */
  topLevel: string[];
  /** Nested relations: table_name → column list */
  nested: { table: string; cols: string[] }[];
}

/**
 * Parses a PostgREST select string like:
 *   "id, slug, app_versions(id, bundle_path), apps!inner(slug)"
 *
 * Rules:
 *   - "col"                → topLevel
 *   - "col as alias"       → topLevel (using the real col name, not alias)
 *   - "relation(c1, c2)"   → nested { table: "relation", cols: [...] }
 *   - "*"                  → skip (wildcard — can't statically validate)
 *   - "count(*) as total"  → skip (aggregate)
 */
function parseSelectColumns(s: string): SelectColumns {
  const result: SelectColumns = { topLevel: [], nested: [] };

  // Walk character by character, splitting on top-level commas only
  let depth = 0;
  let start = 0;

  for (let i = 0; i <= s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === "," && depth === 0) || i === s.length) {
      const item = s.slice(start, i).trim();
      start = i + 1;

      if (!item) continue;

      // Nested relation: "relation(col1, col2)" or "relation!inner(col1)"
      const nestedMatch = item.match(/^(\w+)(?:![^(]*)?\((.+)\)$/s);
      if (nestedMatch) {
        const relName = nestedMatch[1].toLowerCase();
        const inner = nestedMatch[2];
        const relCols = parseSelectColumns(inner);
        result.nested.push({
          table: relName,
          cols: relCols.topLevel,
        });
        // Recurse for doubly-nested (rare but possible)
        for (const sub of relCols.nested) {
          result.nested.push(sub);
        }
        continue;
      }

      // Skip wildcard
      if (item === "*") continue;

      // Skip aggregates like "count(*)"
      if (/\(/.test(item)) continue;

      // Strip alias: "col as alias" → "col"
      const cleaned = item.split(/\s+as\s+/i)[0].trim().toLowerCase();

      // Skip empty or non-identifier tokens (e.g. stray punctuation)
      if (/^\w+$/.test(cleaned)) {
        result.topLevel.push(cleaned);
      }
    }
  }

  return result;
}

// ─── Step 3: Walk TypeScript source for .select() calls ──────────────────────

/**
 * Given a CallExpression node for `.select("...")`, trace the method chain
 * backwards to find the nearest `.from("table_name")` call.
 *
 * Supabase client pattern:
 *   supabase.from("apps").select("id, slug")
 *   supabase.from("apps").select("id").eq(...)
 *   admin.from("app_versions").select("composio, secrets")
 *
 * Also handles intermediate chain calls:
 *   supabase.from("apps").eq("slug", x).select("id")
 */
function resolveFromTable(
  selectNode: ts.CallExpression,
  sourceFile: ts.SourceFile
): string | undefined {
  // The select call's receiver: e.g. `supabase.from("apps")` or
  // `supabase.from("apps").eq("slug", x)`
  let receiver = (selectNode.expression as ts.PropertyAccessExpression).expression;

  // Walk back through the chain: unwrap .method() wrappers until we find .from()
  // We limit iterations to avoid infinite loops on pathological ASTs
  for (let i = 0; i < 20; i++) {
    if (!ts.isCallExpression(receiver)) break;

    const callee = receiver.expression;
    if (!ts.isPropertyAccessExpression(callee)) break;

    const methodName = callee.name.getText(sourceFile);

    if (methodName === "from") {
      const arg = receiver.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        return arg.text.toLowerCase();
      }
      return undefined;
    }

    // Step further up the chain
    receiver = callee.expression;
  }

  return undefined;
}

async function checkSourceDrift(
  srcDir: string,
  inv: ColumnInventory
): Promise<DriftFinding[]> {
  const files = await glob("**/*.ts", {
    cwd: srcDir,
    absolute: true,
    ignore: [
      "**/node_modules/**",
      "**/__tests__/**",
      "**/*.test.ts",
      "**/*.spec.ts",
    ],
  });

  const findings: DriftFinding[] = [];

  for (const file of files) {
    const src = fs.readFileSync(file, "utf-8");
    const sourceFile = ts.createSourceFile(
      file,
      src,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true
    );

    function visit(node: ts.Node): void {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const methodName = node.expression.name.getText(sourceFile);

        if (methodName === "select") {
          // We only validate literal string arguments — dynamic selects are skipped
          const firstArg = node.arguments[0];
          if (!firstArg || !ts.isStringLiteral(firstArg)) {
            ts.forEachChild(node, visit);
            return;
          }

          const selectStr = (firstArg as ts.StringLiteral).text;

          // Skip empty select() or select() with no arg (returns all columns)
          if (!selectStr || selectStr.trim() === "") {
            ts.forEachChild(node, visit);
            return;
          }

          const table = resolveFromTable(node, sourceFile);
          if (!table) {
            ts.forEachChild(node, visit);
            return;
          }

          const parsed = parseSelectColumns(selectStr);
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile)
          );

          // Check top-level columns against the primary table
          if (!isWildcardSelect(selectStr)) {
            const known = inv.get(table) ?? new Set<string>();
            const missing = parsed.topLevel.filter(
              (c) => c !== "*" && !known.has(c)
            );

            if (missing.length > 0) {
              findings.push({
                file: path.relative(ROOT, file),
                line: line + 1,
                table,
                missingColumns: missing,
                selectStr: selectStr.slice(0, 120),
              });
            }
          }

          // Check nested relation columns
          for (const nested of parsed.nested) {
            const nestedKnown = inv.get(nested.table) ?? new Set<string>();
            const nestedMissing = nested.cols.filter(
              (c) => c !== "*" && !nestedKnown.has(c)
            );

            if (nestedMissing.length > 0) {
              findings.push({
                file: path.relative(ROOT, file),
                line: line + 1,
                table: nested.table,
                missingColumns: nestedMissing,
                selectStr: selectStr.slice(0, 120),
              });
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return findings;
}

/**
 * Returns true if the entire select is a wildcard (nothing to validate).
 * e.g. select("*") or select()
 */
function isWildcardSelect(s: string): boolean {
  return s.trim() === "*";
}

// ─── Step 4: Print results and exit ──────────────────────────────────────────

const migrationsDir = path.join(ROOT, "supabase", "migrations");
const srcDir = path.join(ROOT, "src");

console.log("Building column inventory from migrations...");
const inv = parseMigrations(migrationsDir);
console.log(`  ${inv.size} tables found:`);
for (const [table, cols] of [...inv.entries()].sort()) {
  console.log(`    ${table}: ${cols.size} columns`);
}
console.log("");

console.log("Scanning source for .select() drift...");
const findings = await checkSourceDrift(srcDir, inv);
console.log("");

if (findings.length === 0) {
  console.log("✓ No migration drift detected.");
  process.exit(0);
}

console.log("✗ MIGRATION DRIFT DETECTED:\n");

for (const f of findings) {
  console.log(`  ${f.file}:${f.line}`);
  console.log(`    Table:           ${f.table}`);
  console.log(`    Missing columns: ${f.missingColumns.join(", ")}`);
  console.log(`    Select string:   ${f.selectStr}`);
  console.log("");
}

console.log(`Total findings: ${findings.length}`);
console.log("");
console.log("Fix options:");
console.log(
  "  1. Add a supabase/migrations/<timestamp>_add_<column>.sql that ALTER TABLE ADD COLUMN"
);
console.log("  2. Remove the missing column from the .select() call");
console.log("");
console.log(
  "This check exists because missing migrations break production queries."
);
console.log(
  "Incident: 2026-05-04 — composio column in select() but migration not applied to prod."
);

process.exit(1);
