#!/usr/bin/env node
import path from "node:path";
import { collectBundleFiles, loadAppBundle } from "../lib/e2b/bundle.mjs";

const bundleDir = process.argv[2];
if (!bundleDir) {
  console.error("Usage: node scripts/validate-bundle.mjs <bundle-dir>");
  process.exit(2);
}

try {
  const resolved = path.resolve(bundleDir);
  const bundle = await loadAppBundle(resolved);
  const files = await collectBundleFiles(resolved);
  console.log(
    JSON.stringify(
      {
        ok: true,
        name: bundle.manifest.name,
        version: bundle.manifest.version,
        runtime: bundle.manifest.runtime.kind,
        files,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
