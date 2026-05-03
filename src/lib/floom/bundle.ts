import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type * as Tar from "tar";
import yaml from "js-yaml";
import {
  MAX_BUNDLE_BYTES,
  MAX_BUNDLE_COMPRESSION_RATIO,
  MAX_BUNDLE_FILE_BYTES,
  MAX_BUNDLE_FILE_COUNT,
  MAX_BUNDLE_UNPACKED_BYTES,
} from "./limits";
import {
  type FloomManifest,
  isLegacyPythonManifest,
  parseManifest,
  resolveManifestDisplayName,
  resolvePythonDependencyConfig,
  validatePythonSourceForManifest,
} from "./manifest";
import {
  parseAndValidateJsonSchemaText,
  type JsonObject,
} from "./schema";
import { validatePythonRequirementsText } from "./requirements";

const require = createRequire(path.join(process.cwd(), "package.json"));
const tar = require("tar") as typeof Tar;

export const DEFAULT_BUNDLE_EXCLUDES = [
  "node_modules/",
  ".git/",
  ".next/",
  "__pycache__/",
  "*.pyc",
  "dist/",
  "build/",
  ".venv/",
  "venv/",
  ".DS_Store",
  "*.log",
  ".env",
  ".env.local",
  ".env.*.local",
] as const;

const STOCK_E2B_BASE_HAS_GO = false;
const ALLOWED_PUBLIC_ENV_NAMES = new Set([
  "CI",
  "HOME",
  "HOSTNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "NODE_ENV",
  "PATH",
  "PORT",
  "PWD",
  "SHELL",
  "SHLVL",
  "TEMP",
  "TMP",
  "TMPDIR",
  "TZ",
  "USER",
]);

export type BundleBuildResult = {
  buffer: Buffer;
  compressedBytes: number;
  unpackedBytes: number;
  fileCount: number;
  files: string[];
};

export type BundleValidationErrorCode = "invalid_manifest" | "bundle_too_large";

export class BundleValidationError extends Error {
  code: BundleValidationErrorCode;

  constructor(code: BundleValidationErrorCode, detail: string) {
    super(detail);
    this.code = code;
  }
}

export type ValidatedBundle = {
  extractedDir: string;
  manifest: FloomManifest;
  manifestText: string;
  command: string;
  runtimeLabel: string;
  displayName: string;
  inputSchema: JsonObject | null;
  outputSchema: JsonObject | null;
  dependencyConfig: ReturnType<typeof resolvePythonDependencyConfig>;
  warnings: string[];
  fileCount: number;
  unpackedBytes: number;
  cleanup: () => Promise<void>;
};

