export type FloomManifest = {
  name: string;
  slug: string;
  runtime: "python";
  entrypoint: string;
  handler: string;
  public?: boolean;
  input_schema?: string;
  output_schema?: string;
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const PYTHON_FILE_RE = /^[A-Za-z_][A-Za-z0-9_]*\.py$/;
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing ${field} in floom.yaml`);
  }
  return value.trim();
}

export function parseManifest(value: unknown): FloomManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("floom.yaml must contain an object");
  }

  const data = value as Record<string, unknown>;
  if (data.actions !== undefined) {
    throw new Error("v0 only supports one handler per app; actions are not supported");
  }
  if (data.dependencies !== undefined) {
    throw new Error("v0 only supports stdlib single-file Python apps; dependencies are not supported");
  }
  if (data.secrets !== undefined) {
    throw new Error("v0 does not support app secrets yet");
  }

  const manifest: FloomManifest = {
    name: requiredString(data.name, "name"),
    slug: requiredString(data.slug, "slug"),
    runtime: requiredString(data.runtime, "runtime") as FloomManifest["runtime"],
    entrypoint: requiredString(data.entrypoint, "entrypoint"),
    handler: requiredString(data.handler, "handler"),
    public: data.public === true,
    input_schema: typeof data.input_schema === "string" ? data.input_schema : undefined,
    output_schema: typeof data.output_schema === "string" ? data.output_schema : undefined,
  };

  if (manifest.runtime !== "python") {
    throw new Error("v0 only supports runtime: python");
  }

  if (!SLUG_RE.test(manifest.slug)) {
    throw new Error("slug must be lowercase letters, numbers, and hyphens");
  }

  if (!PYTHON_FILE_RE.test(manifest.entrypoint)) {
    throw new Error("entrypoint must be a single Python file basename");
  }

  if (!IDENTIFIER_RE.test(manifest.handler)) {
    throw new Error("handler must be a valid Python identifier");
  }

  return manifest;
}

export function isSafePythonEntrypoint(value: string) {
  return PYTHON_FILE_RE.test(value);
}

export function isSafePythonIdentifier(value: string) {
  return IDENTIFIER_RE.test(value);
}

export function validatePythonSourceForManifest(source: string, manifest: FloomManifest) {
  if (Buffer.byteLength(source, "utf8") === 0) {
    throw new Error("Entrypoint source is empty");
  }

  const escapedHandler = manifest.handler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const definitionPattern = new RegExp(`(^|\\n)\\s*def\\s+${escapedHandler}\\s*\\(`);
  if (!definitionPattern.test(source)) {
    throw new Error(`Entrypoint must define handler function: ${manifest.handler}`);
  }
}
