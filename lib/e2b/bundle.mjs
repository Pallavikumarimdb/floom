import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { parseYamlDocument } from "./yaml.mjs";

const MANIFEST_FILE = "floom.yaml";
const FORBIDDEN_KEYS = new Set([
  "e2bHost",
  "e2bToken",
  "host",
  "token",
  "apiKey",
  "api_key",
  "secret",
]);
const FORBIDDEN_PACKAGE_FILES = new Set([".npmrc", ".pypirc", ".netrc", "id_rsa", "id_ed25519"]);

export async function loadAppBundle(rootDir) {
  const manifestPath = path.join(rootDir, MANIFEST_FILE);
  const manifest = parseYamlDocument(await readFile(manifestPath, "utf8"));
  validateManifest(manifest);

  const inputSchema = JSON.parse(
    await readFile(path.join(rootDir, manifest.schemas.input), "utf8"),
  );
  const outputSchema = JSON.parse(
    await readFile(path.join(rootDir, manifest.schemas.output), "utf8"),
  );

  validateJsonSchemaDocument(inputSchema, "input schema");
  validateJsonSchemaDocument(outputSchema, "output schema");

  return {
    rootDir,
    manifest,
    inputSchema,
    outputSchema,
  };
}

export function validateManifest(manifest) {
  assertObject(manifest, "manifest");
  rejectRuntimeSecrets(manifest, "manifest");

  requiredString(manifest, "name");
  requiredString(manifest, "version");
  assertObject(manifest.runtime, "runtime");
  assertObject(manifest.schemas, "schemas");
  requiredString(manifest.runtime, "kind");
  requiredString(manifest.runtime, "entrypoint");
  requiredString(manifest.runtime, "command");
  requiredString(manifest.schemas, "input");
  requiredString(manifest.schemas, "output");

  if (!["python", "node", "typescript"].includes(manifest.runtime.kind)) {
    throw new Error(`Unsupported runtime.kind "${manifest.runtime.kind}"`);
  }

  if (manifest.runner !== undefined) {
    assertObject(manifest.runner, "runner");
    if (
      manifest.runner.timeoutMs !== undefined &&
      (!Number.isInteger(manifest.runner.timeoutMs) || manifest.runner.timeoutMs <= 0)
    ) {
      throw new Error("runner.timeoutMs must be a positive integer");
    }
  }
}

export async function collectBundleFiles(rootDir) {
  const files = [];
  await walk(rootDir, rootDir, files);
  return files.sort();
}

async function walk(rootDir, currentDir, files) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, fullPath);
    if (
      entry.name === ".git" ||
      entry.name === "node_modules" ||
      entry.name === "__pycache__" ||
      entry.name === ".floom-venv"
    ) {
      continue;
    }
    if (isSecretBearingFile(entry.name)) {
      throw new Error(`Refusing to package secret-bearing file ${relativePath}`);
    }
    if (entry.isDirectory()) {
      await walk(rootDir, fullPath, files);
    } else if (entry.isFile()) {
      const size = (await stat(fullPath)).size;
      files.push({ path: relativePath, size });
    }
  }
}

function isSecretBearingFile(fileName) {
  return (
    fileName.startsWith(".env") ||
    FORBIDDEN_PACKAGE_FILES.has(fileName) ||
    fileName.endsWith(".pem") ||
    fileName.endsWith(".key")
  );
}

function validateJsonSchemaDocument(schema, label) {
  assertObject(schema, label);
  if (!schema.type) throw new Error(`${label} must declare a top-level type`);
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requiredString(parent, key) {
  if (typeof parent[key] !== "string" || parent[key].trim() === "") {
    throw new Error(`${key} must be a non-empty string`);
  }
}

function rejectRuntimeSecrets(value, pathLabel) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${pathLabel}.${key}`;
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`Manifest must not expose raw host/token/secret field ${childPath}`);
    }
    rejectRuntimeSecrets(child, childPath);
  }
}
