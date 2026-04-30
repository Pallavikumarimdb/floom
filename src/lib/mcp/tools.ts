import yaml from "js-yaml";
import type { NextRequest } from "next/server";
import { hasSupabaseConfig } from "@/lib/demo-app";
import { MAX_SCHEMA_BYTES, MAX_SOURCE_BYTES } from "@/lib/floom/limits";
import {
  parseManifest,
  validatePythonSourceForManifest,
  type FloomManifest,
} from "@/lib/floom/manifest";
import { validateJsonSchemaValue } from "@/lib/floom/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthCaller } from "@/lib/supabase/auth";

export type JsonObject = Record<string, unknown>;

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonObject;
};

export type McpToolContent = {
  type: "text";
  text: string;
};

export type McpToolResult = {
  content: McpToolContent[];
  isError?: boolean;
};

export type McpToolContext = {
  baseUrl: string;
  authorization?: string;
};

type FloomToolName =
  | "auth_status"
  | "validate_manifest"
  | "publish_app"
  | "find_candidate_apps"
  | "get_app"
  | "run_app"
  | "create_agent_token";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export const floomTools: McpToolDefinition[] = [
  {
    name: "auth_status",
    description: "Report whether the current Authorization bearer token resolves to a Floom user or agent token.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "validate_manifest",
    description: "Validate a floom.yaml manifest and optional JSON schemas before publishing.",
    inputSchema: {
      type: "object",
      properties: {
        manifest: {
          oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }],
          description: "floom.yaml content as YAML text or an already-parsed object.",
        },
        input_schema: {
          oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }],
          description: "Optional input JSON Schema as JSON text or an object.",
        },
        output_schema: {
          oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }],
          description: "Optional output JSON Schema as JSON text or an object.",
        },
      },
      required: ["manifest"],
      additionalProperties: false,
    },
  },
  {
    name: "publish_app",
    description: "Publish a single-file Python Floom app through the existing app publish API.",
    inputSchema: {
      type: "object",
      properties: {
        manifest: {
          oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }],
          description: "floom.yaml content as YAML text or an already-parsed object.",
        },
        source: {
          type: "string",
          description: "Python source for the manifest entrypoint.",
        },
        input_schema: {
          oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }],
          description: "Input JSON Schema as JSON text or an object.",
        },
        output_schema: {
          oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }],
          description: "Output JSON Schema as JSON text or an object.",
        },
      },
      required: ["manifest", "source", "input_schema", "output_schema"],
      additionalProperties: false,
    },
  },
  {
    name: "find_candidate_apps",
    description: "Find deployable Floom app candidates from caller-provided repository file contents.",
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "object",
          description: "Map of repository-relative file paths to text contents.",
          additionalProperties: { type: "string" },
        },
        max_results: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Maximum candidates to return.",
        },
      },
      required: ["files"],
      additionalProperties: false,
    },
  },
  {
    name: "get_app",
    description: "Fetch metadata and schemas for a public Floom app or an app owned by the bearer token user.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "The Floom app slug.",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "run_app",
    description: "Run a Floom app with JSON inputs. Private apps require an Authorization bearer token.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "The Floom app slug.",
        },
        inputs: {
          type: "object",
          description: "Inputs matching the app input_schema.",
          additionalProperties: true,
        },
      },
      required: ["slug", "inputs"],
      additionalProperties: false,
    },
  },
  {
    name: "create_agent_token",
    description: "Create an agent token for the authenticated Floom user.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Human-readable token name.",
        },
      },
      additionalProperties: false,
    },
  },
];

export async function callFloomTool(
  name: string,
  argumentsValue: unknown,
  context: McpToolContext
): Promise<McpToolResult> {
  try {
    return await callFloomToolUnchecked(name, argumentsValue, context);
  } catch {
    return errorResult("Tool execution failed");
  }
}

async function callFloomToolUnchecked(
  name: string,
  argumentsValue: unknown,
  context: McpToolContext
): Promise<McpToolResult> {
  if (!isKnownTool(name)) {
    return errorResult(`Unknown tool: ${name}`);
  }

  const args = asObject(argumentsValue);
  if (!args) {
    return errorResult("Tool arguments must be an object");
  }

  if (name === "get_app") {
    return getApp(args, context);
  }

  if (name === "run_app") {
    return runApp(args, context);
  }

  if (name === "create_agent_token") {
    return createAgentToken(args, context);
  }

  if (name === "auth_status") {
    return authStatus(context);
  }

  if (name === "validate_manifest") {
    return validateManifest(args);
  }

  if (name === "publish_app") {
    return publishApp(args, context);
  }

  return findCandidateApps(args);
}

