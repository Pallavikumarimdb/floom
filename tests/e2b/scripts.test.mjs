import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);

test("package script validates and copies a bundle deterministically", async () => {
  const outputDir = path.resolve(".tmp/test-python-package");
  await rm(outputDir, { recursive: true, force: true });

  const { stdout } = await execFileAsync("node", [
    "scripts/package-bundle.mjs",
    "fixtures/python-echo",
    outputDir,
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.outputType, "dir");
  assert.equal(result.fileCount, 5);
  await access(path.join(outputDir, "floom.yaml"));
  const manifest = JSON.parse(await readFile(path.join(outputDir, "bundle-manifest.json"), "utf8"));
  assert.equal(manifest.name, "python-echo");

  await rm(outputDir, { recursive: true, force: true });
});

test("package script rejects output paths inside the source bundle", async () => {
  await assert.rejects(
    () =>
      execFileAsync("node", [
        "scripts/package-bundle.mjs",
        "fixtures/python-echo",
        "fixtures/python-echo/out",
      ]),
    /Output path must be outside the source bundle directory/,
  );
});

test("package script writes a zip archive with bundle files and manifest", async () => {
  const outputZip = path.resolve(".tmp/test-python-package.zip");
  await rm(outputZip, { force: true });

  const { stdout } = await execFileAsync("node", [
    "scripts/package-bundle.mjs",
    "fixtures/python-echo",
    outputZip,
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.outputType, "zip");
  assert.equal(result.fileCount, 5);
  await access(outputZip);

  const { stdout: listing } = await execFileAsync("unzip", ["-Z", "-1", outputZip]);
  const entries = listing.split("\n").filter(Boolean);
  assert.ok(entries.length > 1);
  assert.ok(entries.includes("bundle-manifest.json"));
  assert.ok(entries.includes("floom.yaml"));

  await rm(outputZip, { force: true });
});
