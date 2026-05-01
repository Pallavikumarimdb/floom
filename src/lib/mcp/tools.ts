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
  | "get_app_contract"
  | "list_app_templates"
  | "get_app_template"
  | "validate_manifest"
  | "publish_app"
  | "find_candidate_apps"
  | "get_app"
  | "run_app";

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
    name: "get_app_contract",
    description: "Return the exact Floom v0 app contract, copy-paste starter files, and explicit post-v0 unsupported cases.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "list_app_templates",
    description: "List useful Floom v0-safe starter app templates that agents can copy before publishing.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_app_template",
    description: "Return one copy-paste Floom v0-safe app template bundle.",
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

  return proxyJson(`${context.baseUrl}/api/apps/${encodeURIComponent(slug)}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...forwardedHeaders(context),
    },
    body: JSON.stringify({ inputs }),
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
    version: "v0",
    supported: [
      "single-file Python",
      "Python standard library only",
      "one handler function that accepts a JSON object and returns a JSON object",
      "floom.yaml plus input.schema.json and output.schema.json",
      "public apps with public: true; private apps when public is omitted or false",
    ],
    unsupported: [
      {
        case: "requirements.txt or pyproject.toml",
        reason: "Dependency installation is post-v0. v0 runs one stdlib Python file without an install step.",
      },
      {
        case: "openapi.json, FastAPI, Flask, or HTTP servers",
        reason: "HTTP app routing is post-v0. v0 exposes one JSON Schema form and one handler.",
      },
      {
        case: "package.json, TypeScript, or Node apps",
        reason: "TypeScript/Node runtime parity is post-v0. v0 runtime is runtime: python.",
      },
      {
        case: "multiple Python files",
        reason: "Multi-file bundles are post-v0. v0 packaging accepts one top-level Python entrypoint file.",
      },
      {
        case: "manifest fields actions, dependencies, or secrets",
        reason: "Multiple actions, dependency installs, and app secrets are post-v0 features.",
      },
      {
        case: "OpenBlog/OpenAPI apps",
        reason: "OpenBlog has an HTTP/OpenAPI surface and dependency-style app shape. It belongs to the post-v0 HTTP app runner, not the 60-second v0 function path.",
      },
    ],
    files: {
      "floom.yaml": [
        "name: Hello Floom",
        "slug: hello-floom",
        "runtime: python",
        "entrypoint: app.py",
        "handler: run",
        "public: true",
        "input_schema: ./input.schema.json",
        "output_schema: ./output.schema.json",
      ].join("\n"),
      "app.py": [
        "def run(inputs: dict) -> dict:",
        "    name = str(inputs.get(\"name\", \"world\"))",
        "    return {\"message\": f\"Hello, {name}!\"}",
      ].join("\n"),
      "input.schema.json": {
        type: "object",
        required: ["name"],
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            title: "Name",
            default: "Federico",
          },
        },
      },
      "output.schema.json": {
        type: "object",
        required: ["message"],
        additionalProperties: false,
        properties: {
          message: {
            type: "string",
            title: "Message",
          },
        },
      },
    },
    accepted_manifest_keys: [
      "name",
      "slug",
      "runtime",
      "entrypoint",
      "handler",
      "public",
      "input_schema",
      "output_schema",
    ],
    setup_commands: [
      "npx @floomhq/cli@latest setup",
      "mkdir my-floom-app && cd my-floom-app",
      "npx @floomhq/cli@latest init --name \"Hello Floom\" --slug hello-floom-<unique-suffix> --description \"Return a JSON greeting.\" --type custom",
      "npx @floomhq/cli@latest deploy --dry-run",
      "npx @floomhq/cli@latest deploy",
      "npx @floomhq/cli@latest run hello-floom-<unique-suffix> '{\"name\":\"Federico\"}' --json",
    ],
    template_guidance:
      "Templates include fixed example slugs. Change the slug to a unique 3-64 character lowercase slug before publishing.",
    templates_tool: {
      list: "list_app_templates",
      get: "get_app_template",
      available_keys: Object.keys(APP_TEMPLATES),
    },
    publish_command:
      "FLOOM_TOKEN=<agent-token> FLOOM_API_URL=https://floom-60sec.vercel.app npx @floomhq/cli@latest deploy",
  });
}

type AppTemplate = {
  key: string;
  name: string;
  description: string;
  useful_for: string;
  files: {
    "floom.yaml": string;
    "app.py": string;
    "input.schema.json": JsonObject;
    "output.schema.json": JsonObject;
  };
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
            default: "Action: send the launch notes by Friday\nPallavi will review the demo copy\nNeed to schedule QA follow-up tomorrow",
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
      transcript: "Action: send the launch notes by Friday\nPallavi will review the demo copy\nNeed to schedule QA follow-up tomorrow",
      default_owner: "",
    },
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
        const entrypointPath = joinPath(appDir, manifest.entrypoint);
        if (!(entrypointPath in files)) {
          errors.push(`Missing entrypoint: ${entrypointPath}`);
        }

        for (const unsupportedPath of unsupportedV0Files(appDir, files)) {
          errors.push(unsupportedFileReason(unsupportedPath));
        }

        const pythonFiles = pythonFilesInAppDir(appDir, files);
        if (pythonFiles.length > 1) {
          errors.push(
            `Multiple Python files are not supported in v0: ${pythonFiles.join(", ")}. Use one stdlib entrypoint file or wait for post-v0 multi-file bundles.`
          );
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

function unsupportedManifestFields(manifest: JsonObject) {
  const reasons: string[] = [];
  const unsupportedFields = [
    "actions",
    "dependencies",
    "secrets",
    "description",
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
      reasons.push(`floom.yaml field ${field} is not supported in v0.`);
    }
  }
  if (manifest.input_schema !== undefined && typeof manifest.input_schema !== "string") {
    reasons.push("floom.yaml field input_schema must be a file path string in v0.");
  }
  if (manifest.output_schema !== undefined && typeof manifest.output_schema !== "string") {
    reasons.push("floom.yaml field output_schema must be a file path string in v0.");
  }
  if (manifest.public !== undefined && typeof manifest.public !== "boolean") {
    reasons.push("floom.yaml field public must be true or false in v0.");
  }
  return reasons;
}

function unsupportedFileReason(filePath: string) {
  const fileName = basename(filePath);
  if (fileName === "requirements.txt") {
    return `${filePath} is not supported in v0; Python dependencies require the post-v0 dependency installer.`;
  }
  if (fileName === "pyproject.toml") {
    return `${filePath} is not supported in v0; Python packaging/dependencies require the post-v0 dependency installer.`;
  }
  if (fileName === "package.json") {
    return `${filePath} is not supported in v0; TypeScript/Node apps require the post-v0 TypeScript runner.`;
  }
  if (fileName === "openapi.json") {
    return `${filePath} is not supported in v0; OpenAPI/HTTP apps require the post-v0 HTTP app runner.`;
  }
  return `${filePath} is not supported in v0.`;
}

function pythonFilesInAppDir(appDir: string, files: Record<string, string>) {
  return Object.keys(files)
    .filter((filePath) => dirname(filePath) === appDir && basename(filePath).endsWith(".py"))
    .sort();
}

function unsupportedRepositoryCandidates(files: Record<string, string>) {
  if (Object.keys(files).some((filePath) => basename(filePath) === "floom.yaml")) {
    return [];
  }

  const fileNames = new Set(Object.keys(files).map((filePath) => basename(filePath)));
  const fileText = Object.values(files).join("\n");
  const pythonFiles = Object.keys(files).filter((filePath) => basename(filePath).endsWith(".py"));
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

  if (pythonFiles.length > 1) {
    candidates.push(
      unsupportedCandidate(
        `Multi-file Python apps require the post-v0 multi-file bundle path: ${pythonFiles.sort().join(", ")}`
      )
    );
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
