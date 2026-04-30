#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runAppBundle } from "../lib/runner/index.mjs";

const [bundleDir, inputPath, mode = "fake"] = process.argv.slice(2);
if (!bundleDir || !inputPath) {
  console.error("Usage: node scripts/run-bundle.mjs <bundle-dir> <input-json-file> [fake|local|e2b]");
  process.exit(2);
}

try {
  const input = JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
  const result = await runAppBundle({
    bundleDir: path.resolve(bundleDir),
    input,
    mode,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
