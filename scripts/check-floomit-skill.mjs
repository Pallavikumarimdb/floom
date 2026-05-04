#!/usr/bin/env node
/**
 * CI gate for skills/floomit/SKILL.md.
 *
 * Checks:
 * 1. The file exists and is non-empty.
 * 2. Frontmatter has a valid version field.
 * 3. last_synced matches today's date (YYYY-MM-DD).
 *
 * Run: node scripts/check-floomit-skill.mjs
 * Add to package.json scripts: "check-floomit-skill": "node scripts/check-floomit-skill.mjs"
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = path.join(root, "skills", "floomit", "SKILL.md");

let content;
try {
  content = readFileSync(skillPath, "utf8");
} catch {
  console.error("FAIL: skills/floomit/SKILL.md not found");
  process.exit(1);
}

if (content.trim().length === 0) {
  console.error("FAIL: skills/floomit/SKILL.md is empty");
  process.exit(1);
}

// Parse frontmatter (between first two --- delimiters)
const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
if (!fmMatch) {
  console.error("FAIL: skills/floomit/SKILL.md has no YAML frontmatter");
  process.exit(1);
}

const fm = fmMatch[1];

// Check version field exists
const versionMatch = fm.match(/^version:\s*(.+)$/m);
if (!versionMatch) {
  console.error("FAIL: frontmatter missing version field");
  process.exit(1);
}
const version = versionMatch[1].trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`FAIL: version field '${version}' is not a valid semver string (expected X.Y.Z)`);
  process.exit(1);
}

// Check last_synced matches today's date
const today = new Date().toISOString().slice(0, 10);
const syncedMatch = fm.match(/^last_synced:\s*(.+)$/m);
if (!syncedMatch) {
  console.error("FAIL: frontmatter missing last_synced field");
  process.exit(1);
}
const lastSynced = syncedMatch[1].trim();
if (lastSynced !== today) {
  console.error(
    `FAIL: last_synced '${lastSynced}' does not match today's date '${today}'. ` +
    `Update last_synced in skills/floomit/SKILL.md before merging a skills change.`
  );
  process.exit(1);
}

console.log(`OK: skills/floomit/SKILL.md — version ${version}, last_synced ${lastSynced}`);