export async function createBundleFromDirectory(appDir: string): Promise<BundleBuildResult> {
  const rootDir = path.resolve(appDir);
  const manifestPath = path.join(rootDir, "floom.yaml");
  const manifestText = await fs.readFile(manifestPath, "utf8").catch(() => {
    throw new Error(`floom.yaml not found in ${appDir}`);
  });
  const manifest = parseManifest(yaml.load(manifestText));

  const allFiles = await listIncludedFiles(rootDir, [
    ...DEFAULT_BUNDLE_EXCLUDES,
    ...(manifest.bundle_exclude ?? []),
  ]);

  if (allFiles.length === 0 || !allFiles.includes("floom.yaml")) {
    throw new Error("bundle must include floom.yaml at the app root");
  }

  const stats = await Promise.all(
    allFiles.map(async (relativePath) => {
      const stat = await fs.stat(path.join(rootDir, relativePath));
      return { relativePath, bytes: stat.size };
    })
  );
  const unpackedBytes = stats.reduce((total, item) => total + item.bytes, 0);

  const tempFile = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "floom-pack-")),
    "bundle.tar.gz"
  );
  try {
    await tar.create(
      {
        gzip: true,
        cwd: rootDir,
        file: tempFile,
        portable: true,
        noMtime: true,
      },
      allFiles
    );

    const buffer = await fs.readFile(tempFile);
    if (buffer.byteLength > MAX_BUNDLE_BYTES || unpackedBytes > MAX_BUNDLE_UNPACKED_BYTES) {
      throw new Error(
        "bundle too large after default exclusions; trim your dependencies or split the app"
      );
    }

    return {
      buffer,
      compressedBytes: buffer.byteLength,
      unpackedBytes,
      fileCount: allFiles.length,
      files: allFiles,
    };
  } finally {
    await fs.rm(path.dirname(tempFile), { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function createBundleFromFileMap(
  files: Record<string, string>
): Promise<BundleBuildResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "floom-mcp-"));
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      const absolutePath = resolveBundlePath(tempDir, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, contents, "utf8");
    }

    return await createBundleFromDirectory(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function validateUploadedTarball(
  bundleBuffer: Buffer,
  uploadedManifestText?: string
): Promise<ValidatedBundle> {
  if (bundleBuffer.byteLength > MAX_BUNDLE_BYTES) {
    throw new BundleValidationError("bundle_too_large", "bundle exceeds the 5 MB compressed limit");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "floom-bundle-"));
  const tarballPath = path.join(tempDir, "bundle.tar.gz");
  await fs.writeFile(tarballPath, bundleBuffer);

  try {
    const inspection = await inspectTarball(tarballPath, bundleBuffer.byteLength);
    const extractedDir = path.join(tempDir, "app");
    await fs.mkdir(extractedDir, { recursive: true });
    await tar.extract({
      file: tarballPath,
      cwd: extractedDir,
      strict: true,
      portable: true,
      onReadEntry: () => undefined,
    });

    const manifestText = await fs.readFile(path.join(extractedDir, "floom.yaml"), "utf8");
    if (
      uploadedManifestText &&
      JSON.stringify(yaml.load(uploadedManifestText)) !== JSON.stringify(yaml.load(manifestText))
    ) {
      throw new BundleValidationError(
        "invalid_manifest",
        "uploaded manifest does not match floom.yaml at the bundle root"
      );
    }

    const manifest = parseManifest(yaml.load(manifestText));
    const command = await detectCommand(extractedDir, manifest);
    const runtimeLabel = await detectRuntimeLabel(extractedDir, manifest, command);
    const dependencyConfig = resolvePythonDependencyConfig(manifest);
    const { inputSchema, outputSchema } = await loadSchemas(extractedDir, manifest);

    if (isLegacyPythonManifest(manifest)) {
      const entrypointSource = await fs.readFile(
        path.join(extractedDir, manifest.entrypoint),
        "utf8"
      ).catch(() => {
        throw new BundleValidationError(
          "invalid_manifest",
          `Missing entrypoint: ${manifest.entrypoint}`
        );
      });
      validatePythonSourceForManifest(entrypointSource, manifest);
    }

    if (dependencyConfig) {
      const requirementsText = await fs.readFile(
        path.join(extractedDir, dependencyConfig.path),
        "utf8"
      ).catch(() => {
        throw new BundleValidationError(
          "invalid_manifest",
          `Missing requirements.txt: ${dependencyConfig.path}`
        );
      });

      validatePythonRequirementsText(requirementsText, {
        requireHashes: dependencyConfig.requireHashes,
      });
    } else {
      const defaultRequirementsPath = path.join(extractedDir, "requirements.txt");
      const requirementsExists = await fs.stat(defaultRequirementsPath).then(() => true).catch(() => false);
      if (requirementsExists) {
        const requirementsText = await fs.readFile(defaultRequirementsPath, "utf8");
        // Skip validation for comment-only / empty requirements.txt (treat as absent).
        // A requirements.txt with no real package lines means "no deps" — not an error.
        const hasPackageLines = requirementsText
          .split(/\r?\n/)
          .some((line) => line.trim() !== "" && !line.trim().startsWith("#"));
        if (hasPackageLines) {
          validatePythonRequirementsText(requirementsText);
        }
      }
    }

    const warnings = await findSecretCoverageWarnings(extractedDir, manifest);

    return {
      extractedDir,
      manifest,
      manifestText,
      command,
      runtimeLabel,
      displayName: resolveManifestDisplayName(manifest),
      inputSchema,
      outputSchema,
      dependencyConfig,
      warnings,
      fileCount: inspection.fileCount,
      unpackedBytes: inspection.unpackedBytes,
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      },
    };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function inspectTarball(tarballPath: string, compressedBytes: number) {
  let unpackedBytes = 0;
  let fileCount = 0;
  let hasRootManifest = false;
  let validationError: BundleValidationError | null = null;

  await tar.list({
    file: tarballPath,
    strict: true,
    onReadEntry: (entry: Tar.ReadEntry) => {
      if (validationError) {
        return;
      }

      const entryPath = normalizeBundlePath(entry.path);
      const type = entry.type;

      // Skip directory entries — the root "." normalises to "" after stripping "./",
      // which would otherwise trigger the invalid-path guard below.
      if (type === "Directory") {
        return;
      }

      if (!entryPath || entryPath.includes("..") || path.isAbsolute(entryPath)) {
        validationError = new BundleValidationError("invalid_manifest", `invalid bundle path: ${entry.path}`);
        return;
      }

      if (
        type === "SymbolicLink" ||
        type === "Link" ||
        type === "CharacterDevice" ||
        type === "BlockDevice" ||
        type === "FIFO"
      ) {
        validationError = new BundleValidationError(
          "invalid_manifest",
          `bundle contains unsupported ${type.toLowerCase()} entry: ${entry.path}`
        );
        return;
      }

      {
        fileCount += 1;
        unpackedBytes += entry.size;
        if (fileCount > MAX_BUNDLE_FILE_COUNT) {
          validationError = new BundleValidationError(
            "bundle_too_large",
            `bundle exceeds the ${MAX_BUNDLE_FILE_COUNT} file limit`
          );
          return;
        }
        if (entry.size > MAX_BUNDLE_FILE_BYTES) {
          validationError = new BundleValidationError(
            "bundle_too_large",
            `bundle file exceeds the ${MAX_BUNDLE_FILE_BYTES / (1024 * 1024)} MB per-file limit: ${entry.path}`
          );
          return;
        }
        if (unpackedBytes > MAX_BUNDLE_UNPACKED_BYTES) {
          validationError = new BundleValidationError(
            "bundle_too_large",
            `bundle exceeds the ${MAX_BUNDLE_UNPACKED_BYTES / (1024 * 1024)} MB unpacked limit`
          );
          return;
        }
      }

      if (entryPath === "floom.yaml") {
        hasRootManifest = true;
      }
    },
  });

  if (validationError) {
    throw validationError;
  }

  if (!hasRootManifest) {
    throw new BundleValidationError(
      "invalid_manifest",
      "bundle must contain floom.yaml at the tarball root"
    );
  }

  if (compressedBytes > 0 && unpackedBytes / compressedBytes > MAX_BUNDLE_COMPRESSION_RATIO) {
    throw new BundleValidationError(
      "bundle_too_large",
      `bundle exceeds the ${MAX_BUNDLE_COMPRESSION_RATIO}x decompression ratio limit`
    );
  }

  return { unpackedBytes, fileCount };
}

async function loadSchemas(extractedDir: string, manifest: FloomManifest) {
  const inputSchema = await loadOptionalSchema(
    extractedDir,
    manifest.input_schema,
    "input_schema"
  );
  const outputSchema = await loadOptionalSchema(
    extractedDir,
    manifest.output_schema,
    "output_schema"
  );

  return { inputSchema, outputSchema };
}

async function loadOptionalSchema(
  extractedDir: string,
  relativePath: string | undefined,
  field: "input_schema" | "output_schema"
): Promise<JsonObject | null> {
  if (!relativePath) {
    return null;
  }

  const schemaPath = resolveBundlePath(extractedDir, relativePath);
  const schemaText = await fs.readFile(schemaPath, "utf8").catch(() => {
    throw new BundleValidationError("invalid_manifest", `Missing ${field}: ${relativePath}`);
  });
  const result = parseAndValidateJsonSchemaText(schemaText, field);
  if (!result.ok) {
    throw new BundleValidationError("invalid_manifest", result.error);
  }

  return result.schema;
}

export async function detectCommand(rootDir: string, manifest: FloomManifest): Promise<string> {
  if (manifest.mode === "stock_e2b" && manifest.command?.trim()) {
    const command = manifest.command.trim();
    // Validate the command's primary target file exists in the bundle so we
    // fail at publish time, not silently at sandbox runtime. We extract the
    // first non-flag token after the runtime (python/node/bun/go) as the
    // entrypoint file and check it. Heuristic — multi-arg shell pipelines or
    // `npm start` style are skipped (no single file to verify).
    const target = extractCommandTargetFile(command);
    if (target && !(await exists(path.join(rootDir, target)))) {
      throw new BundleValidationError(
        "invalid_manifest",
        `command target '${target}' is not present in the bundle`
      );
    }
    return command;
  }

  if (isLegacyPythonManifest(manifest)) {
    return `python ${manifest.entrypoint}`;
  }

  const candidates: string[] = [];
  if (await exists(path.join(rootDir, "app.py"))) {
    candidates.push("python app.py");
  }
  if (await exists(path.join(rootDir, "index.js"))) {
    candidates.push("node index.js");
  }
  if (await hasPackageJsonStartScript(path.join(rootDir, "package.json"))) {
    candidates.push("npm start");
  }
  if (STOCK_E2B_BASE_HAS_GO && await exists(path.join(rootDir, "main.go"))) {
    candidates.push("go run main.go");
  }

  if (candidates.length > 1) {
    throw new BundleValidationError(
      "invalid_manifest",
      `ambiguous command auto-detection (${candidates.join(", ")}), please specify command: in floom.yaml`
    );
  }

  if (candidates.length === 1) {
    return candidates[0]!;
  }

  throw new BundleValidationError(
    "invalid_manifest",
    "no command detected, please specify `command:` in floom.yaml"
  );
}

// Extract the primary target file from a stock_e2b command string.
// Returns null for commands that don't reference a single source file
// (e.g. `npm start`, `bash -c "..."`) — we don't try to validate those.
function extractCommandTargetFile(command: string): string | null {
  const tokens = command.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  const runtime = tokens[0]?.toLowerCase();
  const RUNTIMES_WITH_FILE_TARGET = new Set(["python", "python3", "node", "bun", "deno", "ruby", "php"]);
  if (!runtime || !RUNTIMES_WITH_FILE_TARGET.has(runtime)) return null;
  const target = tokens.slice(1).find((token) => !token.startsWith("-"));
  if (!target) return null;
  // Reject obvious non-file targets to keep the heuristic conservative.
  if (target.startsWith("/") || target.includes("..")) return null;
  // Filenames must include an extension to count as a target we can check.
  // Avoids false positives on `python -m module_name`.
  if (!/\.[a-z0-9]+$/i.test(target)) return null;
  return target;
}

async function detectRuntimeLabel(rootDir: string, manifest: FloomManifest, command: string) {
  if (isLegacyPythonManifest(manifest)) {
    return "python";
  }

  if (command.startsWith("python ")) {
    return "python";
  }
  if (command.startsWith("node ") || command.startsWith("npm ")) {
    return "node";
  }
  if (command.startsWith("go ")) {
    return "go";
  }
  if (command.startsWith("bun ")) {
    return "bun";
  }
  if (await exists(path.join(rootDir, "package.json"))) {
    return "node";
  }
  if (await exists(path.join(rootDir, "app.py"))) {
    return "python";
  }

  return "stock-e2b";
}

async function hasPackageJsonStartScript(packageJsonPath: string) {
  if (!(await exists(packageJsonPath))) {
    return false;
  }

  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    return typeof packageJson.scripts?.start === "string" && packageJson.scripts.start.trim() !== "";
  } catch {
    throw new BundleValidationError("invalid_manifest", "package.json must be valid JSON");
  }
}

