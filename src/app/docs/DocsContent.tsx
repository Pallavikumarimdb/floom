"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";

// ── TOC structure ────────────────────────────────────────────
const TOC_ITEMS = [
  { id: "getting-started", label: "Getting started" },
  { id: "what-is-a-floom-app", label: "What is a Floom app?" },
  { id: "manifest-reference", label: "Manifest reference" },
  { id: "input-output-schemas", label: "Input / output schemas" },
  { id: "secrets", label: "Secrets" },
  { id: "authentication", label: "Authentication" },
  { id: "run-through-api", label: "Run through API" },
  { id: "async-runs", label: "Async runs" },
  { id: "mcp-for-ai-agents", label: "MCP for AI agents" },
  { id: "connections", label: "Connections" },
  { id: "examples", label: "Examples" },
  { id: "ci-automation", label: "CI / automation" },
  { id: "limits", label: "Limits" },
  { id: "faq", label: "FAQ" },
] as const;

// ── Code examples ────────────────────────────────────────────
const launchCommand = `# 1. Authenticate (once per machine)
npx @floomhq/cli@latest setup

# 2. Scaffold a new app
mkdir my-floom-app && cd my-floom-app
npx @floomhq/cli@latest init --name "My App" --slug my-app --type custom

# 3. Deploy
npx @floomhq/cli@latest deploy

# 4. Run it
npx @floomhq/cli@latest run my-app '{"text":"hello"}' --json`;

const manifestFull = `slug: my-app
# The command to run. Auto-detected from app.py / index.js if omitted.
command: python app.py
# Relative path to a JSON Schema file for inputs (optional but recommended).
input_schema: ./input.schema.json
# Relative path to a JSON Schema file for outputs (optional).
output_schema: ./output.schema.json
# Make the app publicly runnable without auth.
public: true
# Secret names to inject as env vars at run time. Values are set separately.
secrets:
  - GEMINI_API_KEY
  - OPENAI_API_KEY
# Optional: additional pip deps installed before the run command.
# dependencies:
#   python: ./requirements.txt --require-hashes
# Optional: paths to skip when building the bundle.
# bundle_exclude:
#   - fixtures/large-dataset.csv`;

const legacyManifest = `# Legacy v0.1 shape — still works, no migration needed
name: Meeting Action Items
slug: meeting-action-items
runtime: python
entrypoint: app.py
handler: run
public: true
input_schema: ./input.schema.json
output_schema: ./output.schema.json
dependencies:
  python: ./requirements.txt`;

const inputSchemaExample = `{
  "type": "object",
  "required": ["transcript"],
  "properties": {
    "transcript": {
      "type": "string",
      "title": "Meeting transcript",
      "description": "Paste the full text of your meeting.",
      "x-floom-format": "textarea"
    },
    "language": {
      "type": "string",
      "title": "Output language",
      "default": "English"
    }
  }
}`;

const outputSchemaExample = `{
  "type": "object",
  "properties": {
    "action_items": {
      "type": "array",
      "items": { "type": "string" }
    },
    "summary": { "type": "string" }
  }
}`;

const outputModes = `# With output_schema declared:
# app prints JSON on stdout (last line), or writes /home/user/output.json
# Floom validates and returns parsed JSON

# No output_schema, stdout is valid JSON:
# Floom returns the parsed JSON directly

# No output_schema, plain stdout:
# Floom captures the last 4 KB of stdout as the output field`;

// Schema constraint examples (fix #8)
const schemaEnumExample = `// Use this when a field must be one of a fixed set of values
{
  "type": "string",
  "title": "Size",
  "enum": ["small", "medium", "large"]
}`;

const schemaMinMaxExample = `// Use this when a number must fall within a range
{
  "type": "integer",
  "title": "Count",
  "minimum": 1,
  "maximum": 100
}`;

const schemaPatternExample = `// Use this when a string must match a specific format
{
  "type": "string",
  "title": "Slug",
  "pattern": "^[a-z][a-z0-9-]{0,30}$"
}`;

const schemaOneOfExample = `// Use this when a field can be one of several distinct shapes
{
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "kind": { "const": "url" },
        "url": { "type": "string" }
      },
      "required": ["kind", "url"]
    },
    {
      "type": "object",
      "properties": {
        "kind": { "const": "text" },
        "text": { "type": "string" }
      },
      "required": ["kind", "text"]
    }
  ]
}`;

