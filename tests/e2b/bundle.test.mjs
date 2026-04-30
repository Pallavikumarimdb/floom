import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { collectBundleFiles, loadAppBundle } from "../../lib/e2b/bundle.mjs";

test("loads and validates the Python fixture bundle", async () => {
  const bundle = await loadAppBundle(path.resolve("fixtures/python-echo"));
  assert.equal(bundle.manifest.name, "python-echo");
  assert.equal(bundle.manifest.runtime.kind, "python");
  assert.equal(bundle.inputSchema.type, "object");
  assert.equal(bundle.outputSchema.type, "object");
});

test("collects package files and excludes generated directories", async () => {
  const files = await collectBundleFiles(path.resolve("fixtures/typescript-echo"));
  assert.deepEqual(
    files.map((file) => file.path),
    [
      "floom.yaml",
      "input.example.json",
      "input.schema.json",
      "main.js",
      "main.ts",
      "output.schema.json",
    ],
  );
});

test("excludes virtualenv directories from bundle collection", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "floom-bundle-"));
  await writeFile(
    path.join(tempDir, "floom.yaml"),
    [
      "name: bad",
      "version: 0.1.0",
      "runtime:",
      "  kind: python",
      "  entrypoint: main.py",
      "  command: python main.py",
      "schemas:",
      "  input: input.schema.json",
      "  output: output.schema.json",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(tempDir, "input.schema.json"), '{"type":"object"}');
  await writeFile(path.join(tempDir, "output.schema.json"), '{"type":"object"}');
  await mkdir(path.join(tempDir, ".floom-venv"));
  await writeFile(path.join(tempDir, ".floom-venv", "ignored.txt"), "ignore me");
  await writeFile(path.join(tempDir, "main.py"), "print('ok')\n");

  const files = await collectBundleFiles(tempDir);
  assert.deepEqual(
    files.map((file) => file.path),
    ["floom.yaml", "input.schema.json", "main.py", "output.schema.json"],
  );
});

test("rejects raw E2B host or token fields in manifest", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "floom-bundle-"));
  await writeFile(
    path.join(tempDir, "floom.yaml"),
    [
      "name: bad",
      "version: 0.1.0",
      "runtime:",
      "  kind: python",
      "  entrypoint: main.py",
      "  command: python main.py",
      "schemas:",
      "  input: input.schema.json",
      "  output: output.schema.json",
      "e2bToken: raw-token",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(tempDir, "input.schema.json"), '{"type":"object"}');
  await writeFile(path.join(tempDir, "output.schema.json"), '{"type":"object"}');

  await assert.rejects(
    () => loadAppBundle(tempDir),
    /must not expose raw host\/token\/secret field/,
  );
});

test("refuses to package common secret-bearing files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "floom-bundle-"));
  await writeFile(
    path.join(tempDir, "floom.yaml"),
    [
      "name: bad",
      "version: 0.1.0",
      "runtime:",
      "  kind: python",
      "  entrypoint: main.py",
      "  command: python main.py",
      "schemas:",
      "  input: input.schema.json",
      "  output: output.schema.json",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(tempDir, "input.schema.json"), '{"type":"object"}');
  await writeFile(path.join(tempDir, "output.schema.json"), '{"type":"object"}');
  await writeFile(path.join(tempDir, ".npmrc"), "//registry.example/:_authToken=secret");

  await assert.rejects(() => collectBundleFiles(tempDir), /Refusing to package secret-bearing file/);
});
