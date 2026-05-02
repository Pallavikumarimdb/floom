import yaml from "js-yaml";
import type { NextRequest } from "next/server";
import { hasSupabaseConfig } from "@/lib/demo-app";
import { createBundleFromFileMap } from "@/lib/floom/bundle";
import {
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES,
  MAX_REQUIREMENTS_BYTES,
  MAX_REQUEST_BYTES,
  MAX_SCHEMA_BYTES,
  MAX_SOURCE_BYTES,
  SANDBOX_TIMEOUT_MS,
} from "@/lib/floom/limits";
import {
  isLegacyPythonManifest,
  parseManifest,
  validatePythonSourceForManifest,
  type FloomManifest,
} from "@/lib/floom/manifest";
import { validatePythonRequirementsText } from "@/lib/floom/requirements";
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
  | "get_app_contract"
  | "list_app_templates"
  | "get_app_template"
  | "validate_manifest"
  | "publish_app"
  | "find_candidate_apps"
  | "get_app"
  | "run_app";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const MAX_MCP_FILE_COUNT = 500;
const MAX_MCP_FILE_PATH_BYTES = 256;
const MAX_MCP_FILE_BYTES = MAX_SOURCE_BYTES;

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
    name: "get_app_contract",
    description: "Call this first. Return the preferred stock-E2B Floom contract, legacy v0.1 compatibility notes, hard limits, run response envelope, and starter files.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "list_app_templates",
    description: "List useful stock-E2B Floom starter app templates that agents can copy before publishing.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_app_template",
    description: "Return one copy-paste Floom app template bundle.",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Template key from list_app_templates.",
        },
      },
      required: ["key"],
      additionalProperties: false,
    },
  },
  {
    name: "validate_manifest",
    description: "Validate a floom.yaml manifest and optional JSON schemas. Optional source/files hints return stock-E2B contract coaching, but this does not publish.",
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
        source: {
          type: "string",
          description: "Optional entrypoint source hint for runtime coaching only. Do not include raw secret values.",
        },
        files: {
          type: "object",
          description: "Optional repository file map hint for runtime coaching only. Do not include raw secret values.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["manifest"],
      additionalProperties: false,
    },
  },
  {
    name: "publish_app",
    description: "Run the full publish check and publish a Floom app through the stock-E2B publish API. Requires Authorization: Bearer <agent-token>; call auth_status first when unsure.",
    inputSchema: {
      type: "object",
      properties: {
        manifest: {
          oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }],
          description: "floom.yaml content as YAML text or an already-parsed object.",
        },
        files: {
          type: "object",
          description: "Repository file map keyed by app-relative path. Preferred for stock-E2B multi-file publish.",
          additionalProperties: { type: "string" },
        },
        source: {
          type: "string",
          description: "Legacy shortcut for one-file Python source. Prefer files for multi-file or non-Python apps.",
        },
        input_schema: {
          oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }],
          description: "Optional input JSON Schema as JSON text or an object. Used only by the legacy one-file shortcut.",
        },
        output_schema: {
          oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }],
          description: "Optional output JSON Schema as JSON text or an object. Used only by the legacy one-file shortcut.",
        },
        requirements: {
          type: "string",
          description: "Optional requirements.txt content for the legacy one-file shortcut.",
        },
      },
      required: ["manifest"],
      additionalProperties: false,
    },
  },
  {
    name: "find_candidate_apps",
    description: "Scan a repository file map for directories that already contain floom.yaml and are ready, invalid, or need contract fixes for stock-E2B publish.",
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
    description: "Run a Floom app with optional JSON inputs. Returns { execution_id, status, output, error }. Private apps require Authorization: Bearer <agent-token>.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "The Floom app slug.",
        },
        inputs: {
          description: "Optional JSON inputs. If the app declares input_schema they must match it; otherwise they pass through as raw JSON.",
        },
      },
      required: ["slug"],
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

  const argumentSize = jsonByteLength(args);
  if (argumentSize === null || argumentSize > MAX_REQUEST_BYTES) {
    return errorResult("Tool arguments are too large");
  }

  if (name === "get_app") {
    return getApp(args, context);
  }

  if (name === "run_app") {
    return runApp(args, context);
  }

  if (name === "auth_status") {
    return authStatus(context);
  }

  if (name === "get_app_contract") {
    return getAppContract();
  }

  if (name === "list_app_templates") {
    return listAppTemplates();
  }

  if (name === "get_app_template") {
    return getAppTemplate(args);
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

  const inputSize = jsonByteLength(inputs);
  if (inputSize === null || inputSize > MAX_INPUT_BYTES) {
    return errorResult("inputs are too large");
  }

  const body = JSON.stringify({ inputs });
  if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) {
    return errorResult("run_app request body is too large");
  }

  return proxyJson(`${context.baseUrl}/api/apps/${encodeURIComponent(slug)}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...forwardedHeaders(context),
    },
    body,
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

function getAppContract(): McpToolResult {
  return okResult({
    version: "v0.x-stock-e2b",
    use_this_first:
      "Before generating files, call get_app_contract. Before publishing, call auth_status. For existing repos, call find_candidate_apps. For a starter, call list_app_templates then get_app_template.",
    preferred_mode: "stock_e2b",
    supported: [
      "tarball bundle of the whole app directory rooted at floom.yaml",
      "stock E2B base runtimes such as Python and Node when your command can run there",
      "multi-file projects",
      "optional input_schema and optional output_schema",
      "requirements.txt auto-install when present; npm install when package.json is present",
      "stdin plus FLOOM_INPUTS env injection for the same JSON inputs",
      "manifest-declared secret names with owner-managed encrypted secret values; never hardcode credential-looking strings in source, manifests, docs, MCP prompts, or reports",
      "public apps with public: true; private apps when public is omitted or false",
      "legacy v0.1 runtime: python + entrypoint + handler manifests remain supported",
    ],
    unsupported: [
      {
        case: "bundle larger than 5 MB compressed or 25 MB unpacked",
        reason: "publish rejects oversized bundles even after default exclusions.",
      },
      {
        case: "symlinks, hardlinks, device files, FIFOs, or path traversal inside bundles",
        reason: "publish rejects unsafe bundle structure before storage upload.",
      },
      {
        case: "long-running sync jobs beyond 60 seconds",
        reason: "stock-E2B mode still runs through the current synchronous 60-second execution cap; async + poll ships separately.",
      },
      {
        case: "HTTP server routing or multi-action tool contracts",
        reason: "this branch widens what runs inside E2B, but it still exposes one run endpoint and one UI surface per app.",
      },
    ],
    files: {
      "floom.yaml": [
        "name: Text Demo",
        "slug: text-demo",
        "description: Echo text and return a length.",
        "command: python app.py",
        "public: true",
        "input_schema: ./input.schema.json",
        "output_schema: ./output.schema.json",
        "# Optional:",
        "# dependencies:",
        "#   python: ./requirements.txt --require-hashes",
        "# secrets:",
        "#   - OPENAI_API_KEY",
      ].join("\n"),
      "app.py": [
        "import json",
        "import os",
        "import sys",
        "",
        "def main():",
        "    raw = os.environ.get('FLOOM_INPUTS') or sys.stdin.read() or '{}'",
        "    inputs = json.loads(raw)",
        "    text = str(inputs.get('text', ''))",
        "    print(json.dumps({'result': f'Hello: {text}', 'length': len(text)}))",
        "",
        "if __name__ == '__main__':",
        "    main()",
      ].join("\n"),
      "input.schema.json": {
        type: "object",
        required: ["text"],
        additionalProperties: false,
        properties: {
          text: {
            type: "string",
            title: "Text",
            default: "Hello from Floom",
          },
        },
      },
      "output.schema.json": {
        type: "object",
        required: ["result", "length"],
        additionalProperties: false,
        properties: {
          result: {
            type: "string",
            title: "Result",
          },
          length: {
            type: "integer",
            title: "Length",
          },
        },
      },
    },
    accepted_manifest_keys: [
      "name",
      "slug",
      "description",
      "command",
      "runtime",
      "entrypoint",
      "handler",
      "public",
      "input_schema",
      "output_schema",
      "dependencies",
      "secrets",
      "bundle_exclude",
    ],
    manifest_modes: {
      preferred: "command-based stock E2B manifest",
      legacy_supported: "runtime: python + entrypoint: app.py + handler: run",
    },
    limits: {
      bundle_compressed_bytes: 5 * 1024 * 1024,
      bundle_unpacked_bytes: 25 * 1024 * 1024,
      max_source_bytes: MAX_SOURCE_BYTES,
      max_requirements_bytes: MAX_REQUIREMENTS_BYTES,
      max_schema_bytes: MAX_SCHEMA_BYTES,
      max_input_bytes: MAX_INPUT_BYTES,
      max_output_bytes: MAX_OUTPUT_BYTES,
      max_mcp_request_bytes: MAX_REQUEST_BYTES,
      run_timeout_ms: SANDBOX_TIMEOUT_MS,
      public_run_rate_limit: "defaults: 20 runs per anonymous caller per 60s and 100 runs per app per 60s; owner runs skip the public per-caller limit.",
      per_app_e2b_quota_seconds_per_day: 30 * 60,
      per_owner_e2b_quota_seconds_per_day: 2 * 60 * 60,
      max_secret_names: 10,
    },
    response_shapes: {
      run_app: {
        execution_id: "string",
        status: "success | failed | timed_out",
        output: "validated JSON when output_schema is declared, parsed JSON when stdout last line is JSON, otherwise { stdout, exit_code }",
        error: "null | { phase, stderr_tail, exit_code?, elapsed_ms?, detail? }",
      },
      publish_app: {
        app: {
          slug: "string",
          url: "https://floom.dev/p/<slug>",
        },
        warnings: "string[]",
      },
      get_app: {
        app: "metadata plus optional input_schema and output_schema for public apps or owner-accessible private apps",
      },
    },
    requirements_example: [
      "requirements.txt installs automatically when present.",
      "Hash locking is optional in stock-E2B mode and stays available as an opt-in.",
      "Example:",
      "humanize==4.9.0 --hash=sha256:ce284a76d5b1377fd8836733b983bfb0b76f1aa1c090de2566fcf008d7f6ab16",
      "Then declare dependencies.python: ./requirements.txt --require-hashes in floom.yaml.",
    ],
    requirements_workflow: [
      "printf 'humanize==4.9.0\\n' > requirements.in",
      "python -m pip install --upgrade pip pip-tools",
      "python -m piptools compile --generate-hashes --output-file requirements.txt requirements.in",
      "npx @floomhq/cli@latest deploy --dry-run",
    ],
    auth_and_access: {
      token_source: "Run `npx @floomhq/cli@latest setup` for browser-authorized token setup. MCP cannot mint or reveal raw tokens. Manual token management is available at https://floom.dev/tokens.",
      header: "Authorization: Bearer <agent-token>",
      public_apps: "public: true apps allow anonymous metadata and runs, including secret-backed runs, with per-caller and per-app rate limits.",
      private_apps: "public omitted or false apps require the owner session or owner agent token for get_app and run_app.",
      secrets: "MCP can publish and run apps that declare secret names in floom.yaml, but it does not set raw secret values today. Set values through the CLI or REST /api/apps/:slug/secrets route. Runtime injects them as env vars, exact secret values are redacted from output, and MCP never returns raw secret values.",
      hardcoded_credentials:
        "Credential-looking string guidance: if source or docs contain a hardcoded token, key, password, private key, or similar value, replace it with a declared secret name such as OPENAI_API_KEY and read os.environ['OPENAI_API_KEY'] at runtime. Set the value with `npx @floomhq/cli@latest secrets set <app-slug> OPENAI_API_KEY --value-stdin` or the REST /api/apps/:slug/secrets route. Do not paste raw secret values into MCP tool arguments.",
    },
    setup_commands: [
      "npx @floomhq/cli@latest setup",
      "mkdir my-floom-app && cd my-floom-app",
      "npx @floomhq/cli@latest init --name \"Text Demo\" --slug text-demo-<unique-suffix> --description \"Echo text and return a length.\" --type custom",
      "npx @floomhq/cli@latest deploy --dry-run",
      "npx @floomhq/cli@latest deploy",
      "npx @floomhq/cli@latest run text-demo-<unique-suffix> '{\"text\":\"Hello from Floom\"}' --json",
    ],
    template_guidance:
      "Templates include fixed example slugs. Change the slug to a unique 3-64 character lowercase slug before publishing.",
    templates_tool: {
      list: "list_app_templates",
      get: "get_app_template",
      available_keys: Object.keys(APP_TEMPLATES),
    },
    publish_command:
      "FLOOM_TOKEN=<agent-token> FLOOM_API_URL=https://floom.dev npx @floomhq/cli@latest deploy",
    publish_tool: {
      name: "publish_app",
      requires_authorization: true,
      note: "Use this full publish check from MCP clients when you already have floom.yaml and the app file map in memory. The legacy source shortcut still works for v0.1-style Python apps.",
    },
    run_tool: {
      name: "run_app",
      requires_authorization_for_private_apps: true,
      response_envelope: "Read result.output for the app result; the top level contains execution_id, status, output, and error.",
    },
  });
}

type AppTemplate = {
  key: string;
  name: string;
  description: string;
  useful_for: string;
  files: Record<string, string | JsonObject>;
  example_inputs: JsonObject;
};

const APP_TEMPLATES: Record<string, AppTemplate> = {
  invoice_calculator: {
    key: "invoice_calculator",
    name: "Invoice Calculator",
    description: "Calculate line-item subtotal, discount, tax, and invoice total.",
    useful_for: "Quotes, invoices, and lightweight internal billing calculators.",
    files: {
      "floom.yaml": [
        "name: Invoice Calculator",
        "slug: invoice-calculator",
        "runtime: python",
        "entrypoint: app.py",
        "handler: run",
        "public: true",
        "input_schema: ./input.schema.json",
        "output_schema: ./output.schema.json",
      ].join("\n"),
      "app.py": [
        "from decimal import Decimal, ROUND_HALF_UP",
        "",
        "",
        "def money(value):",
        "    return Decimal(str(value or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)",
        "",
        "",
        "def run(inputs: dict) -> dict:",
        "    items = inputs.get('items') or []",
        "    currency = str(inputs.get('currency') or 'USD').upper()[:8]",
        "    discount_rate = Decimal(str(inputs.get('discount_percent') or 0)) / Decimal('100')",
        "    tax_rate = Decimal(str(inputs.get('tax_rate_percent') or 0)) / Decimal('100')",
        "    lines = []",
        "    subtotal = Decimal('0')",
        "    for item in items:",
        "        description = str(item.get('description') or 'Item')",
        "        quantity = Decimal(str(item.get('quantity') or 0))",
        "        unit_price = Decimal(str(item.get('unit_price') or 0))",
        "        line_total = money(quantity * unit_price)",
        "        subtotal += line_total",
        "        lines.append({",
        "            'description': description,",
        "            'quantity': float(quantity),",
        "            'unit_price': float(money(unit_price)),",
        "            'line_total': float(line_total),",
        "        })",
        "    subtotal = money(subtotal)",
        "    discount = money(subtotal * discount_rate)",
        "    taxable = money(subtotal - discount)",
        "    tax = money(taxable * tax_rate)",
        "    total = money(taxable + tax)",
        "    return {",
        "        'currency': currency,",
        "        'line_items': lines,",
        "        'subtotal': float(subtotal),",
        "        'discount': float(discount),",
        "        'tax': float(tax),",
        "        'total': float(total),",
        "    }",
      ].join("\n"),
      "input.schema.json": {
        type: "object",
        required: ["items"],
        additionalProperties: false,
        properties: {
          currency: { type: "string", title: "Currency", default: "USD" },
          discount_percent: { type: "number", title: "Discount %", default: 0, minimum: 0 },
          tax_rate_percent: { type: "number", title: "Tax %", default: 0, minimum: 0 },
          items: {
            type: "array",
            title: "Line items",
            minItems: 1,
            items: {
              type: "object",
              required: ["description", "quantity", "unit_price"],
              additionalProperties: false,
              properties: {
                description: { type: "string", title: "Description" },
                quantity: { type: "number", title: "Quantity", minimum: 0 },
                unit_price: { type: "number", title: "Unit price", minimum: 0 },
              },
            },
            default: [
              { description: "Strategy session", quantity: 2, unit_price: 250 },
              { description: "Implementation", quantity: 1, unit_price: 900 },
            ],
          },
        },
      },
      "output.schema.json": {
        type: "object",
        required: ["currency", "line_items", "subtotal", "discount", "tax", "total"],
        additionalProperties: false,
        properties: {
          currency: { type: "string", title: "Currency" },
          subtotal: { type: "number", title: "Subtotal" },
          discount: { type: "number", title: "Discount" },
          tax: { type: "number", title: "Tax" },
          total: { type: "number", title: "Total" },
          line_items: {
            type: "array",
            title: "Line items",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                description: { type: "string" },
                quantity: { type: "number" },
                unit_price: { type: "number" },
                line_total: { type: "number" },
              },
            },
          },
        },
      },
    },
    example_inputs: {
      currency: "USD",
      discount_percent: 5,
      tax_rate_percent: 8.5,
      items: [
        { description: "Strategy session", quantity: 2, unit_price: 250 },
        { description: "Implementation", quantity: 1, unit_price: 900 },
      ],
    },
  },
  utm_url_builder: {
    key: "utm_url_builder",
    name: "UTM URL Builder",
    description: "Append clean UTM parameters to a landing-page URL.",
    useful_for: "Campaign links, launch tracking, and partner links.",
    files: {
      "floom.yaml": [
        "name: UTM URL Builder",
        "slug: utm-url-builder",
        "runtime: python",
        "entrypoint: app.py",
        "handler: run",
        "public: true",
        "input_schema: ./input.schema.json",
        "output_schema: ./output.schema.json",
      ].join("\n"),
      "app.py": [
        "from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit",
        "",
        "",
        "def run(inputs: dict) -> dict:",
        "    base_url = str(inputs.get('base_url') or '').strip()",
        "    if not base_url:",
        "        return {'url': '', 'params': {}, 'warning': 'Add a base URL.'}",
        "    parts = urlsplit(base_url)",
        "    existing = dict(parse_qsl(parts.query, keep_blank_values=True))",
        "    mapping = {",
        "        'utm_source': inputs.get('source'),",
        "        'utm_medium': inputs.get('medium'),",
        "        'utm_campaign': inputs.get('campaign'),",
        "        'utm_term': inputs.get('term'),",
        "        'utm_content': inputs.get('content'),",
        "    }",
        "    params = {key: str(value).strip() for key, value in mapping.items() if value not in (None, '')}",
        "    merged = {**existing, **params}",
        "    url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(merged), parts.fragment))",
        "    return {'url': url, 'params': params, 'warning': ''}",
      ].join("\n"),
      "input.schema.json": {
        type: "object",
        required: ["base_url", "source", "medium", "campaign"],
        additionalProperties: false,
        properties: {
          base_url: { type: "string", title: "Base URL", default: "https://floom.dev" },
          source: { type: "string", title: "Source", default: "linkedin" },
          medium: { type: "string", title: "Medium", default: "social" },
          campaign: { type: "string", title: "Campaign", default: "launch" },
          term: { type: "string", title: "Term", default: "" },
          content: { type: "string", title: "Content", default: "" },
        },
      },
      "output.schema.json": {
        type: "object",
        required: ["url", "params", "warning"],
        additionalProperties: false,
        properties: {
          url: { type: "string", title: "Tracked URL" },
          params: { type: "object", title: "UTM params", additionalProperties: { type: "string" } },
          warning: { type: "string", title: "Warning" },
        },
      },
    },
    example_inputs: {
      base_url: "https://floom.dev",
      source: "linkedin",
      medium: "social",
      campaign: "launch",
      term: "",
      content: "hero-cta",
    },
  },
  csv_stats: {
    key: "csv_stats",
    name: "CSV Stats",
    description: "Summarize row count, columns, and numeric stats from pasted CSV text.",
    useful_for: "Quick checks on exported spreadsheets without uploading files.",
    files: {
      "floom.yaml": [
        "name: CSV Stats",
        "slug: csv-stats",
        "runtime: python",
        "entrypoint: app.py",
        "handler: run",
        "public: true",
        "input_schema: ./input.schema.json",
        "output_schema: ./output.schema.json",
      ].join("\n"),
      "app.py": [
        "import csv",
        "import io",
        "",
        "",
        "def number(value):",
        "    try:",
        "        return float(str(value).replace(',', '').strip())",
        "    except ValueError:",
        "        return None",
        "",
        "",
        "def run(inputs: dict) -> dict:",
        "    text = str(inputs.get('csv_text') or '')",
        "    preferred = str(inputs.get('numeric_column') or '').strip()",
        "    reader = csv.DictReader(io.StringIO(text))",
        "    rows = list(reader)",
        "    columns = reader.fieldnames or []",
        "    target_columns = [preferred] if preferred else columns",
        "    stats = []",
        "    for column in target_columns:",
        "        values = [number(row.get(column, '')) for row in rows]",
        "        nums = [value for value in values if value is not None]",
        "        if nums:",
        "            stats.append({",
        "                'column': column,",
        "                'count': len(nums),",
        "                'min': min(nums),",
        "                'max': max(nums),",
        "                'mean': round(sum(nums) / len(nums), 4),",
        "            })",
        "    return {",
        "        'row_count': len(rows),",
        "        'columns': columns,",
        "        'numeric_stats': stats,",
        "    }",
      ].join("\n"),
      "input.schema.json": {
        type: "object",
        required: ["csv_text"],
        additionalProperties: false,
        properties: {
          csv_text: {
            type: "string",
            title: "CSV text",
            default: "name,revenue,cost\nAlpha,1200,450\nBeta,800,300\nGamma,1500,700",
          },
          numeric_column: {
            type: "string",
            title: "Numeric column",
            description: "Leave blank to scan every column.",
            default: "",
          },
        },
      },
      "output.schema.json": {
        type: "object",
        required: ["row_count", "columns", "numeric_stats"],
        additionalProperties: false,
        properties: {
          row_count: { type: "integer", title: "Rows" },
          columns: { type: "array", title: "Columns", items: { type: "string" } },
          numeric_stats: {
            type: "array",
            title: "Numeric stats",
            items: {
              type: "object",
              required: ["column", "count", "min", "max", "mean"],
              additionalProperties: false,
              properties: {
                column: { type: "string" },
                count: { type: "integer" },
                min: { type: "number" },
                max: { type: "number" },
                mean: { type: "number" },
              },
            },
          },
        },
      },
    },
    example_inputs: {
      csv_text: "name,revenue,cost\nAlpha,1200,450\nBeta,800,300\nGamma,1500,700",
      numeric_column: "",
    },
  },
  meeting_action_items: {
    key: "meeting_action_items",
    name: "Meeting Action Items",
    description: "Extract likely action items from pasted notes with simple deterministic heuristics.",
    useful_for: "Turning meeting notes into a lightweight task list without AI calls.",
    files: {
      "floom.yaml": [
        "name: Meeting Action Items",
        "slug: meeting-action-items",
        "runtime: python",
        "entrypoint: app.py",
        "handler: run",
        "public: true",
        "input_schema: ./input.schema.json",
        "output_schema: ./output.schema.json",
      ].join("\n"),
      "app.py": [
        "import re",
        "",
        "",
        "PATTERNS = [",
        "    r'^(?:todo|action|next step)[:\\-]\\s*(?P<task>.+)$',",
        "    r'\\b(?P<owner>[A-Z][a-z]+)\\s+(?:will|to|needs to|has to)\\s+(?P<task>.+)$',",
        "    r'\\b(?:follow up|send|prepare|review|schedule|draft|share)\\b(?P<task>.*)$',",
        "]",
        "",
        "",
        "def clean(text):",
        "    return re.sub(r'\\s+', ' ', text).strip(' -:.')",
        "",
        "",
        "def due_from(text):",
        "    match = re.search(r'\\bby\\s+([A-Za-z]+\\s+\\d{1,2}|tomorrow|today|Friday|Monday|Tuesday|Wednesday|Thursday)\\b', text, re.I)",
        "    return match.group(1) if match else ''",
        "",
        "",
        "def run(inputs: dict) -> dict:",
        "    transcript = str(inputs.get('transcript') or '')",
        "    default_owner = str(inputs.get('default_owner') or '').strip()",
        "    lines = [line.strip() for line in re.split(r'[\\n\\r]+', transcript) if line.strip()]",
        "    items = []",
        "    for line in lines:",
        "        task = ''",
        "        owner = default_owner",
        "        for pattern in PATTERNS:",
        "            match = re.search(pattern, line, re.I)",
        "            if match:",
        "                groups = match.groupdict()",
        "                task = clean(groups.get('task') or line)",
        "                owner = clean(groups.get('owner') or owner)",
        "                break",
        "        if task and task.lower() not in {item['task'].lower() for item in items}:",
        "            items.append({'task': task, 'owner': owner, 'due': due_from(line)})",
        "    return {'count': len(items), 'items': items}",
      ].join("\n"),
      "input.schema.json": {
        type: "object",
        required: ["transcript"],
        additionalProperties: false,
        properties: {
          transcript: {
            type: "string",
            title: "Meeting notes",
            default: "Action: send the launch notes by Friday\nJordan will review the demo copy\nNeed to schedule QA follow-up tomorrow",
          },
          default_owner: {
            type: "string",
            title: "Default owner",
            default: "",
          },
        },
      },
      "output.schema.json": {
        type: "object",
        required: ["count", "items"],
        additionalProperties: false,
        properties: {
          count: { type: "integer", title: "Action item count" },
          items: {
            type: "array",
            title: "Action items",
            items: {
              type: "object",
              required: ["task", "owner", "due"],
              additionalProperties: false,
              properties: {
                task: { type: "string" },
                owner: { type: "string" },
                due: { type: "string" },
              },
            },
          },
        },
      },
    },
    example_inputs: {
      transcript: "Action: send the launch notes by Friday\nJordan will review the demo copy\nNeed to schedule QA follow-up tomorrow",
      default_owner: "",
    },
  },
  multi_file_python: {
    key: "multi_file_python",
    name: "Multi-file Python",
    description: "Proves multi-file imports work on stock E2B.",
    useful_for: "Python apps that want helpers, modules, and normal file layout.",
    files: {
      "floom.yaml": [
        "name: Multi-file Python",
        "slug: multi-file-python",
        "public: true",
        "input_schema: ./input.schema.json",
        "output_schema: ./output.schema.json",
      ].join("\n"),
      "app.py": [
        "import json",
        "import os",
        "import sys",
        "",
        "from utils import summarize",
        "",
        "raw = os.environ.get('FLOOM_INPUTS') or sys.stdin.read() or '{}'",
        "print(json.dumps(summarize(json.loads(raw))))",
      ].join("\n"),
      "utils.py": [
        "from textwrap import shorten",
        "",
        "def summarize(inputs):",
        "    text = str(inputs.get('text') or '').strip()",
        "    return {",
        "        'preview': shorten(text, width=40, placeholder='...'),",
        "        'length': len(text),",
        "        'word_count': len([part for part in text.split() if part]),",
        "    }",
      ].join("\n"),
      "input.schema.json": {
        type: "object",
        required: ["text"],
        additionalProperties: false,
        properties: {
          text: { type: "string", title: "Text", default: "Multi-file Python works on stock E2B." },
        },
      },
      "output.schema.json": {
        type: "object",
        required: ["preview", "length", "word_count"],
        additionalProperties: false,
        properties: {
          preview: { type: "string" },
          length: { type: "integer" },
          word_count: { type: "integer" },
        },
      },
    },
    example_inputs: {
      text: "Multi-file Python works on stock E2B.",
    },
  },
  node_fetch: {
    key: "node_fetch",
    name: "Node Fetch",
    description: "Fetch a URL and return its HTML title from a Node app.",
    useful_for: "Proof that Node app bundles publish and run without the Python-only contract.",
    files: {
      "floom.yaml": [
        "name: Node Fetch",
        "slug: node-fetch",
        "public: true",
        "input_schema: ./input.schema.json",
        "output_schema: ./output.schema.json",
      ].join("\n"),
      "package.json": JSON.stringify({
        name: "floom-node-fetch-template",
        private: true,
        type: "module",
        scripts: { start: "node index.js" },
      }, null, 2),
      "index.js": [
        "const raw = process.env.FLOOM_INPUTS || '{}'",
        "const inputs = JSON.parse(raw)",
        "const url = String(inputs.url || 'https://example.com')",
        "const response = await fetch(url)",
        "const html = await response.text()",
        "const match = html.match(/<title[^>]*>(.*?)<\\/title>/i)",
        "console.log(JSON.stringify({ url, title: match ? match[1].trim() : '', status: response.status }))",
      ].join("\n"),
      "input.schema.json": {
        type: "object",
        required: ["url"],
        additionalProperties: false,
        properties: {
          url: { type: "string", title: "URL", default: "https://example.com" },
        },
      },
      "output.schema.json": {
        type: "object",
        required: ["url", "title", "status"],
        additionalProperties: false,
        properties: {
          url: { type: "string" },
          title: { type: "string" },
          status: { type: "integer" },
        },
      },
    },
    example_inputs: {
      url: "https://example.com",
    },
  },
  run_only_cron: {
    key: "run_only_cron",
    name: "Run-only Cron",
    description: "Schema-less app that just runs and prints status.",
    useful_for: "Cron-like jobs and maintenance tasks that only need a Run button and log tail.",
    files: {
      "floom.yaml": [
        "name: Run-only Cron",
        "slug: run-only-cron",
        "public: true",
      ].join("\n"),
      "app.py": [
        "from datetime import datetime, timezone",
        "",
        "print(f\"cron tick {datetime.now(timezone.utc).isoformat()}\")",
      ].join("\n"),
    },
    example_inputs: {},
  },
};

function listAppTemplates(): McpToolResult {
  return okResult({
    templates: Object.values(APP_TEMPLATES).map((template) => ({
      key: template.key,
      name: template.name,
      description: template.description,
      useful_for: template.useful_for,
    })),
  });
}

function getAppTemplate(args: JsonObject): McpToolResult {
  const key = args.key;
  if (typeof key !== "string") {
    return errorResult("key must be a string");
  }

  const template = APP_TEMPLATES[key];
  if (!template) {
    return errorResult(`Unknown app template: ${key}`);
  }

  return okResult(template);
}

function validateManifest(args: JsonObject): McpToolResult {
  const sourceHintResult = parseSourceHint(args.source);
  if (!sourceHintResult.ok) {
    return errorResult(sourceHintResult.error);
  }

  const filesHintResult = args.files === undefined ? null : parseFileMap(args.files);
  if (filesHintResult && !filesHintResult.ok) {
    return errorResult(filesHintResult.error);
  }

  const rawManifest = parseRawManifestHint(args.manifest);
  const runtimeCoaching = runtimeCoachingFromHints({
    manifest: rawManifest,
    source: sourceHintResult.source,
    files: filesHintResult?.files,
  });

  const manifestResult = parseManifestArgument(args.manifest);
  if (!manifestResult.ok) {
    return errorResultWithData(manifestResult.error, runtimeCoaching.length > 0 ? {
      runtime_coaching: runtimeCoaching,
    } : undefined);
  }

  const inputSchemaResult = parseOptionalSchemaArgument(args.input_schema, "input_schema");
  if (!inputSchemaResult.ok) {
    return errorResult(inputSchemaResult.error);
  }

  const outputSchemaResult = parseOptionalSchemaArgument(args.output_schema, "output_schema");
  if (!outputSchemaResult.ok) {
    return errorResult(outputSchemaResult.error);
  }

  const commandDetectionError = detectManifestCommandError(manifestResult.manifest, filesHintResult?.files);
  if (commandDetectionError) {
    return okResult({
      valid: false,
      scope: "manifest_and_optional_json_schemas_only",
      full_check: "Use publish_app to validate source, required schemas, declared requirements, auth, and the publish API path.",
      errors: [commandDetectionError],
      unsupported_reason: commandDetectionError,
      ...(runtimeCoaching.length > 0 ? { runtime_coaching: runtimeCoaching } : {}),
      manifest: manifestResult.manifest,
      schemas: {
        input_schema: inputSchemaResult.provided ? "valid" : "not_provided",
        output_schema: outputSchemaResult.provided ? "valid" : "not_provided",
      },
    });
  }

  return okResult({
    valid: true,
    scope: "manifest_and_optional_json_schemas_only",
    full_check: "Use publish_app to validate source, required schemas, declared requirements, auth, and the publish API path.",
    ...(runtimeCoaching.length > 0 ? { runtime_coaching: runtimeCoaching } : {}),
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

  const filesArg = args.files;
  const filesResult = filesArg === undefined ? null : parseFileMap(filesArg);
  if (filesResult && !filesResult.ok) {
    return errorResult(filesResult.error);
  }

  let files: Record<string, string>;
  if (filesResult?.ok) {
    files = { ...filesResult.files };
    if (!("floom.yaml" in files)) {
      files["floom.yaml"] = manifestToYaml(manifestResult.manifest);
    }
  } else {
    const legacyFilesResult = buildLegacyPublishFiles(args, manifestResult.manifest);
    if (!legacyFilesResult.ok) {
      return errorResult(legacyFilesResult.error);
    }
    files = legacyFilesResult.files;
  }

  let bundle;
  try {
    bundle = await createBundleFromFileMap(files);
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : "Failed to build bundle");
  }

  const form = new FormData();
  form.append("manifest", textBlob(manifestToYaml(manifestResult.manifest), "application/x-yaml"), "floom.yaml");
  form.append(
    "bundle",
    new Blob([new Uint8Array(bundle.buffer)], { type: "application/gzip" }),
    "bundle.tar.gz"
  );

  return proxyJson(`${context.baseUrl}/api/apps`, {
    method: "POST",
    headers: forwardedHeaders(context),
    body: form,
  });
}

function findCandidateApps(args: JsonObject): McpToolResult {
  const filesResult = parseFileMap(args.files);
  if (!filesResult.ok) {
    return errorResult(filesResult.error);
  }
  const files = filesResult.files;

  const maxResults =
    typeof args.max_results === "number" &&
    Number.isInteger(args.max_results) &&
    args.max_results >= 1 &&
    args.max_results <= 50
      ? args.max_results
      : 20;

  const manifestEntries = Object.entries(files).filter(([filePath]) => basename(filePath) === "floom.yaml");
  const manifestDirs = new Set(manifestEntries.map(([manifestPath]) => dirname(manifestPath)));

  const manifestCandidates = manifestEntries
    .slice(0, maxResults)
    .map(([manifestPath, manifestText]) => {
      const appDir = dirname(manifestPath);
      const errors: string[] = [];
      let manifest: FloomManifest | null = null;

      try {
        const rawManifest = yaml.load(manifestText);
        const rawManifestObject = asObject(rawManifest);
        const unsupportedFields = rawManifestObject
          ? unsupportedManifestFields(rawManifestObject)
          : [];
        errors.push(...unsupportedFields);
        if (unsupportedFields.length === 0) {
          manifest = parseManifest(rawManifest);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Invalid floom.yaml");
      }

      if (manifest) {
        if (isLegacyPythonManifest(manifest)) {
          const entrypointPath = joinPath(appDir, manifest.entrypoint);
          if (!(entrypointPath in files)) {
            errors.push(`Missing entrypoint: ${entrypointPath}`);
          }
        }

        if (manifest.dependencies?.python) {
          const requirementsPath = joinPath(
            appDir,
            manifest.dependencies.python.replace(/\s+--require-hashes$/, "")
          );
          if (!(requirementsPath in files)) {
            errors.push(`Missing requirements.txt: ${requirementsPath}`);
          } else {
            try {
              validatePythonRequirementsText(files[requirementsPath], {
                requireHashes: manifest.dependencies.python.endsWith("--require-hashes"),
              });
            } catch (requirementsError) {
              errors.push(
                requirementsError instanceof Error
                  ? requirementsError.message
                  : "Invalid requirements.txt"
              );
            }
          }
        } else if (joinPath(appDir, "requirements.txt") in files) {
          try {
            validatePythonRequirementsText(files[joinPath(appDir, "requirements.txt")]);
          } catch (requirementsError) {
            errors.push(
              requirementsError instanceof Error
                ? requirementsError.message
                : "Invalid requirements.txt"
            );
          }
        }

        if (manifest.input_schema) {
          validateCandidateSchema(files, joinPath(appDir, manifest.input_schema), "input_schema", errors);
        }
        if (manifest.output_schema) {
          validateCandidateSchema(files, joinPath(appDir, manifest.output_schema), "output_schema", errors);
        }

        if (!isLegacyPythonManifest(manifest) && !manifest.command) {
          const detectedCommand = detectCommandFromFileMap(appDir, files);
          if (!detectedCommand) {
            errors.push("No command detected. Add command: to floom.yaml or include app.py, index.js, or package.json with a start script.");
          } else if (!detectedCommand.ok) {
            errors.push(detectedCommand.error);
          }
        }
      }

      return {
        manifest_path: manifestPath,
        app_dir: appDir || ".",
        slug: manifest?.slug ?? null,
        name: manifest?.name ?? null,
        runtime: manifest ? manifestRuntimeLabel(manifest, appDir, files) : null,
        entrypoint: manifest && isLegacyPythonManifest(manifest) ? manifest.entrypoint : null,
        valid: errors.length === 0,
        errors,
        unsupported_reason: errors.length === 0 ? null : errors.join("; "),
      };
    });

  const candidates = [
    ...manifestCandidates,
    ...unsupportedRepositoryCandidates(files, manifestDirs).slice(0, Math.max(0, maxResults - manifestCandidates.length)),
  ];

  return okResult({
    candidates,
    count: candidates.length,
  });
}

function unsupportedManifestFields(manifest: JsonObject) {
  const reasons: string[] = [];
  const unsupportedFields = [
    "actions",
    "type",
    "visibility",
    "category",
    "manifest_version",
    "python_dependencies",
    "secrets_needed",
    "openapi_spec_url",
  ];
  for (const field of unsupportedFields) {
    if (manifest[field] !== undefined) {
      reasons.push(`floom.yaml field ${field} is not supported.`);
    }
  }
  if (manifest.input_schema !== undefined && typeof manifest.input_schema !== "string") {
    reasons.push("floom.yaml field input_schema must be a file path string.");
  }
  if (manifest.output_schema !== undefined && typeof manifest.output_schema !== "string") {
    reasons.push("floom.yaml field output_schema must be a file path string.");
  }
  if (manifest.public !== undefined && typeof manifest.public !== "boolean") {
    reasons.push("floom.yaml field public must be true or false.");
  }
  return reasons;
}

function manifestRuntimeLabel(
  manifest: FloomManifest,
  appDir: string,
  files: Record<string, string>
) {
  if (isLegacyPythonManifest(manifest)) {
    return "python";
  }

  const detected = detectCommandFromFileMap(appDir, files);
  if (!detected || !detected.ok) {
    return manifest.command ? "stock-e2b" : null;
  }

  if (detected.command.startsWith("python ")) return "python";
  if (detected.command.startsWith("node ") || detected.command.startsWith("npm ")) return "node";
  if (detected.command.startsWith("bun ")) return "bun";
  if (detected.command.startsWith("go ")) return "go";
  return "stock-e2b";
}

function detectCommandFromFileMap(appDir: string, files: Record<string, string>) {
  const candidates: string[] = [];

  const appPy = joinPath(appDir, "app.py");
  if (appPy in files) {
    candidates.push("python app.py");
  }

  const indexJs = joinPath(appDir, "index.js");
  if (indexJs in files) {
    candidates.push("node index.js");
  }

  const packageJsonPath = joinPath(appDir, "package.json");
  if (packageJsonPath in files) {
    try {
      const packageJson = JSON.parse(files[packageJsonPath]) as { scripts?: Record<string, string> };
      if (typeof packageJson.scripts?.start === "string" && packageJson.scripts.start.trim() !== "") {
        candidates.push("npm start");
      }
    } catch {
      // Match publish-time detection: an unreadable start script is not an npm candidate.
    }
  }

  if (candidates.length > 1) {
    return {
      ok: false,
      error: `ambiguous command auto-detection (${candidates.join(", ")}), please specify command: in floom.yaml`,
    } as const;
  }

  if (candidates.length === 1) {
    return { ok: true, command: candidates[0]! } as const;
  }

  return null;
}

function detectManifestCommandError(
  manifest: FloomManifest,
  files: Record<string, string> | undefined
) {
  if (!files || isLegacyPythonManifest(manifest) || manifest.command) {
    return null;
  }

  const manifestPath = Object.keys(files).find((filePath) => basename(filePath) === "floom.yaml");
  const appDir = manifestPath ? dirname(manifestPath) : "";
  const detectedCommand = detectCommandFromFileMap(appDir, files);
  if (detectedCommand && !detectedCommand.ok) {
    return detectedCommand.error;
  }

  return null;
}

function filesByDirectory(files: Record<string, string>) {
  const directories = new Map<string, string[]>();
  for (const filePath of Object.keys(files).sort()) {
    const appDir = dirname(filePath);
    directories.set(appDir, [...(directories.get(appDir) ?? []), filePath]);
  }
  return directories;
}

function unsupportedRepositoryCandidates(files: Record<string, string>, manifestDirs = new Set<string>()) {
  const candidates = [];

  for (const [appDir, dirFiles] of filesByDirectory(files)) {
    if (manifestDirs.has(appDir)) {
      continue;
    }

    const fileNames = new Set(dirFiles.map((filePath) => basename(filePath)));
    const fileText = dirFiles.map((filePath) => files[filePath]).join("\n");
    const pythonFiles = dirFiles.filter((filePath) => basename(filePath).endsWith(".py"));
    const javaFiles = dirFiles.filter((filePath) => basename(filePath).endsWith(".java"));
    const mainJavaPath = javaFiles.find((filePath) => basename(filePath) === "Main.java") ?? null;

    if (fileNames.has("openapi.json") || hasFastApiSource(fileText)) {
      candidates.push(unsupportedCandidate("Add floom.yaml. Floom will run the command, but it still does not proxy arbitrary HTTP routes from a server app.", null, null, appDir));
    }

    if (fileNames.has("requirements.txt") || fileNames.has("pyproject.toml")) {
      candidates.push(unsupportedCandidate("Add floom.yaml. Python dependency files are fine in stock-E2B mode.", "python", null, appDir));
    }

    if (fileNames.has("package.json")) {
      candidates.push(unsupportedCandidate("Add floom.yaml. Node apps are supported in stock-E2B mode.", "node", null, appDir));
    }

    if (javaFiles.length > 0 || fileNames.has("pom.xml") || fileNames.has("build.gradle")) {
      const reasons = ["Add floom.yaml and an explicit command before publish."];
      if (javaFiles.length > 0) {
        reasons.push(`Java source files detected: ${javaFiles.sort().join(", ")}`);
      }
      candidates.push(unsupportedCandidate(reasons.join("; "), "java", mainJavaPath, appDir));
    }

    if (pythonFiles.length > 1) {
      candidates.push(
        unsupportedCandidate(
          `Add floom.yaml. Multi-file Python apps are supported in stock-E2B mode: ${pythonFiles.sort().join(", ")}`,
          "python",
          null,
          appDir
        )
      );
    }
  }

  return candidates;
}

function unsupportedCandidate(
  reason: string,
  runtime: string | null = null,
  entrypoint: string | null = null,
  appDir = "."
) {
  return {
    manifest_path: null,
    app_dir: appDir || ".",
    slug: null,
    name: null,
    runtime,
    entrypoint,
    valid: false,
    errors: [reason],
    unsupported_reason: reason,
  };
}

function parseSourceHint(value: unknown): { ok: true; source?: string } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "source must be a string" };
  }
  if (Buffer.byteLength(value, "utf8") > MAX_SOURCE_BYTES) {
    return { ok: false, error: "source is too large" };
  }
  return { ok: true, source: value };
}

function parseRawManifestHint(value: unknown): JsonObject | null {
  try {
    const parsed = typeof value === "string" ? yaml.load(value) : value;
    return asObject(parsed);
  } catch {
    return null;
  }
}

function runtimeCoachingFromHints({
  manifest,
  source,
  files,
}: {
  manifest: JsonObject | null;
  source?: string;
  files?: Record<string, string>;
}) {
  const coaching = new Set<string>();
  const addTypeScript = () =>
    coaching.add(
      "TypeScript/Node detected from manifest or source hints. Stock-E2B mode supports Node app bundles; publish the whole directory and set command: <shell> unless index.js or package.json start can be auto-detected."
    );
  const addJava = () =>
    coaching.add(
      "Java detected from manifest or source hints. Stock-E2B mode only widens to what the stock E2B base can already run; add an explicit command and verify the runtime exists in your target E2B base before publish."
    );
  const addHttp = () =>
    coaching.add(
      "FastAPI/OpenAPI or HTTP server shape detected. Stock-E2B mode can run the command, but Floom still exposes one run endpoint, not arbitrary HTTP route proxying."
    );
  const addMultiFile = () =>
    coaching.add(
      "Multiple Python files detected. Stock-E2B mode supports multi-file bundles; publish the whole directory instead of flattening helpers into one file."
    );
  const addHardcodedCredential = () =>
    coaching.add(
      "Credential-looking string detected in source/file hints. Do not hardcode raw secrets or paste them into MCP; declare names in floom.yaml secrets, read them from environment variables, and set values with `npx @floomhq/cli@latest secrets set <app-slug> <SECRET_NAME> --value-stdin` or the REST /api/apps/:slug/secrets route."
    );

  if (manifest) {
    const runtime = typeof manifest.runtime === "string" ? manifest.runtime.toLowerCase() : "";
    const entrypoint = typeof manifest.entrypoint === "string" ? manifest.entrypoint.toLowerCase() : "";
    if (["typescript", "node", "javascript", "js", "ts"].includes(runtime) || /\.(ts|tsx|js|mjs|cjs)$/.test(entrypoint)) {
      addTypeScript();
    }
    if (runtime === "java" || entrypoint.endsWith(".java")) {
      addJava();
    }
    if (manifest.openapi_spec_url !== undefined) {
      addHttp();
    }
    if (manifest.actions !== undefined) {
      coaching.add("Multiple actions detected. This runtime branch still exposes one run surface per app; split separate actions into separate apps for now.");
    }
  }

  if (source) {
    if (hasFastApiSource(source)) {
      addHttp();
    }
    if (looksLikeTypeScriptSource(source)) {
      addTypeScript();
    }
    if (looksLikeJavaSource(source)) {
      addJava();
    }
    if (hasCredentialLookingString(source)) {
      addHardcodedCredential();
    }
  }

  if (files) {
    const unsupportedReasons = unsupportedRepositoryCandidates(files)
      .map((candidate) => candidate.unsupported_reason)
      .join("\n");
    if (/Node apps are supported|TypeScript\/Node/.test(unsupportedReasons)) {
      addTypeScript();
    }
    if (/Java source files detected|Java apps/.test(unsupportedReasons)) {
      addJava();
    }
    if (/HTTP route/.test(unsupportedReasons) || /FastAPI\/OpenAPI/.test(unsupportedReasons)) {
      addHttp();
    }
    if (/Multi-file Python|multi-file Python apps are supported/i.test(unsupportedReasons)) {
      addMultiFile();
    }
    if (Object.values(files).some((text) => hasCredentialLookingString(text))) {
      addHardcodedCredential();
    }
  }

  return [...coaching];
}

function hasFastApiSource(source: string) {
  return /FastAPI\s*\(|from\s+fastapi\s+import|import\s+fastapi\b|openapi\.json/i.test(source);
}

function looksLikeTypeScriptSource(source: string) {
  return /\bexport\s+(async\s+)?function\b|\binterface\s+[A-Za-z_][A-Za-z0-9_]*\b|\btype\s+[A-Za-z_][A-Za-z0-9_]*\s*=|:\s*(string|number|boolean)\b/.test(source);
}

function looksLikeJavaSource(source: string) {
  return /\bpublic\s+class\s+[A-Za-z_][A-Za-z0-9_]*\b|\bstatic\s+void\s+main\s*\(|System\.out\.println\s*\(/.test(source);
}

function hasCredentialLookingString(source: string) {
  return (
    /\b(api[_-]?key|secret|token|password|private[_-]?key|credential|authorization)\b\s*[:=]\s*["'][^"'\n]{8,}["']/i.test(source) ||
    /["'](?:sk|pk|ghp|glpat|xox[baprs]?|AKIA)[A-Za-z0-9_-]{12,}["']/.test(source)
  );
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
    const manifestSize =
      typeof manifestValue === "string"
        ? Buffer.byteLength(manifestValue, "utf8")
        : jsonByteLength(manifestValue);
    if (manifestSize === null || manifestSize > MAX_SCHEMA_BYTES) {
      return { ok: false, error: "manifest is too large" };
    }

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
  return yaml.dump(
    isLegacyPythonManifest(manifest)
      ? {
          ...(manifest.name ? { name: manifest.name } : {}),
          slug: manifest.slug,
          ...(manifest.description ? { description: manifest.description } : {}),
          runtime: manifest.runtime,
          entrypoint: manifest.entrypoint,
          handler: manifest.handler,
          public: manifest.public ?? false,
          ...(manifest.input_schema ? { input_schema: manifest.input_schema } : {}),
          ...(manifest.output_schema ? { output_schema: manifest.output_schema } : {}),
          ...(manifest.dependencies ? { dependencies: manifest.dependencies } : {}),
          ...(manifest.secrets ? { secrets: manifest.secrets } : {}),
          ...(manifest.bundle_exclude ? { bundle_exclude: manifest.bundle_exclude } : {}),
        }
      : {
          ...(manifest.name ? { name: manifest.name } : {}),
          slug: manifest.slug,
          ...(manifest.description ? { description: manifest.description } : {}),
          ...(manifest.command ? { command: manifest.command } : {}),
          public: manifest.public ?? false,
          ...(manifest.input_schema ? { input_schema: manifest.input_schema } : {}),
          ...(manifest.output_schema ? { output_schema: manifest.output_schema } : {}),
          ...(manifest.dependencies ? { dependencies: manifest.dependencies } : {}),
          ...(manifest.secrets ? { secrets: manifest.secrets } : {}),
          ...(manifest.bundle_exclude ? { bundle_exclude: manifest.bundle_exclude } : {}),
        }
  );
}

function textBlob(text: string, type: string) {
  return new Blob([text], { type });
}

function buildLegacyPublishFiles(
  args: JsonObject,
  manifest: FloomManifest
): { ok: true; files: Record<string, string> } | { ok: false; error: string } {
  if (!isLegacyPythonManifest(manifest)) {
    return {
      ok: false,
      error: "publish_app requires files for stock-E2B multi-file or command-based apps; the source shortcut only works for legacy runtime: python apps",
    };
  }

  const source = args.source;
  if (typeof source !== "string" || source.trim() === "") {
    return { ok: false, error: "source must be a non-empty string" };
  }

  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    return { ok: false, error: "source is too large" };
  }

  try {
    validatePythonSourceForManifest(source, manifest);
  } catch (sourceError) {
    return {
      ok: false,
      error: sourceError instanceof Error ? sourceError.message : "Invalid app source",
    };
  }

  const inputSchemaResult = parseRequiredSchemaArgument(args.input_schema, "input_schema");
  if (!inputSchemaResult.ok) {
    return inputSchemaResult;
  }

  const outputSchemaResult = parseRequiredSchemaArgument(args.output_schema, "output_schema");
  if (!outputSchemaResult.ok) {
    return outputSchemaResult;
  }

  const files: Record<string, string> = {
    "floom.yaml": manifestToYaml(manifest),
    [manifest.entrypoint]: source,
    [manifest.input_schema ?? "input.schema.json"]: JSON.stringify(inputSchemaResult.schema, null, 2),
    [manifest.output_schema ?? "output.schema.json"]: JSON.stringify(outputSchemaResult.schema, null, 2),
  };

  const requirements = args.requirements;
  if (manifest.dependencies?.python) {
    if (typeof requirements !== "string") {
      return { ok: false, error: "requirements must be provided when dependencies.python is declared" };
    }

    try {
      files[manifest.dependencies.python.replace(/\s+--require-hashes$/, "").replace(/^\.\//, "")] =
        validatePythonRequirementsText(requirements, {
          requireHashes: manifest.dependencies.python.endsWith("--require-hashes"),
        });
    } catch (requirementsError) {
      return {
        ok: false,
        error:
          requirementsError instanceof Error
            ? requirementsError.message
            : "Invalid requirements.txt",
      };
    }
  } else if (requirements !== undefined) {
    return { ok: false, error: "requirements requires dependencies.python in floom.yaml" };
  }

  return { ok: true, files };
}

function parseFileMap(
  value: unknown
): { ok: true; files: Record<string, string> } | { ok: false; error: string } {
  const object = asObject(value);
  if (!object) {
    return { ok: false, error: "files must be an object mapping paths to text contents" };
  }

  const entries = Object.entries(object);
  if (entries.length > MAX_MCP_FILE_COUNT) {
    return { ok: false, error: `files supports at most ${MAX_MCP_FILE_COUNT} entries` };
  }

  let totalBytes = 0;
  const files: Record<string, string> = {};

  for (const [filePath, fileText] of entries) {
    if (typeof fileText !== "string") {
      return { ok: false, error: "files must map paths to text contents" };
    }

    const normalizedPath = normalizePath(filePath);
    if (!isSafeRepositoryPath(normalizedPath)) {
      return { ok: false, error: `Invalid file path: ${filePath}` };
    }

    if (Buffer.byteLength(normalizedPath, "utf8") > MAX_MCP_FILE_PATH_BYTES) {
      return { ok: false, error: `File path is too long: ${filePath}` };
    }

    const fileBytes = Buffer.byteLength(fileText, "utf8");
    if (fileBytes > MAX_MCP_FILE_BYTES) {
      return { ok: false, error: `File is too large: ${normalizedPath}` };
    }

    totalBytes += Buffer.byteLength(normalizedPath, "utf8") + fileBytes;
    if (totalBytes > MAX_REQUEST_BYTES) {
      return { ok: false, error: "files map is too large" };
    }

    files[normalizedPath] = fileText;
  }

  return { ok: true, files };
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

function isSafeRepositoryPath(filePath: string) {
  if (
    filePath === "" ||
    filePath.startsWith("/") ||
    filePath.includes("\0") ||
    filePath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    return false;
  }

  return true;
}

function jsonByteLength(value: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return null;
  }
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
  return errorResultWithData(message);
}

function errorResultWithData(message: string, data?: JsonObject): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message, ...(data ?? {}) }, null, 2),
      },
    ],
    isError: true,
  };
}
