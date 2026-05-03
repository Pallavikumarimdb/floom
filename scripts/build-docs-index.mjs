#!/usr/bin/env node
/**
 * Build-time script: generates public/docs-index.json from the static
 * DOCS_INDEX defined in src/lib/docs/buildDocsIndex.ts.
 *
 * Usage: node scripts/build-docs-index.mjs
 * Called automatically via package.json "prebuild" hook.
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Read the TS source and extract the DOCS_INDEX array via regex.
// This avoids needing ts-node or tsx at build time.
const src = readFileSync(resolve(root, "src/lib/docs/buildDocsIndex.ts"), "utf8");

// Strip comments, then eval the array literal
const match = src.match(/export const DOCS_INDEX[^=]*=\s*(\[[\s\S]*?\]);/);
if (!match) {
  console.error("Could not find DOCS_INDEX in buildDocsIndex.ts");
  process.exit(1);
}

// Safe eval: the file only contains string literals + object literals + array syntax
// eslint-disable-next-line no-eval
const index = eval(match[1]);

const out = resolve(root, "public/docs-index.json");
writeFileSync(out, JSON.stringify(index, null, 2), "utf8");
console.log(`docs-index.json: ${index.length} entries → ${out}`);
