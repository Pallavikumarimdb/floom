#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { collectBundleFiles, loadAppBundle } from "../lib/e2b/bundle.mjs";

const execFileAsync = promisify(execFile);

const [bundleDir, outputDir] = process.argv.slice(2);
if (!bundleDir || !outputDir) {
  console.error("Usage: node scripts/package-bundle.mjs <bundle-dir> <output-path>");
  process.exit(2);
}

try {
  const sourceRoot = path.resolve(bundleDir);
  const targetRoot = path.resolve(outputDir);
  const relativeTarget = path.relative(sourceRoot, targetRoot);
  if (relativeTarget === "" || (!relativeTarget.startsWith("..") && !path.isAbsolute(relativeTarget))) {
    throw new Error("Output path must be outside the source bundle directory");
  }

  const bundle = await loadAppBundle(sourceRoot);
  const files = await collectBundleFiles(sourceRoot);
  const isZipOutput = targetRoot.endsWith(".zip");

  await rm(targetRoot, { recursive: true, force: true });

  if (isZipOutput) {
    const stagingDir = await mkdtemp(path.join(os.tmpdir(), "floom-bundle-"));
    try {
      await stageBundleFiles(sourceRoot, stagingDir, files, bundle);
      await mkdir(path.dirname(targetRoot), { recursive: true });
      await execFileAsync("zip", ["-q", "-r", targetRoot, "."], {
        cwd: stagingDir,
      });
    } finally {
      await rm(stagingDir, { recursive: true, force: true });
    }
  } else {
    await mkdir(targetRoot, { recursive: true });
    await stageBundleFiles(sourceRoot, targetRoot, files, bundle);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputPath: targetRoot,
        outputType: isZipOutput ? "zip" : "dir",
        fileCount: files.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function stageBundleFiles(sourceRoot, targetRoot, files, bundle) {
  for (const file of files) {
    const targetPath = path.join(targetRoot, file.path);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, await readFile(path.join(sourceRoot, file.path)));
  }

  await writeFile(
    path.join(targetRoot, "bundle-manifest.json"),
    JSON.stringify(
      {
        name: bundle.manifest.name,
        version: bundle.manifest.version,
        runtime: bundle.manifest.runtime,
        schemas: bundle.manifest.schemas,
        files,
      },
      null,
      2,
    ),
  );
}