function isKnownTool(name: string): name is FloomToolName {
  return floomTools.some((tool) => tool.name === name);
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonObject;
}

function requiredSlug(args: JsonObject): string | null {
  const slug = args.slug;
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return null;
  }

  return slug;
}

async function getApp(args: JsonObject, context: McpToolContext): Promise<McpToolResult> {
  const slug = requiredSlug(args);
  if (!slug) {
    return errorResult("slug must be lowercase letters, numbers, and hyphens");
  }

  return proxyJson(`${context.baseUrl}/api/apps/${encodeURIComponent(slug)}`, {
    method: "GET",
    headers: forwardedHeaders(context),
  });
}

async function runApp(args: JsonObject, context: McpToolContext): Promise<McpToolResult> {
  const slug = requiredSlug(args);
  const inputs = asObject(args.inputs);
  if (!slug) {
    return errorResult("slug must be lowercase letters, numbers, and hyphens");
  }

  if (!inputs) {
    return errorResult("inputs must be an object");
  }

  return proxyJson(`${context.baseUrl}/api/apps/${encodeURIComponent(slug)}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...forwardedHeaders(context),
    },
    body: JSON.stringify({ inputs }),
  });
}

async function createAgentToken(
  args: JsonObject,
  context: McpToolContext
): Promise<McpToolResult> {
  if (!context.authorization) {
    return errorResult("create_agent_token requires an Authorization bearer token");
  }

  const name = args.name;
  if (name !== undefined && typeof name !== "string") {
    return errorResult("name must be a string when provided");
  }

  return proxyJson(`${context.baseUrl}/api/agent-tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...forwardedHeaders(context),
    },
    body: JSON.stringify({
      ...(typeof name === "string" ? { name } : {}),
    }),
  });
}

async function authStatus(context: McpToolContext): Promise<McpToolResult> {
  if (!context.authorization) {
    return okResult({
      authenticated: false,
      authorization: "missing",
      supabase_configured: hasSupabaseConfig(),
    });
  }

  if (!context.authorization.startsWith("Bearer ")) {
    return okResult({
      authenticated: false,
      authorization: "invalid",
      supabase_configured: hasSupabaseConfig(),
    });
  }

  if (!hasSupabaseConfig()) {
    return okResult({
      authenticated: false,
      authorization: "present",
      supabase_configured: false,
    });
  }

  const admin = createAdminClient();
  const req = {
    headers: new Headers({ authorization: context.authorization }),
  } as NextRequest;
  const caller = await resolveAuthCaller(req, admin);

  if (!caller) {
    return okResult({
      authenticated: false,
      authorization: "present",
      supabase_configured: true,
    });
  }

  return okResult({
    authenticated: true,
    caller_type: caller.kind,
    user_id: caller.userId,
    agent_token_id: caller.agentTokenId,
    scopes:
      caller.kind === "agent_token"
        ? caller.scopes
        : ["read", "run", "publish"],
  });
}

function validateManifest(args: JsonObject): McpToolResult {
  const manifestResult = parseManifestArgument(args.manifest);
  if (!manifestResult.ok) {
    return errorResult(manifestResult.error);
  }

  const inputSchemaResult = parseOptionalSchemaArgument(args.input_schema, "input_schema");
  if (!inputSchemaResult.ok) {
    return errorResult(inputSchemaResult.error);
  }

  const outputSchemaResult = parseOptionalSchemaArgument(args.output_schema, "output_schema");
  if (!outputSchemaResult.ok) {
    return errorResult(outputSchemaResult.error);
  }

  return okResult({
    valid: true,
    manifest: manifestResult.manifest,
    schemas: {
      input_schema: inputSchemaResult.provided ? "valid" : "not_provided",
      output_schema: outputSchemaResult.provided ? "valid" : "not_provided",
    },
  });
}

