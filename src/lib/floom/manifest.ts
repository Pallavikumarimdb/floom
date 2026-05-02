export type ManifestDependencies = {
  python?: string;
};

type SharedManifestFields = {
  mode: "stock_e2b" | "legacy_python";
  name?: string;
  slug: string;
  description?: string;
  public?: boolean;
  input_schema?: string;
  output_schema?: string;
  dependencies?: ManifestDependencies;
  secrets?: string[];
  bundle_exclude?: string[];
};

export type StockE2BManifest = SharedManifestFields & {
  mode: "stock_e2b";
  command?: string;
};

export type LegacyPythonManifest = SharedManifestFields & {
  mode: "legacy_python";
  runtime: "python";
  entrypoint: string;
  handler: string;
};

export type FloomManifest = StockE2BManifest | LegacyPythonManifest;

export type PythonDependencyConfig = {
  path: string;
  requireHashes: boolean;
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const PYTHON_FILE_RE = /^[A-Za-z_][A-Za-z0-9_]*\.py$/;
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RELATIVE_FILE_RE = /^(?:\.\/)?[A-Za-z0-9._/-]+$/;
const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const PYTHON_DEPENDENCY_RE = /^(?:\.\/)?requirements\.txt(?:\s+--require-hashes)?$/;
const POST_V01_FIELDS = [
  "actions",
  "type",
  "visibility",
  "category",
  "manifest_version",
  "python_dependencies",
  "secrets_needed",
  "openapi_spec_url",
];

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing ${field} in floom.yaml`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error("public must be true or false");
  }

  return value;
}

function optionalRelativePath(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a file path string`);
  }

  const normalized = value.trim().replace(/\\/g, "/");
  if (
    !RELATIVE_FILE_RE.test(normalized) ||
    normalized.startsWith("/") ||
    normalized.includes("../") ||
    normalized === ".."
  ) {
    throw new Error(`${field} must stay inside the app directory`);
  }

  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

function parseSharedFields(data: Record<string, unknown>) {
  for (const field of POST_V01_FIELDS) {
    if (data[field] !== undefined) {
      throw new Error(`floom.yaml does not support field: ${field}`);
    }
  }

  return {
    name: optionalString(data.name),
    slug: requiredString(data.slug, "slug"),
    description: optionalString(data.description),
    public: optionalBoolean(data.public),
    input_schema: optionalRelativePath(data.input_schema, "input_schema"),
    output_schema: optionalRelativePath(data.output_schema, "output_schema"),
    dependencies: parseDependencies(data.dependencies),
    secrets: parseSecretNames(data.secrets),
    bundle_exclude: parseBundleExclude(data.bundle_exclude),
  };
}

export function parseManifest(value: unknown): FloomManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("floom.yaml must contain an object");
  }

  const data = value as Record<string, unknown>;
  const shared = parseSharedFields(data);

  if (!SLUG_RE.test(shared.slug)) {
    throw new Error("slug must be lowercase letters, numbers, and hyphens");
  }

  const hasCommand = optionalString(data.command) !== undefined;
  const hasLegacyFields = data.runtime !== undefined || data.entrypoint !== undefined || data.handler !== undefined;

  if (hasCommand && hasLegacyFields) {
    throw new Error("floom.yaml must use either command: or runtime: python + entrypoint:/handler:, not both");
  }

  if (hasCommand || !hasLegacyFields) {
    return {
      mode: "stock_e2b",
      ...shared,
      command: optionalString(data.command),
    };
  }

  const runtime = requiredString(data.runtime, "runtime");
  const entrypoint = requiredString(data.entrypoint, "entrypoint");
  const handler = requiredString(data.handler, "handler");

  if (runtime !== "python") {
    throw new Error("legacy apps must use runtime: python");
  }

  if (!PYTHON_FILE_RE.test(entrypoint)) {
    throw new Error("entrypoint must be a single Python file basename");
  }

  if (!IDENTIFIER_RE.test(handler)) {
    throw new Error("handler must be a valid Python identifier");
  }

  return {
    mode: "legacy_python",
    ...shared,
    runtime: "python",
    entrypoint,
    handler,
  };
}

function parseDependencies(value: unknown): ManifestDependencies | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("dependencies must be an object");
  }

  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.some((key) => key !== "python")) {
    throw new Error("dependencies only supports python: ./requirements.txt");
  }

  if (data.python === undefined) {
    return undefined;
  }

  if (typeof data.python !== "string" || !PYTHON_DEPENDENCY_RE.test(data.python.trim())) {
    throw new Error("dependencies.python must be ./requirements.txt or ./requirements.txt --require-hashes");
  }

  const normalized = data.python.trim().startsWith("./")
    ? data.python.trim().slice(2)
    : data.python.trim();

  return { python: normalized };
}

function parseSecretNames(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error("secrets must be an array of environment variable names");
  }

  if (value.length > 10) {
    throw new Error("secrets supports at most 10 names");
  }

  const names = value.map((item) => {
    if (typeof item !== "string" || !SECRET_NAME_RE.test(item)) {
      throw new Error("secrets must contain only uppercase environment variable names");
    }
    return item;
  });

  if (new Set(names).size !== names.length) {
    throw new Error("secrets must not contain duplicate names");
  }

  return names;
}

function parseBundleExclude(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error("bundle_exclude must be an array of glob-like strings");
  }

  const patterns = value.map((item) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error("bundle_exclude must contain only non-empty strings");
    }
    return item.trim();
  });

  if (new Set(patterns).size !== patterns.length) {
    throw new Error("bundle_exclude must not contain duplicate values");
  }

  return patterns;
}

export function resolveManifestDisplayName(manifest: FloomManifest) {
  return manifest.name?.trim() || manifest.slug
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function isLegacyPythonManifest(manifest: FloomManifest): manifest is LegacyPythonManifest {
  return manifest.mode === "legacy_python";
}

export function resolvePythonDependencyConfig(
  manifest: FloomManifest
): PythonDependencyConfig | null {
  const spec = manifest.dependencies?.python;
  if (!spec) {
    return null;
  }

  const trimmed = spec.trim();
  const requireHashes =
    trimmed.endsWith("--require-hashes") || isLegacyPythonManifest(manifest);
  const path = trimmed.replace(/\s+--require-hashes$/, "");

  return {
    path: path.startsWith("./") ? path.slice(2) : path,
    requireHashes,
  };
}

export function isSafePythonEntrypoint(value: string) {
  return PYTHON_FILE_RE.test(value);
}

export function isSafePythonIdentifier(value: string) {
  return IDENTIFIER_RE.test(value);
}

export function validatePythonSourceForManifest(source: string, manifest: FloomManifest) {
  if (!isLegacyPythonManifest(manifest)) {
    return;
  }

  if (Buffer.byteLength(source, "utf8") === 0) {
    throw new Error("Entrypoint source is empty");
  }

  const escapedHandler = manifest.handler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const definitionPattern = new RegExp(`(^|\\n)\\s*def\\s+${escapedHandler}\\s*\\(`);
  if (!definitionPattern.test(source)) {
    throw new Error(`Entrypoint must define handler function: ${manifest.handler}`);
  }
}