const secretsExample = `# Set a secret via stdin (never echoed to shell history)
npx @floomhq/cli@latest secrets set my-app OPENAI_API_KEY --value-stdin

# REST equivalent
curl -X PUT https://floom.dev/api/apps/my-app/secrets \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"OPENAI_API_KEY","value":"sk-..."}'`;

const setupExample = `# Opens a browser page to authorise your CLI. Run once per machine.
npx @floomhq/cli@latest setup

# Token is saved to ~/.floom/config.json
# Or export it manually:
export FLOOM_API_KEY=<your-agent-token>`;

const apiPublicExample = `# Public app — no auth needed
curl -X POST https://floom.dev/api/apps/meeting-action-items/run \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"transcript":"Alice: Let us ship by Friday..."}}'`;

const apiPrivateExample = `# Private app — agent token required
curl -X POST https://floom.dev/api/apps/my-private-app/run \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"text":"Run this securely"}}'`;

const apiResponseExample = `{
  "execution_id": "exec_abc123",
  "status": "queued",
  "output": null,
  "error": null,
  "view_token": "<view-token>"
}`;

const mcpConfigExample = `// Claude Desktop config
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "floom": {
      "url": "https://floom.dev/mcp",
      "headers": { "Authorization": "Bearer YOUR_AGENT_TOKEN" }
    }
  }
}`;

// All 15 MCP tools (fix #4)
const mcpToolsExample = `# Auth
# auth_status          — check whether the current token is valid and what scopes it has
# start_device_flow    — begin CLI device-flow auth; returns a verification URL for the user
# poll_device_flow     — poll the device-flow until approved; returns an agent token on success

# Discovery
# get_app_contract     — self-contained walkthrough for AI agents new to Floom
# list_app_templates   — browse scaffolding templates (e.g. multi_file_python, csv_stats)
# get_app_template     — fetch a template by key and return its file map
# find_candidate_apps  — scan a directory for floom.yaml files (file scan, not natural-language search)

# Apps
# list_apps            — list all apps owned by the authenticated user
# get_app              — fetch metadata for a specific app by slug
# validate_manifest    — validate a floom.yaml before deploying (returns errors/warnings)
# publish_app          — deploy an app from a file map (no local filesystem required)

# Execution
# run_app              — run any public or owned app by slug; returns output synchronously
# get_execution        — fetch the status and output of an async execution by ID

# Connections
# list_my_connections  — list the caller's active OAuth connections
# set_secret           — set a secret value for an app (requires publish scope)`;

const mcpRunExample = `# Claude calls run_app internally when you say:
# "Run my floom app csv-stats with this CSV..."
POST https://floom.dev/mcp
tool: run_app
arguments: { "slug": "csv-stats", "inputs": { "csv": "name,score\\nAlice,90" } }`;

const integrationsExample = `# 1. Connect Gmail in your Floom settings (one-time browser OAuth)
# 2. Declare the integration in floom.yaml — no manual copy step:
#    integrations: gmail

# 3. Use it in your Python app — COMPOSIO_CONNECTION_ID is auto-injected at run time:
import os
from composio import ComposioToolSet, Action

toolset = ComposioToolSet(entity_id=os.environ["COMPOSIO_CONNECTION_ID"])
result = toolset.execute_action(
    action=Action.GMAIL_SEND_EMAIL,
    params={"recipient_email": "...", "subject": "...", "body": "..."},
)`;

const asyncFireAndForgetExample = `# Fire-and-forget — returns 202 immediately
curl -X POST https://floom.dev/api/apps/my-app/run \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"text":"process this"}}'
# Response: 202 { "execution_id": "exec_abc123", "status": "queued" }`;

const asyncPollExample = `# Poll until terminal status
while true; do
  STATUS=$(curl -s https://floom.dev/api/executions/exec_abc123 \\
    -H 'Authorization: Bearer YOUR_AGENT_TOKEN' | jq -r '.status')
  echo "Status: $STATUS"
  if [[ "$STATUS" == "succeeded" || "$STATUS" == "failed" || "$STATUS" == "timed_out" || "$STATUS" == "cancelled" ]]; then
    break
  fi
  sleep 1
done

# Read the result
curl -s https://floom.dev/api/executions/exec_abc123 \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' | jq '.output'`;