async function publishApp(args: JsonObject, context: McpToolContext): Promise<McpToolResult> {
  if (!context.authorization) {
    return errorResult("publish_app requires an Authorization bearer token");
  }

  const manifestResult = parseManifestArgument(args.manifest);
  if (!manifestResult.ok) {
    return errorResult(manifestResult.error);
  }

  const source = args.source;
  if (typeof source !== "string" || source.trim() === "") {
    return errorResult("source must be a non-empty string");
  }

  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    return errorResult("source is too large");
  }

  try {
    validatePythonSourceForManifest(source, manifestResult.manifest);
  } catch (sourceError) {
    return errorResult(sourceError instanceof Error ? sourceError.message : "Invalid app source");
  }

  const inputSchemaResult = parseRequiredSchemaArgument(args.input_schema, "input_schema");
  if (!inputSchemaResult.ok) {
    return errorResult(inputSchemaResult.error);
  }

  const outputSchemaResult = parseRequiredSchemaArgument(args.output_schema, "output_schema");
  if (!outputSchemaResult.ok) {
    return errorResult(outputSchemaResult.error);
  }

  const form = new FormData();
  form.append("manifest", textBlob(manifestToYaml(manifestResult.manifest), "application/x-yaml"), "floom.yaml");
  form.append("bundle", textBlob(source, "text/x-python"), manifestResult.manifest.entrypoint);
  form.append("input_schema", textBlob(JSON.stringify(inputSchemaResult.schema), "application/json"), "input.schema.json");
  form.append("output_schema", textBlob(JSON.stringify(outputSchemaResult.schema), "application/json"), "output.schema.json");

  return proxyJson(`${context.baseUrl}/api/apps`, {
    method: "POST",
    headers: forwardedHeaders(context),
    body: form,
  });
}

function findCandidateApps(args: JsonObject): McpToolResult {
  const files = asStringMap(args.files);
  if (!files) {
    return errorResult("files must be an object mapping paths to text contents");
  }

  const maxResults =
    typeof args.max_results === "number" &&
    Number.isInteger(args.max_results) &&
    args.max_results >= 1 &&
    args.max_results <= 50
      ? args.max_results
      : 20;

  const manifestCandidates = Object.entries(files)
    .filter(([filePath]) => basename(filePath) === "floom.yaml")
    .slice(0, maxResults)
    .map(([manifestPath, manifestText]) => {
      const appDir = dirname(manifestPath);
      const errors: string[] = [];
      let manifest: FloomManifest | null = null;

      try {
        manifest = parseManifest(yaml.load(manifestText));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Invalid floom.yaml");
      }

      if (manifest) {
        const entrypointPath = joinPath(appDir, manifest.entrypoint);
        if (!(entrypointPath in files)) {
          errors.push(`Missing entrypoint: ${entrypointPath}`);
        }

        for (const unsupportedPath of unsupportedV0Files(appDir, files)) {
          errors.push(`${unsupportedPath} is not supported in v0`);
        }

        const inputSchemaPath = joinPath(appDir, manifest.input_schema || "input.schema.json");
        const outputSchemaPath = joinPath(appDir, manifest.output_schema || "output.schema.json");
        validateCandidateSchema(files, inputSchemaPath, "input_schema", errors);
        validateCandidateSchema(files, outputSchemaPath, "output_schema", errors);
      }

      return {
        manifest_path: manifestPath,
        app_dir: appDir || ".",
        slug: manifest?.slug ?? null,
        name: manifest?.name ?? null,
        runtime: manifest?.runtime ?? null,
        entrypoint: manifest?.entrypoint ?? null,
        valid: errors.length === 0,
        errors,
        unsupported_reason: errors.length === 0 ? null : errors.join("; "),
      };
    });

  const candidates = [
    ...manifestCandidates,
    ...unsupportedRepositoryCandidates(files).slice(0, Math.max(0, maxResults - manifestCandidates.length)),
  ];

  return okResult({
    candidates,
    count: candidates.length,
  });
}

function unsupportedV0Files(appDir: string, files: Record<string, string>) {
  return ["requirements.txt", "pyproject.toml", "package.json", "openapi.json"]
    .map((fileName) => joinPath(appDir, fileName))
    .filter((filePath) => filePath in files);
}

