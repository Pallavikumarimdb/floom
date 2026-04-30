export type FloomManifest = {
  name: string;
  slug: string;
  runtime: "python";
  entrypoint: string;
  handler: string;
  public?: boolean;
  input_schema?: string;
  output_schema?: string;
  dependencies?: {
    python?: "requirements.txt";
  };
  secrets?: string[];
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const PYTHON_FILE_RE = /^[A-Za-z_][A-Za-z0-9_]*\.py$/;
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

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
  const manifest: FloomManifest = {
    name: requiredString(data.name, "name"),
    slug: requiredString(data.slug, "slug"),
    runtime: requiredString(data.runtime, "runtime") as FloomManifest["runtime"],
    entrypoint: requiredString(data.entrypoint, "entrypoint"),
    handler: requiredString(data.handler, "handler"),
    public: data.public === true,
    input_schema: typeof data.input_schema === "string" ? data.input_schema : undefined,
    output_schema: typeof data.output_schema === "string" ? data.output_schema : undefined,
    dependencies: parseDependencies(data.dependencies),
    secrets: parseSecretNames(data.secrets),
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

function parseDependencies(value: unknown): FloomManifest["dependencies"] {
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

  if (data.python !== "requirements.txt" && data.python !== "./requirements.txt") {
    throw new Error("dependencies.python must be ./requirements.txt");
  }

  return { python: "requirements.txt" };
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