const asyncSyncBudgetExample = `# Sync style with up to 250s budget — blocks until done or times out
curl -X POST 'https://floom.dev/api/apps/my-app/run?wait=true' \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"text":"process this"}}'`;

const ciExample = `# GitHub Actions
- name: Deploy Floom app
  env:
    FLOOM_API_KEY: \${{ secrets.FLOOM_API_KEY }}
  run: |
    npx @floomhq/cli@latest deploy

# Run and capture JSON output
OUTPUT=$(npx @floomhq/cli@latest run my-app '{"text":"test"}' --json)
echo "$OUTPUT" | jq '.output'`;

// ── Components ───────────────────────────────────────────────

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-t border-[#ded8cc] py-10 scroll-mt-[88px]">
      <h2 className="group flex items-center gap-2 text-2xl font-black tracking-tight text-[#11110f]">
        {title}
        <a
          href={`#${id}`}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-300 hover:text-neutral-500 font-normal text-lg no-underline"
          aria-label={`Link to ${title}`}
        >
          #
        </a>
      </h2>
      <div className="mt-4 space-y-4 text-neutral-600">{children}</div>
    </section>
  );
}

function CodeBlock({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="relative group">
      {label && (
        <div className="text-xs font-semibold text-neutral-400 mb-1.5 tracking-wide">{label}</div>
      )}
      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-[#e0dbd0] bg-[#f5f4ed] p-4 text-sm leading-7 text-[#2a2520] font-mono">
        <code>{children}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 opacity-40 group-hover:opacity-100 transition-opacity rounded-md border border-[#ddd8cc] bg-white px-2 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-800 hover:border-neutral-400"
        aria-label="Copy code"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function IC({ children }: { children: ReactNode }) {
  return (
    <code className="rounded px-1.5 py-0.5 bg-[#f0ede6] border border-[#e0dbd0] text-[0.85em] font-mono text-[#2a2520]">
      {children}
    </code>
  );
}

function TocSidebar({ activeId }: { activeId: string }) {
  return (
    <aside
      className="hidden lg:block w-52 flex-shrink-0 self-start sticky top-[64px]"
      aria-label="Table of contents"
    >
      <div className="max-h-[calc(100vh-80px)] overflow-y-auto">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          On this page
        </p>
        <nav>
          <ul className="space-y-0.5">
            {TOC_ITEMS.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={`block text-sm px-2 py-1 transition-colors rounded ${
                    activeId === item.id
                      ? "text-[#047857] font-semibold bg-emerald-50"
                      : "text-neutral-500 hover:text-[#11110f] hover:bg-[#f5f4ed]"
                  }`}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}

// Mobile TOC dropdown (fix #3)
function MobileToc() {
  return (
    <details className="lg:hidden sticky top-[56px] z-10 bg-[#faf9f5] border-b border-[#e0dbd0] px-4 py-2">
      <summary className="text-sm font-semibold cursor-pointer text-[#11110f]">On this page</summary>
      <nav className="mt-2 pb-2">
        <ul className="space-y-1">
          {TOC_ITEMS.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="block text-sm py-1 text-neutral-600 hover:text-[#047857] transition-colors"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function DocsContent() {
  const [activeId, setActiveId] = useState<string>("getting-started");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const ids = TOC_ITEMS.map((t) => t.id);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-72px 0px -60% 0px" }
    );

    elements.forEach((el) => observerRef.current!.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <main id="main" className="min-h-screen bg-[#faf9f5] text-[#11110f]">
      <SiteHeader />

      <div className="mx-auto max-w-6xl px-5 py-14">
        {/* Hero */}
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-semibold text-emerald-700">
            Floom docs
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Publish a small AI app from your CLI, run it from anywhere.
          </h1>
          <p className="mt-4 text-lg text-neutral-600">
            Write a Python script, add a <IC>floom.yaml</IC>, and deploy. Floom handles the sandbox, API endpoint, browser UI, MCP tool, and secrets. You own the code.
          </p>
          {/* Fix #9: primary CTA is "Try the live demo", secondary is "Mint an agent token" */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/p/meeting-action-items"
              className="rounded-md bg-[#11110f] px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 transition-colors"
            >
              Try the live demo
            </Link>
            <Link
              href="/tokens"
              className="rounded-md border border-[#ded8cc] bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:border-neutral-400 transition-colors"
            >
              Mint an agent token
            </Link>
          </div>
        </div>

        {/* Mobile TOC (fix #3) */}
        <div className="mt-8">
          <MobileToc />
        </div>

        {/* Two-column layout: sticky sidebar + scrollable content */}
        <div className="mt-4 lg:mt-12 flex gap-14">
          <TocSidebar activeId={activeId} />

          <article className="min-w-0 flex-1">

            <Section id="getting-started" title="Getting started">
              <p>
                Three minutes from zero to a running app. You need Node.js installed for the CLI.
              </p>
              <p className="text-sm text-neutral-500">
                The snippet below uses <IC>npx</IC> so you can try without installing. For repeated use, install once with <IC>npm install -g @floomhq/cli@latest</IC> and drop the <IC>npx @floomhq/cli@latest</IC> prefix.
              </p>
              <CodeBlock label="Terminal">{launchCommand}</CodeBlock>
              <ol className="list-decimal space-y-2 pl-5">
                <li><strong>Setup</strong>: opens a browser page to link your account. Token saved to <IC>~/.floom/config.json</IC>.</li>
                <li><strong>Init</strong>: scaffolds <IC>floom.yaml</IC> and <IC>app.py</IC> in the current directory.</li>
                <li><strong>Deploy</strong>: bundles the directory, uploads it, and registers the app under your account.</li>
                <li><strong>Run</strong>: fires a synchronous run, waits for output, prints JSON.</li>
              </ol>
              <p className="text-sm text-neutral-500">
                After deploy, your app is live at <IC>https://floom.dev/p/your-slug</IC> with a browser UI, REST endpoint, and MCP tool, no extra config.
              </p>
            </Section>

            <Section id="what-is-a-floom-app" title="What is a Floom app?">
              <p>
                A Floom app is a directory with a <IC>floom.yaml</IC> at the root. The manifest declares the slug, the run command, optional input/output schemas, and any secret names the app needs.
              </p>
              <p>
                When you deploy, Floom bundles the directory into a <IC>.tar.gz</IC>, stores it, and registers the metadata. When someone runs the app, Floom spins up a stock E2B sandbox, extracts the bundle, installs declared dependencies, and executes the command.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Each run is isolated: a fresh sandbox, no state from previous runs.</li>
                <li>Inputs arrive via <IC>stdin</IC> and the <IC>FLOOM_INPUTS</IC> env var as JSON.</li>
                <li>Output is whatever the command prints to stdout, optionally validated against a schema.</li>
                <li>Python and Node.js both work. Python is the primary target.</li>
              </ul>
              <p className="text-sm text-neutral-500">
                Floom is a thin wrapper. It does not rewrite your code or proxy HTTP traffic. The E2B sandbox is the execution environment; see <a className="underline" href="https://e2b.dev/docs" target="_blank" rel="noreferrer">e2b.dev/docs</a> for available system packages and preinstalled tools.
              </p>
            </Section>

            <Section id="manifest-reference" title="Manifest reference (floom.yaml)">
              <p>
                The manifest lives at the root of your app directory. Only <IC>slug</IC> is required.
              </p>
              <CodeBlock label="floom.yaml: all fields">{manifestFull}</CodeBlock>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[#ded8cc]">
                      <th className="text-left py-2 pr-4 font-semibold text-[#11110f]">Field</th>
                      <th className="text-left py-2 pr-4 font-semibold text-[#11110f]">Required</th>
                      <th className="text-left py-2 font-semibold text-[#11110f]">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0ede6]">
                    {[
                      ["slug", "Yes", "URL-safe identifier. Used in /p/:slug, API, and MCP calls."],
                      ["name", "No", "Display name shown in the browser UI and app cards. Defaults to slug if omitted."],
                      ["command", "No", "Shell command to run the app. Auto-detected from app.py or index.js if omitted."],
                      ["input_schema", "No", "Relative path to a JSON Schema file. Floom validates inputs before running."],
                      ["output_schema", "No", "Relative path to a JSON Schema file. Floom validates stdout output against this."],
                      ["public", "No", "true = anyone can run without auth. Default: false."],
                      ["secrets", "No", "List of secret names. Values set via CLI or REST, injected as env vars at run time."],
                      ["dependencies.python", "No", "Path to requirements.txt, optionally with --require-hashes."],
                      ["bundle_exclude", "No", "List of paths/globs to skip when building the bundle."],
                    ].map(([field, req, desc]) => (
                      <tr key={field}>
                        <td className="py-2 pr-4 font-mono text-sm text-[#2a2520]">{field}</td>
                        <td className="py-2 pr-4 text-neutral-500">{req}</td>
                        <td className="py-2 text-neutral-600">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-neutral-500 mt-2">
                Legacy v0.1 manifests (with <IC>runtime</IC>, <IC>entrypoint</IC>, <IC>handler</IC>) still deploy and run unchanged.
              </p>
              <CodeBlock label="Legacy format (still supported)">{legacyManifest}</CodeBlock>
            </Section>

            <Section id="input-output-schemas" title="Input / output schemas">
              <p>
                Schemas are standard <a className="underline" href="https://json-schema.org" target="_blank" rel="noreferrer">JSON Schema</a> files. They drive the browser form UI, API validation, and MCP argument descriptions.
              </p>
              <CodeBlock label="input.schema.json">{inputSchemaExample}</CodeBlock>
              <p>
                The <IC>x-floom-format: textarea</IC> extension renders the field as a multiline textarea in the browser UI. Supported values: <IC>textarea</IC>, <IC>file</IC>.
              </p>
              <CodeBlock label="output.schema.json">{outputSchemaExample}</CodeBlock>
              <p>
                If <IC>output_schema</IC> is declared, your app must print a JSON object as the last line of stdout, or write it to <IC>/home/user/output.json</IC>.
              </p>
              <CodeBlock label="Output behaviour by config">{outputModes}</CodeBlock>

              {/* Fix #8: enum / min-max / pattern / oneOf examples */}
              <div className="mt-6">
                <p className="font-semibold text-[#11110f]">Supported schema constraints</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Floom passes standard JSON Schema constraints through to validation. Use any of these in your input or output schemas.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <CodeBlock label="Enum: restrict to a fixed set of values">{schemaEnumExample}</CodeBlock>
                  </div>
                  <div>
                    <CodeBlock label="Min / max: bound a numeric range">{schemaMinMaxExample}</CodeBlock>
                  </div>
                  <div>
                    <CodeBlock label="Pattern: validate a string with regex">{schemaPatternExample}</CodeBlock>
                  </div>
                  <div>
                    <CodeBlock label="oneOf: discriminated union of shapes">{schemaOneOfExample}</CodeBlock>
                  </div>
                </div>
              </div>
            </Section>

            <Section id="secrets" title="Secrets">
              <p>
                Secrets are encrypted at rest. Only the names go in <IC>floom.yaml</IC>; the values are set separately and injected as environment variables at run time.
              </p>
              <CodeBlock label="Terminal">{secretsExample}</CodeBlock>
              <ul className="list-disc space-y-2 pl-5">
                <li>Use <IC>--value-stdin</IC> to keep the value out of shell history.</li>
                <li>Names must be uppercase letters, digits, and underscores (e.g. <IC>OPENAI_API_KEY</IC>).</li>
                <li>Undeclared secrets are never injected, even if the values exist.</li>
                <li>Delete a secret: <IC>DELETE /api/apps/:slug/secrets</IC> with secret name in the request body and an agent token.</li>
              </ul>
            </Section>

            <Section id="authentication" title="Authentication">
              <p>Three ways to authenticate:</p>
              <div className="space-y-5">
                <div>
                  <p className="font-semibold text-[#11110f]">1. Browser sign-in</p>
                  <p className="mt-1">Google OAuth at <a href="/login" className="underline">floom.dev/login</a>. Creates a session for the browser UI.</p>
                </div>
                <div>
                  <p className="font-semibold text-[#11110f]">2. CLI device flow</p>
                  <p className="mt-1">Runs when you execute <IC>floom setup</IC>. Opens a browser confirmation page; the CLI polls until you approve.</p>
                  <CodeBlock>{setupExample}</CodeBlock>
                </div>
                <div>
                  <p className="font-semibold text-[#11110f]">3. Agent tokens</p>
                  <p className="mt-1">
                    Create at <a href="/tokens" className="underline">floom.dev/tokens</a>. Use in the <IC>Authorization: Bearer</IC> header for REST calls, or as the <IC>FLOOM_API_KEY</IC> env var for the CLI. Scopes: <IC>read</IC>, <IC>run</IC>, <IC>publish</IC>.
                  </p>
                </div>
              </div>
            </Section>

            <Section id="run-through-api" title="Run through API">
              <p>
                Every app gets a REST run endpoint at <IC>POST /api/apps/:slug/run</IC>. Public apps need no auth; private apps require a session cookie or agent token.
              </p>
              <CodeBlock label="Public app">{apiPublicExample}</CodeBlock>
              <CodeBlock label="Private app">{apiPrivateExample}</CodeBlock>
              <p>Response envelope:</p>
              <CodeBlock label="Response">{apiResponseExample}</CodeBlock>
              <p className="text-sm text-neutral-500">
                Sandbox boot failures return HTTP 502 with <IC>error: sandbox_unavailable</IC>. Install errors and non-zero exits return HTTP 200 with <IC>status: failed</IC>.
              </p>
            </Section>

            <Section id="async-runs" title="Async runs">
              <p>
                Apps that may run longer than 250 seconds should be called <strong>without</strong> <IC>?wait=true</IC>. The default POST returns <IC>202</IC> with an <IC>execution_id</IC> immediately; your code then polls until the status is terminal.
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li><strong>POST without <IC>?wait=true</IC></strong>: returns <IC>202 {`{ execution_id, status: "queued" }`}</IC> right away.</li>
                <li><strong>Poll <IC>GET /api/executions/:id</IC></strong> every 1-2 s until <IC>status</IC> is <IC>succeeded</IC>, <IC>failed</IC>, <IC>timed_out</IC>, or <IC>cancelled</IC>.</li>
                <li><strong>Read the result</strong> from <IC>.output</IC> in the final poll response.</li>
              </ol>
              <CodeBlock label="Step 1: fire and forget">{asyncFireAndForgetExample}</CodeBlock>
              <CodeBlock label="Step 2: poll for result">{asyncPollExample}</CodeBlock>
              <p>
                The <IC>floom run</IC> CLI does this polling automatically, no extra code needed for command-line use.
              </p>
              <p>
                If you prefer a blocking call with a time budget, pass <IC>?wait=true</IC> to wait up to 250 s for completion:
              </p>
              <CodeBlock label="Sync style (up to 250s budget)">{asyncSyncBudgetExample}</CodeBlock>
              <p className="text-sm text-neutral-500">
                Async mode is the default for REST calls. Only use <IC>?wait=true</IC> when you need a single blocking response and your app reliably finishes within 250 s.
              </p>
            </Section>

            <Section id="mcp-for-ai-agents" title="MCP for AI agents">
              <p>
                Floom exposes a Model Context Protocol server at <IC>https://floom.dev/mcp</IC>. Add it to Claude Desktop, Cursor, or any MCP-compatible client.
              </p>
              <CodeBlock label="Claude Desktop config">{mcpConfigExample}</CodeBlock>
              {/* Fix #4: all 15 MCP tools with descriptions grouped by purpose */}
              <CodeBlock label="All 15 available tools">{mcpToolsExample}</CodeBlock>
              <p>
                The <IC>get_app_contract</IC> tool returns a self-contained walkthrough designed for AI agents that need to understand how Floom works before building or running apps.
              </p>
              <CodeBlock label="Example MCP call">{mcpRunExample}</CodeBlock>
              <p className="text-sm text-neutral-500">
                Agent tokens with <IC>run</IC> scope can run any owned private app. Tokens with <IC>publish</IC> scope can deploy via <IC>publish_app</IC>.
              </p>
            </Section>

            <Section id="connections" title="Connections">
              <p>
                Apps that need to call external services can use Floom Connections. Connect your accounts once via OAuth in Settings, then declare the service in your manifest — Floom injects the connection automatically at run time.
              </p>
              <CodeBlock label="Python app using Gmail">{integrationsExample}</CodeBlock>
              <p className="text-sm text-neutral-600 mt-3">
                No manual copy step needed. Floom reads your active connection at run time and injects <IC>COMPOSIO_CONNECTION_ID</IC> (and <IC>COMPOSIO_&lt;SERVICE&gt;_CONNECTION_ID</IC> for multi-service apps) automatically. If you have not connected the service yet, the run returns HTTP 412 with a link to <IC>/connections</IC>.
              </p>
              <p>
                77 managed-auth providers available, including <strong>Gmail</strong>, <strong>Slack</strong>, <strong>GitHub</strong>, <strong>Notion</strong>, <strong>Linear</strong>, <strong>Google Calendar</strong>, <strong>HubSpot</strong>, <strong>Stripe</strong>, <strong>Salesforce</strong>, <strong>Asana</strong>, <strong>Airtable</strong>, <strong>Discord</strong>, <strong>Zoom</strong>, <strong>Trello</strong>, <strong>Figma</strong>, <strong>Mailchimp</strong>, <strong>Outlook</strong>, <strong>Google Drive</strong>, <strong>Google Docs</strong>, <strong>Google Sheets</strong>, <strong>Calendly</strong>, <strong>Sentry</strong>, <strong>Supabase</strong>, and more. See the full list at <a href="/connections" className="underline">floom.dev/connections</a>.
              </p>
              <p className="text-sm text-neutral-500">
                OAuth tokens are proxied server-side; your credentials are never stored in the app bundle or visible in logs. Rate limit on the connections proxy: 60 calls per minute per token.
              </p>
            </Section>

            <Section id="examples" title="Examples">
              <p>Five working apps you can run now or use as a starting point:</p>
              <div className="space-y-3">
                {[
                  {
                    slug: "meeting-action-items",
                    name: "Meeting action items",
                    desc: "Paste a meeting transcript; get back a list of action items and a summary. Uses Gemini.",
                    template: "meeting_action_items",
                  },
                  {
                    slug: "invoice-calculator",
                    name: "Invoice calculator",
                    desc: "Enter line items and hourly rates; get a formatted invoice total with tax breakdown.",
                    template: null,
                  },
                  {
                    slug: "utm-url-builder",
                    name: "UTM URL builder",
                    desc: "Generate properly encoded UTM-tagged URLs from campaign parameters.",
                    template: null,
                  },
                  {
                    slug: "csv-stats",
                    name: "CSV stats",
                    desc: "Upload a CSV; get column types, row count, min/max, mean, and null counts.",
                    template: "csv_stats",
                  },
                  {
                    slug: "multi-file-python",
                    name: "Multi-file Python",
                    desc: "Starter template: multi-file Python app with helpers, shared logic, and requirements.txt.",
                    template: "multi_file_python",
                  },
                ].map((app) => (
                  <div key={app.slug} className="rounded-xl border border-[#ded8cc] bg-white p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#11110f]">{app.name}</p>
                        <p className="mt-0.5 text-sm text-neutral-500">{app.desc}</p>
                      </div>
                      <div className="flex flex-shrink-0 gap-2">
                        <Link
                          href={`/p/${app.slug}`}
                          className="rounded-md border border-[#ded8cc] px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-neutral-400 transition-colors whitespace-nowrap"
                        >
                          Run app
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="ci-automation" title="CI / automation">
              <p>
                Set <IC>FLOOM_API_KEY</IC> as a repository secret and reference it in your workflow. The CLI reads it automatically, no <IC>floom setup</IC> needed in CI.
              </p>
              <CodeBlock label="GitHub Actions">{ciExample}</CodeBlock>
              <p>
                The <IC>--json</IC> flag makes <IC>floom run</IC> print a machine-readable envelope. Exit code: 0 on success, 1 on app failure, 2 on network or auth error.
              </p>
              <p className="text-sm text-neutral-500">
                For programmatic deploys without the CLI, use <IC>POST /api/apps/publish</IC> with a <IC>multipart/form-data</IC> body containing the tarball and a <IC>meta</IC> JSON field.
              </p>
            </Section>

            <Section id="limits" title="Limits">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[#ded8cc]">
                      <th className="text-left py-2 pr-6 font-semibold text-[#11110f]">Limit</th>
                      <th className="text-left py-2 font-semibold text-[#11110f]">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0ede6]">
                    {[
                      ["Sync run cap", "290 seconds (Vercel Pro 300s ceiling, 10s response buffer)"],
                      ["Anonymous public rate limit", "20 runs / caller / 60s"],
                      ["Per-app public rate limit", "100 runs / 60s"],
                      ["Per-app E2B quota", "30 min / day"],
                      ["Per-owner E2B quota", "2 hours / day across all apps"],
                      ["Bundle compressed size", "5 MB"],
                      ["Bundle unpacked size", "25 MB"],
                      ["Single file size", "10 MB"],
                      ["File count per bundle", "500"],
                      ["Connections proxy rate limit", "60 calls / min / token"],
                      ["Max concurrent runs (default)", "10"],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td className="py-2 pr-6 text-neutral-600">{label}</td>
                        <td className="py-2 font-mono text-[#2a2520]">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Fix #1: corrected footnote from "60-second cap" to "290-second cap" */}
              <p className="text-sm text-neutral-500">
                Runs exceeding the 290-second cap return <IC>status: timed_out</IC>. For longer jobs, see the Async runs section.
              </p>
            </Section>

            <Section id="faq" title="FAQ">
              <div className="space-y-6">
                {[
                  {
                    q: "Why does my app fail with 'command not found'?",
                    a: "The sandbox starts with a stock E2B image. If your app needs a system package (ffmpeg, pandoc, etc.), install it at the top of your run command: command: bash -c 'apt-get install -y ffmpeg -q && python app.py'.",
                  },
                  {
                    q: "How do I update an app?",
                    a: "Run floom deploy again from the same directory. Floom creates a new bundle version. The slug stays the same; in-flight runs complete on the old bundle.",
                  },
                  {
                    q: "How do I delete an app?",
                    a: "DELETE /api/apps/:slug with an agent token that has publish scope. There is no CLI shortcut yet.",
                  },
                  {
                    q: "Can I run JavaScript or TypeScript?",
                    a: "Yes. Add a package.json with a start script and Floom runs npm install && npm start. TypeScript needs a compile step; add it to the start script or use ts-node.",
                  },
                  {
                    q: "Is my app code private?",
                    a: "Apps with public: false are private. The bundle is stored with owner-only access. Public apps have their source viewable at /p/:slug.",
                  },
                  {
                    q: "Can I pass a file as input?",
                    a: "Use x-floom-format: file on a string field in your input schema. The browser UI shows a file picker. The file is base64-encoded and sent as the field value.",
                  },
                  {
                    q: "My Gemini key is hitting quota. What should I do?",
                    a: "Add your own GEMINI_API_KEY as a secret and use it in your app. The free Gemini tier allows roughly 15 requests per minute; upgrade to a paid key for higher throughput.",
                  },
                  {
                    q: "How do I run a job that takes longer than 5 minutes?",
                    a: "Use async mode: POST without ?wait=true to get an execution_id immediately, then poll GET /api/executions/:id until the status is succeeded or failed. The sandbox timeout is 290 seconds per run. For jobs longer than that, split the work across multiple runs or restructure the job.",
                  },
                  {
                    q: "Can I update my account email?",
                    a: "Not via the UI yet. Email team@floom.dev with your current email and the new one; we update it manually during alpha.",
                  },
                ].map(({ q, a }) => (
                  <div key={q}>
                    <p className="font-semibold text-[#11110f]">{q}</p>
                    <p className="mt-1 text-neutral-600">{a}</p>
                  </div>
                ))}
              </div>
            </Section>

          </article>
        </div>
      </div>

      {/* Fix #10: last-updated + version indicator */}
      <div className="border-t border-[#ded8cc] bg-[#faf9f5]">
        <div className="mx-auto max-w-6xl px-5 py-4">
          <p className="text-xs text-neutral-400">
            Last updated: 2026-05-04 · Floom v0.4
          </p>
        </div>
      </div>

      <FloomFooter />
    </main>
  );
}