function unsupportedRepositoryCandidates(files: Record<string, string>) {
  if (Object.keys(files).some((filePath) => basename(filePath) === "floom.yaml")) {
    return [];
  }

  const fileNames = new Set(Object.keys(files).map((filePath) => basename(filePath)));
  const fileText = Object.values(files).join("\n");
  const candidates = [];

  if (fileNames.has("openapi.json") || /FastAPI\s*\(/.test(fileText)) {
    candidates.push(unsupportedCandidate("FastAPI/OpenAPI apps require the post-v0 HTTP app runner"));
  }

  if (fileNames.has("requirements.txt") || fileNames.has("pyproject.toml")) {
    candidates.push(unsupportedCandidate("Python dependencies require the post-v0 dependency installer"));
  }

  if (fileNames.has("package.json")) {
    candidates.push(unsupportedCandidate("TypeScript/Node apps require the post-v0 TypeScript runner"));
  }

  return candidates;
}

function unsupportedCandidate(reason: string) {
  return {
    manifest_path: null,
    app_dir: ".",
    slug: null,
    name: null,
    runtime: null,
    entrypoint: null,
    valid: false,
    errors: [reason],
    unsupported_reason: reason,
  };
}

async function proxyJson(url: string, init: RequestInit): Promise<McpToolResult> {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return errorResult("Floom origin is not configured");
  }

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({
      error: `Upstream returned ${response.status}`,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
      isError: !response.ok,
    };
  } catch {
    return errorResult("Upstream request failed");
  }
}

function forwardedHeaders(context: McpToolContext): HeadersInit {
  return context.authorization ? { Authorization: context.authorization } : {};
}

function parseManifestArgument(
  manifestValue: unknown
): { ok: true; manifest: FloomManifest } | { ok: false; error: string } {
  try {
    const value =
      typeof manifestValue === "string" ? yaml.load(manifestValue) : manifestValue;
    return { ok: true, manifest: parseManifest(value) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid floom.yaml",
    };
  }
}

function parseOptionalSchemaArgument(
  value: unknown,
  field: string
):
  | { ok: true; provided: boolean; schema?: JsonObject }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, provided: false };
  }

  const result = parseRequiredSchemaArgument(value, field);
  if (!result.ok) {
    return result;
  }

  return { ok: true, provided: true, schema: result.schema };
}

function parseRequiredSchemaArgument(
  value: unknown,
  field: string
): { ok: true; schema: JsonObject } | { ok: false; error: string } {
  try {
    const schemaText =
      typeof value === "string" ? value : JSON.stringify(value ?? null);
    if (Buffer.byteLength(schemaText, "utf8") > MAX_SCHEMA_BYTES) {
      return { ok: false, error: `${field} is too large` };
    }

    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return validateJsonSchemaValue(parsed, field);
  } catch {
    return { ok: false, error: `${field} must be valid JSON` };
  }
}

function manifestToYaml(manifest: FloomManifest) {
  return yaml.dump({
    name: manifest.name,
    slug: manifest.slug,
    runtime: manifest.runtime,
    entrypoint: manifest.entrypoint,
    handler: manifest.handler,
    public: manifest.public ?? false,
    ...(manifest.input_schema ? { input_schema: manifest.input_schema } : {}),
    ...(manifest.output_schema ? { output_schema: manifest.output_schema } : {}),
  });
}

function textBlob(text: string, type: string) {
  return new Blob([text], { type });
}

function asStringMap(value: unknown): Record<string, string> | null {
  const object = asObject(value);
  if (!object) {
    return null;
  }

  const entries = Object.entries(object);
  if (!entries.every(([, fileText]) => typeof fileText === "string")) {
    return null;
  }

  return object as Record<string, string>;
}

function validateCandidateSchema(
  files: Record<string, string>,
  schemaPath: string,
  field: string,
  errors: string[]
) {
  const schemaText = files[schemaPath];
  if (schemaText === undefined) {
    errors.push(`Missing ${field}: ${schemaPath}`);
    return;
  }

  const result = parseRequiredSchemaArgument(schemaText, field);
  if (!result.ok) {
    errors.push(`${schemaPath}: ${result.error}`);
  }
}

function basename(filePath: string) {
  const normalized = normalizePath(filePath);
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? normalized;
}

function dirname(filePath: string) {
  const normalized = normalizePath(filePath);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

function joinPath(dir: string, filePath: string) {
  const normalizedFilePath = normalizePath(filePath);
  if (!dir || normalizedFilePath.startsWith("/")) {
    return normalizedFilePath.replace(/^\//, "");
  }

  return normalizePath(`${dir}/${normalizedFilePath}`);
}

function normalizePath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function okResult(data: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(message: string): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
    isError: true,
  };
}
