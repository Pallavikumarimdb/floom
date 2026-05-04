export type SecretScope = "shared" | "per_runner";

export type ManifestSecret = {
  name: string;
  scope: SecretScope;
};

export type ManifestDependencies = {
  python?: string;
};

/**
 * Schema field: either a relative-path string (e.g. "./input.schema.json")
 * or an inline JSON Schema object (embedded directly in floom.yaml).
 *
 * Inline form is the default and preferred — no separate file needed.
 * Path form is the legacy escape hatch for very large or shared schemas.
 */
export type SchemaField = string | Record<string, unknown>;

type SharedManifestFields = {
  mode: "stock_e2b" | "legacy_python";
  name?: string;
  slug: string;
  description?: string;
  public?: boolean;
  input_schema?: SchemaField;
  output_schema?: SchemaField;
  dependencies?: ManifestDependencies;
  secrets?: ManifestSecret[];
  /** Preferred field name for service integrations (Composio-backed). */
  integrations?: string[];
  /** @deprecated Use `integrations:` instead. Kept as alias for backwards compatibility. */
  composio?: string[];
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

/**
 * Parse an input_schema or output_schema field from floom.yaml.
 *
 * Accepts two forms:
 *   - string path: "./input.schema.json" — resolved at bundle-validate time (legacy)
 *   - inline object: { type: "object", ... } — embedded directly in floom.yaml (default)
 *
 * Returns the value as-is (normalized path string or object), or undefined when absent.
 * Path safety is checked here; JSON Schema validity is checked by schema.ts at bundle time.
 */
function parseSchemaField(value: unknown, field: string): SchemaField | undefined {
  if (value === undefined) {
    return undefined;
  }

  // Inline object — preferred form, no separate file needed
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  // Path reference — legacy escape hatch for large/shared schemas
  if (typeof value === "string") {
    const normalized = value.trim().replace(/\\/g, "/");
    if (
      normalized === "" ||
      !RELATIVE_FILE_RE.test(normalized) ||
      normalized.startsWith("/") ||
      normalized.includes("../") ||
      normalized === ".."
    ) {
      throw new Error(`${field} must stay inside the app directory`);
    }
    return normalized.startsWith("./") ? normalized.slice(2) : normalized;
  }

  throw new Error(`${field} must be a relative file path or an inline JSON Schema object`);
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
    input_schema: parseSchemaField(data.input_schema, "input_schema"),
    output_schema: parseSchemaField(data.output_schema, "output_schema"),
    dependencies: parseDependencies(data.dependencies),
    secrets: parseSecrets(data.secrets),
    integrations: parseIntegrations(data.integrations, data.composio as unknown),
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

/**
 * Normalize scope string to the canonical DB form.
 * "per-runner" (hyphen) is accepted as a legacy alias for "per_runner" (underscore).
 * All other values pass through unchanged (validation happens at the call site).
 */
function normalizeScope(raw: unknown): SecretScope {
  if (raw === "per-runner") return "per_runner"; // legacy alias
  return raw as SecretScope;
}

/**
 * Parse the secrets field from floom.yaml.
 * Accepts two forms (backwards compat):
 *   - bare string: "OPENAI_API_KEY"  -> { name, scope: "shared" }
 *   - object form: { name: "OPENAI_API_KEY", scope: "per_runner" }
 * Default scope for object form with no explicit scope = "per_runner".
 * Legacy: scope: "per-runner" (hyphen) is accepted as alias for "per_runner".
 */
export function parseSecrets(value: unknown): ManifestSecret[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error("secrets must be an array of environment variable names or {name, scope} objects");
  }

  if (value.length > 10) {
    throw new Error("secrets supports at most 10 names");
  }

  const secrets = value.map((item): ManifestSecret => {
    if (typeof item === "string") {
      if (!SECRET_NAME_RE.test(item)) {
        throw new Error("secrets must contain only uppercase environment variable names");
      }
      return { name: item, scope: "shared" };
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      if (!SECRET_NAME_RE.test(name)) {
        throw new Error("secrets object must have a valid uppercase name");
      }
      const scopeRaw = obj.scope;
      if (scopeRaw !== undefined && scopeRaw !== "shared" && scopeRaw !== "per_runner" && scopeRaw !== "per-runner") {
        throw new Error(`secrets scope must be "shared" or "per_runner"`);
      }
      const scope: SecretScope = normalizeScope(scopeRaw ?? "per_runner");
      return { name, scope };
    }
    throw new Error("secrets must contain only uppercase environment variable names or {name, scope} objects");
  });

  const names = secrets.map((s) => s.name);
  if (new Set(names).size !== names.length) {
    throw new Error("secrets must not contain duplicate names");
  }

  return secrets;
}

/**
 * Extract secret names from a ManifestSecret array.
 * Used by callers that only need the names (bundle.ts, mcp/tools.ts).
 */
export function secretNames(secrets: ManifestSecret[] | undefined): string[] {
  return secrets?.map((s) => s.name) ?? [];
}

const TOOLKIT_SLUG_RE = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * Parse a list of integration/toolkit slugs from a YAML field value.
 * Accepts a single string or an array of strings.
 * Each value must match ^[a-z][a-z0-9-]{0,63}$ (Composio provider slug format).
 *
 * Returns an empty array (not undefined) when absent -- matches the DB column default.
 */
function parseToolkitSlugs(value: unknown, fieldName: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  const raw: unknown[] = typeof value === "string" ? [value] : Array.isArray(value) ? value : null!;
  if (!Array.isArray(raw)) {
    throw new Error(`${fieldName} must be a toolkit slug string or an array of toolkit slug strings`);
  }

  if (raw.length > 20) {
    throw new Error(`${fieldName} supports at most 20 toolkit entries`);
  }

  const slugs = raw.map((item, idx): string => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error(`${fieldName}[${idx}] must be a non-empty string`);
    }
    const slug = item.trim().toLowerCase();
    if (!TOOLKIT_SLUG_RE.test(slug)) {
      throw new Error(
        `${fieldName} toolkit slug "${slug}" is invalid -- must start with a lowercase letter and contain only lowercase letters, digits, and hyphens`
      );
    }
    return slug;
  });

  if (new Set(slugs).size !== slugs.length) {
    throw new Error(`${fieldName} must not contain duplicate toolkit slugs`);
  }

  return slugs;
}

/**
 * Parse the integrations: field (preferred) or the deprecated composio: field.
 *
 * If both are present, throws an error asking the author to pick one.
 * If only composio: is present, returns its value (backwards compat — no error).
 *
 * Examples (preferred):
 *   integrations: gmail
 *   integrations:
 *     - gmail
 *     - slack
 *
 * Deprecated (still accepted):
 *   composio: gmail
 */
export function parseIntegrations(integrationsRaw: unknown, composioRaw?: unknown): string[] {
  const hasIntegrations = integrationsRaw !== undefined && integrationsRaw !== null;
  const hasComposio = composioRaw !== undefined && composioRaw !== null;

  if (hasIntegrations && hasComposio) {
    throw new Error(
      "Both 'integrations:' and 'composio:' are declared in floom.yaml. Remove 'composio:' — it is deprecated in favour of 'integrations:'."
    );
  }

  if (hasComposio && !hasIntegrations) {
    // Silent acceptance: existing apps continue to work unchanged.
    return parseToolkitSlugs(composioRaw, "composio");
  }

  return parseToolkitSlugs(integrationsRaw, "integrations");
}

/**
 * @deprecated Use parseIntegrations instead.
 */
export function parseComposioToolkits(value: unknown): string[] {
  return parseToolkitSlugs(value, "composio");
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