async function findSecretCoverageWarnings(extractedDir: string, manifest: FloomManifest) {
  const declaredSecrets = new Set(manifest.secrets ?? []);
  const warnings: string[] = [];
  const envReferences = new Map<string, Set<string>>();

  for (const relativePath of await listSourceFiles(extractedDir)) {
    const contents = await fs.readFile(path.join(extractedDir, relativePath), "utf8");
    const found = findEnvRefsInText(relativePath, contents);
    for (const [name, filePath] of found) {
      if (declaredSecrets.has(name) || name.startsWith("FLOOM_") || ALLOWED_PUBLIC_ENV_NAMES.has(name)) {
        continue;
      }
      const files = envReferences.get(name) ?? new Set<string>();
      files.add(filePath);
      envReferences.set(name, files);
    }
  }

  for (const [name, filePaths] of [...envReferences.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    warnings.push(
      `env var ${name} is referenced in ${[...filePaths].sort().join(", ")} but not declared in secrets`
    );
  }

  return warnings;
}

function findEnvRefsInText(relativePath: string, text: string) {
  const refs = new Map<string, string>();
  const patterns = [
    /os\.environ\[\s*["']([A-Z_]+)["']\s*\]/g,
    /os\.getenv\(\s*["']([A-Z_]+)["']/g,
    /os\.environ\.get\(\s*["']([A-Z_]+)["']/g,
    /process\.env\.([A-Z_]+)/g,
    /process\.env\[\s*["']([A-Z_]+)["']\s*\]/g,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const name = match[1];
      if (name) {
        refs.set(name, relativePath);
      }
    }
  }

  return refs;
}

async function listIncludedFiles(rootDir: string, patterns: readonly string[]) {
  const files: string[] = [];

  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = normalizeBundlePath(path.relative(rootDir, absolutePath));
      if (!relativePath) {
        continue;
      }

      if (shouldExclude(relativePath, entry.isDirectory(), patterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  await walk(rootDir);
  return files.sort();
}

async function listSourceFiles(rootDir: string) {
  const files = await listIncludedFiles(rootDir, []);
  return files.filter((filePath) => /\.(py|js|ts)$/i.test(filePath));
}

function shouldExclude(relativePath: string, isDirectory: boolean, patterns: readonly string[]) {
  const pathToCheck = isDirectory ? `${relativePath}/` : relativePath;
  return patterns.some((pattern) => matchesPattern(pathToCheck, pattern));
}

function matchesPattern(relativePath: string, pattern: string) {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  if (normalizedPattern.endsWith("/")) {
    return relativePath === normalizedPattern || relativePath.startsWith(normalizedPattern);
  }

  if (!normalizedPattern.includes("*")) {
    return relativePath === normalizedPattern || relativePath.endsWith(`/${normalizedPattern}`);
  }

  const escaped = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*");
  const regex = new RegExp(`(^|/)${escaped}$`);
  return regex.test(relativePath);
}

function normalizeBundlePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
}

function resolveBundlePath(rootDir: string, relativePath: string) {
  const absolutePath = path.resolve(rootDir, relativePath);
  const normalizedRoot = path.resolve(rootDir);
  if (absolutePath !== normalizedRoot && !absolutePath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new BundleValidationError(
      "invalid_manifest",
      `${relativePath} must stay inside the app directory`
    );
  }
  return absolutePath;
}

async function exists(filePath: string) {
  return fs.stat(filePath).then(() => true).catch(() => false);
}
