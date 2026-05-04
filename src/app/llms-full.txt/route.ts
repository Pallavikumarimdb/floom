import { NextResponse } from "next/server";

// Auto-generated from /docs/* page sources. Concatenated in TOC order.
// Last updated: 2026-05-04 · Floom v0.4
const CONTENT = `# Floom v0.4 — Full Documentation for LLMs

> Floom is a deployment platform for small Python (and Node.js) AI apps. A Floom app is a Python script plus a JSON Schema for inputs/outputs. After floom deploy, the app gets a public URL, a REST API, and an MCP endpoint — no servers, no Docker, no infrastructure work.

This file contains the complete Floom documentation concatenated for LLM consumption.
Short summary and quick-reference: https://floom.dev/llms.txt

---

## Quick start

URL: https://floom.dev/docs/quickstart

Three minutes from zero to a running app. You need Node.js installed for the CLI.

### 1. Authenticate

Run \`npx @floomhq/cli@latest setup\` once per machine. It opens a browser page to link your Floom account. The token is saved to \`~/.floom/config.json\`.

In CI, set the FLOOM_API_KEY env var instead — no setup command needed.

### 2. Scaffold

\`floom init\` generates three files in the current directory:
- floom.yaml — the app manifest
- app.py — a minimal Python app
- requirements.txt — empty, ready to fill

### 3. Deploy

\`floom deploy\` bundles the current directory into a .tar.gz, uploads it, and registers the app under your account. The slug from floom.yaml becomes the app ID.

After deploy, the app is live at https://floom.dev/p/your-slug with a browser UI, REST endpoint, and MCP tool — no extra config.

### 4. Run it

\`\`\`bash
# 1. Authenticate (once per machine)
npx @floomhq/cli@latest setup

# 2. Scaffold a new app
mkdir my-floom-app && cd my-floom-app
npx @floomhq/cli@latest init --name "My App" --slug my-app --type custom

# 3. Deploy
npx @floomhq/cli@latest deploy

# 4. Run it
npx @floomhq/cli@latest run my-app '{"text":"hello"}' --json
\`\`\`

### What is a Floom app?

A Floom app is a directory with a floom.yaml at the root. The manifest declares the slug, the run command, optional input/output schemas, and any secret names the app needs.

When you deploy, Floom bundles the directory, stores it, and registers the metadata. When someone runs the app, Floom spins up a stock E2B sandbox, extracts the bundle, installs declared dependencies, and executes the command.

- Each run is isolated — a fresh sandbox, no state from previous runs.
- Inputs arrive via stdin and the FLOOM_INPUTS env var as JSON.
- Output is whatever the command prints to stdout, optionally validated against a schema.
- Python and Node.js both work. Python is the primary target.

Floom is a thin wrapper. It does not rewrite your code or proxy HTTP traffic. The E2B sandbox is the execution environment; see e2b.dev/docs for available system packages and preinstalled tools.

---

## Manifest reference (floom.yaml)

URL: https://floom.dev/docs/manifest

The floom.yaml lives at the root of your app directory. Only slug is required.

\`\`\`yaml
slug: my-app
# The command to run. Auto-detected from app.py / index.js if omitted.
command: python app.py
# Relative path to a JSON Schema file for inputs (optional but recommended).
input_schema: ./input.schema.json
# Relative path to a JSON Schema file for outputs (optional).
output_schema: ./output.schema.json
# Make the app publicly runnable without auth.
public: true
# Secret names to inject as env vars at run time. Values are set separately.
# Default scope is per_runner; use scope: shared to inject creator's key for every caller.
secrets:
  - OPENAI_API_KEY                     # scope: per_runner (default)
  - name: GEMINI_API_KEY
    scope: shared                       # creator's key injected for every runner
# Composio integrations: auto-inject the runner's active connection at run time.
# composio: gmail
# composio:
#   - gmail
#   - slack
# Optional: additional pip deps installed before the run command.
# dependencies:
#   python: ./requirements.txt --require-hashes
# Optional: paths to skip when building the bundle.
# bundle_exclude:
#   - fixtures/large-dataset.csv
\`\`\`

### Fields

| Field | Required | Description |
|---|---|---|
| slug | Yes | URL-safe identifier. Used in /p/:slug, API, and MCP calls. |
| name | No | Display name shown in the browser UI and app cards. Defaults to slug if omitted. |
| command | No | Shell command to run the app. Auto-detected from app.py or index.js if omitted. |
| input_schema | No | Relative path to a JSON Schema file. Floom validates inputs before running. |
| output_schema | No | Relative path to a JSON Schema file. Floom validates stdout output against this. |
| public | No | true = anyone can run without auth. Default: false. |
| secrets | No | List of secret names or objects with name + optional scope. Default scope: per_runner. Use scope: shared to inject creator's key for every caller. |
| composio | No | Toolkit slug or list of slugs (e.g. gmail, slack). Floom auto-injects COMPOSIO_CONNECTION_ID at run time. |
| dependencies.python | No | Path to requirements.txt, optionally with --require-hashes. |
| bundle_exclude | No | List of paths/globs to skip when building the bundle. |

### Legacy v0.1 format (still supported)

\`\`\`yaml
# Legacy v0.1 shape — still works, no migration needed
name: Meeting Action Items
slug: meeting-action-items
runtime: python
entrypoint: app.py
handler: run
public: true
input_schema: ./input.schema.json
output_schema: ./output.schema.json
dependencies:
  python: ./requirements.txt
\`\`\`

---

## Input / output schemas

URL: https://floom.dev/docs/schemas

Schemas are standard JSON Schema files (https://json-schema.org). They drive the browser form UI, API validation, and MCP argument descriptions.

### Input schema example

\`\`\`json
{
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
}
\`\`\`

### x-floom-format extension

Floom-specific extension on any string field. Controls how the browser UI renders the field.

| Value | Renders as |
|---|---|
| textarea | Multiline text area |
| file | File picker. File is base64-encoded and sent as the field value. |

### Output schema example

\`\`\`json
{
  "type": "object",
  "properties": {
    "action_items": {
      "type": "array",
      "items": { "type": "string" }
    },
    "summary": { "type": "string" }
  }
}
\`\`\`

If output_schema is declared, your app must print a JSON object as the last line of stdout, or write it to /home/user/output.json.

Output behaviour by config:
- With output_schema declared: app prints JSON on stdout (last line), or writes /home/user/output.json; Floom validates and returns parsed JSON
- No output_schema, stdout is valid JSON: Floom returns the parsed JSON directly
- No output_schema, plain stdout: Floom returns { "stdout": "<last 4 KB>", "exit_code": 0 }

### Schema constraints

Floom passes standard JSON Schema constraints through to validation:

Enum (restrict to a fixed set of values):
\`\`\`json
{ "type": "string", "title": "Size", "enum": ["small", "medium", "large"] }
\`\`\`

Min / max (bound a numeric range):
\`\`\`json
{ "type": "integer", "title": "Count", "minimum": 1, "maximum": 100 }
\`\`\`

Pattern (validate a string with regex):
\`\`\`json
{ "type": "string", "title": "Slug", "pattern": "^[a-z][a-z0-9-]{0,30}$" }
\`\`\`

oneOf (discriminated union of shapes):
\`\`\`json
{
  "oneOf": [
    { "type": "object", "properties": { "kind": { "const": "url" }, "url": { "type": "string" } }, "required": ["kind", "url"] },
    { "type": "object", "properties": { "kind": { "const": "text" }, "text": { "type": "string" } }, "required": ["kind", "text"] }
  ]
}
\`\`\`

---

## Secrets

URL: https://floom.dev/docs/secrets

Secrets are encrypted at rest. Only the names go in floom.yaml; the values are set separately and injected as environment variables at run time.

### Set via CLI

\`\`\`bash
# Set a secret via stdin (never echoed to shell history)
npx @floomhq/cli@latest secrets set my-app OPENAI_API_KEY --value-stdin
\`\`\`

- Use --value-stdin to keep the value out of shell history.
- Names must be uppercase letters, digits, and underscores — e.g. OPENAI_API_KEY.
- Undeclared secrets are never injected, even if the values exist.

### Set via REST

\`\`\`bash
curl -X PUT https://floom.dev/api/apps/my-app/secrets \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"OPENAI_API_KEY","value":"sk-..."}'
\`\`\`

Requires an agent token with publish scope.

### Delete a secret

DELETE /api/apps/:slug/secrets/:name with an agent token that has publish scope. There is no CLI shortcut yet.

### Secret scopes: per_runner vs shared

Every secret has a scope that controls whose value is injected at run time.

- **per_runner (default):** each user who runs the app provides their own value. Declare with just the name, or explicitly with scope: per_runner.
- **shared (demo-subsidy mode):** the app creator's value is injected for every caller, including anonymous visitors. Use with rate limits — you absorb the API cost.

\`\`\`yaml
secrets:
  - name: OPENAI_API_KEY          # scope: per_runner (default)
  - name: GEMINI_API_KEY
    scope: shared                  # creator's key injected for every runner
\`\`\`

Warning: with scope: shared, your API keys are charged for every run by every caller. Always pair shared secrets with rate limits.

### Rules

- Secret values are never visible in logs or the browser UI.
- Values are scoped to a single app slug — not shared across apps.
- Declaring a secret name in floom.yaml is required; the value must be set separately before the first run that needs it.
- scope: per_runner is the default. Use scope: shared only for demo apps you want to subsidize.

---

## Authentication

URL: https://floom.dev/docs/auth

Three ways to authenticate with Floom.

### 1. Browser sign-in

Google OAuth at https://floom.dev/login. Creates a session for the browser UI. No API access — use agent tokens for programmatic calls.

### 2. CLI device flow

Runs when you execute \`floom setup\`. Opens a browser confirmation page; the CLI polls until you approve. The resulting token is saved to ~/.floom/config.json.

\`\`\`bash
# Opens a browser page to authorise your CLI. Run once per machine.
npx @floomhq/cli@latest setup

# Token is saved to ~/.floom/config.json
# Or export it manually:
export FLOOM_API_KEY=<your-agent-token>
\`\`\`

### 3. Agent tokens

Create at https://floom.dev/tokens. Use in the Authorization: Bearer header for REST calls, or as the FLOOM_API_KEY env var for the CLI.

| Scope | Allows |
|---|---|
| read | List apps, fetch metadata, view executions. |
| run | Run any owned private app. Run public apps (no auth needed for those). |
| publish | Deploy apps, set secrets, delete secrets. |

Tokens do not expire. Revoke them from the tokens page at any time.

---

## REST API

URL: https://floom.dev/docs/api

Every app gets a REST run endpoint at POST /api/apps/:slug/run. Public apps need no auth; private apps require a session cookie or agent token.

### Run an app

\`\`\`bash
# Public app — no auth needed
curl -X POST https://floom.dev/api/apps/meeting-action-items/run \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"transcript":"Alice: Let us ship by Friday..."}}'

# Private app — agent token required
curl -X POST https://floom.dev/api/apps/my-private-app/run \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"text":"Run this securely"}}'
\`\`\`

Response envelope:

\`\`\`json
{
  "execution_id": "exec_abc123",
  "status": "queued",
  "output": null,
  "error": null,
  "view_token": "<view-token>"
}
\`\`\`

Sandbox boot failures return HTTP 502 with error: sandbox_unavailable. Install errors and non-zero exits return HTTP 200 with status: failed.

### Async runs

Apps that may run longer than 250 seconds should be called without ?wait=true. The default POST returns 202 with an execution_id immediately; your code then polls until the status is terminal.

1. POST without ?wait=true: returns 202 { execution_id, status: "queued" } right away.
2. Poll GET /api/executions/:id every 1-2 s until status is succeeded, failed, timed_out, or cancelled.
3. Read the result from .output in the final poll response.

\`\`\`bash
# Fire-and-forget — returns 202 immediately
curl -X POST https://floom.dev/api/apps/my-app/run \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"text":"process this"}}'
# Response: 202 { "execution_id": "exec_abc123", "status": "queued" }

# Poll until terminal status
while true; do
  STATUS=$(curl -s https://floom.dev/api/executions/exec_abc123 \\
    -H 'Authorization: Bearer YOUR_AGENT_TOKEN' | jq -r '.status')
  if [[ "$STATUS" == "succeeded" || "$STATUS" == "failed" || "$STATUS" == "timed_out" || "$STATUS" == "cancelled" ]]; then
    break
  fi
  sleep 1
done

# Read the result
curl -s https://floom.dev/api/executions/exec_abc123 \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' | jq '.output'
\`\`\`

### Sync runs (?wait=true)

Pass ?wait=true to wait up to 250 s for completion. Use only when your app reliably finishes within 250 s.

\`\`\`bash
curl -X POST 'https://floom.dev/api/apps/my-app/run?wait=true' \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"text":"process this"}}'
\`\`\`

### Execution status values

| Status | Meaning |
|---|---|
| queued | Waiting for a sandbox to become available. |
| running | Sandbox started, command executing. |
| succeeded | Command exited 0. Output in .output. |
| failed | Command exited non-zero. Details in .error. |
| timed_out | Exceeded 290-second cap. |
| cancelled | Manually cancelled or auto-failed by cron sweep. |

---

## MCP for AI agents

URL: https://floom.dev/docs/mcp

Floom exposes a Model Context Protocol server at https://floom.dev/mcp. Add it to Claude Desktop, Cursor, or any MCP-compatible client.

### Add to Claude Desktop

\`\`\`json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "floom": {
      "url": "https://floom.dev/mcp",
      "headers": { "Authorization": "Bearer YOUR_AGENT_TOKEN" }
    }
  }
}
\`\`\`

Agent tokens with run scope can run any owned private app. Tokens with publish scope can deploy via publish_app.

### All 15 available tools

Auth:
- auth_status — Check whether the current token is valid and what scopes it has.
- start_device_flow — Begin CLI device-flow auth; returns a verification URL for the user.
- poll_device_flow — Poll the device-flow until approved; returns an agent token on success.

Discovery:
- get_app_contract — Self-contained walkthrough for AI agents new to Floom.
- list_app_templates — Browse scaffolding templates (e.g. multi_file_python, csv_stats).
- get_app_template — Fetch a template by key and return its file map.
- find_candidate_apps — Search for apps that match a natural-language task description.

Apps:
- list_apps — List all apps owned by the authenticated user.
- get_app — Fetch metadata for a specific app by slug.
- validate_manifest — Validate a floom.yaml before deploying (returns errors/warnings).
- publish_app — Deploy an app from a file map (no local filesystem required).

Execution:
- run_app — Run any public or owned app by slug; returns output synchronously.
- get_execution — Fetch the status and output of an async execution by ID.

Connections:
- list_my_connections — List the caller's active Composio OAuth connections.
- set_secret — Set a secret value for an app (requires publish scope).

The get_app_contract tool returns a self-contained walkthrough designed for AI agents that need to understand how Floom works before building or running apps.

### Example MCP call

\`\`\`
POST https://floom.dev/mcp
tool: run_app
arguments: { "slug": "csv-stats", "inputs": { "csv": "name,score\\nAlice,90" } }
\`\`\`

### Auto-discovery

GET https://floom.dev/.well-known/mcp returns the MCP server endpoint.

---

## Connections (Composio)

URL: https://floom.dev/docs/connections

Apps that need to call external services can use Floom Connections, powered by Composio. Connect your accounts once via OAuth in Settings, then reference the connection in your app as an env var.

### Usage in Python

\`\`\`python
# 1. Connect Gmail in your Floom settings (one-time browser OAuth)
# 2. Declare the toolkit in floom.yaml — no manual copy step:
#    composio: gmail

# 3. Use it in your Python app — COMPOSIO_CONNECTION_ID is auto-injected at run time:
import os
from composio import ComposioToolSet, Action

toolset = ComposioToolSet(entity_id=os.environ["COMPOSIO_CONNECTION_ID"])
result = toolset.execute_action(
    action=Action.GMAIL_SEND_EMAIL,
    params={"recipient_email": "...", "subject": "...", "body": "..."},
)
\`\`\`

### Available providers (77 total)

Gmail, Slack, GitHub, Notion, Linear, Google Calendar, HubSpot, Stripe, Salesforce, Asana, Airtable, Discord, Zoom, Trello, Figma, Mailchimp, Outlook, Google Drive, Google Docs, Google Sheets, Calendly, Sentry, Supabase, + 54 more.

Full list at https://floom.dev/connections.

### Security

- Composio proxies OAuth tokens; your credentials are never stored in the app bundle or visible in logs.
- Rate limit on the Composio proxy: 60 calls per minute per token.
- Connections are scoped to your Floom account.
- Revoke access at any time from your Floom settings.

---

## Examples

URL: https://floom.dev/docs/examples

Five working apps you can run now or use as a starting point:

1. Meeting action items — https://floom.dev/p/meeting-action-items
   Paste a meeting transcript; get back a list of action items and a summary. Uses Gemini.

2. Invoice calculator — https://floom.dev/p/invoice-calculator
   Enter line items and hourly rates; get a formatted invoice total with tax breakdown.

3. UTM URL builder — https://floom.dev/p/utm-url-builder
   Generate properly encoded UTM-tagged URLs from campaign parameters.

4. CSV stats — https://floom.dev/p/csv-stats
   Upload a CSV; get column types, row count, min/max, mean, and null counts.

5. Multi-file Python — https://floom.dev/p/multi-file-python
   Starter template: multi-file Python app with helpers, shared logic, and requirements.txt.

---

## CI / automation

URL: https://floom.dev/docs/ci

Use FLOOM_API_KEY as a repository secret. The CLI reads it automatically — no floom setup needed in CI.

### GitHub Actions

\`\`\`yaml
- name: Deploy Floom app
  env:
    FLOOM_API_KEY: \${{ secrets.FLOOM_API_KEY }}
  run: |
    npx @floomhq/cli@latest deploy

# Run and capture JSON output
OUTPUT=$(npx @floomhq/cli@latest run my-app '{"text":"test"}' --json)
echo "$OUTPUT" | jq '.output'
\`\`\`

The --json flag makes floom run print a machine-readable envelope. Exit code: 0 on success, 1 on app failure, 2 on network or auth error.

### Programmatic deploy (no CLI)

\`\`\`bash
curl -X POST https://floom.dev/api/apps/publish \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -F 'bundle=@./my-app.tar.gz' \\
  -F 'meta={"slug":"my-app","public":true}'
\`\`\`

Requires an agent token with publish scope.

---

## Limits

URL: https://floom.dev/docs/limits

Current limits during alpha:

| Limit | Value |
|---|---|
| Sync run cap | 290 seconds (Vercel Pro 300s ceiling, 10s response buffer) |
| Anonymous public rate limit | 20 runs / caller / 60s |
| Per-app public rate limit | 100 runs / 60s |
| Per-app E2B quota | 30 min / day |
| Per-owner E2B quota | 2 hours / day across all apps |
| Bundle compressed size | 5 MB |
| Bundle unpacked size | 25 MB |
| Single file size | 10 MB |
| File count per bundle | 500 |
| Composio proxy rate limit | 60 calls / min / token |
| Max concurrent runs (default) | 10 |

Runs exceeding the 290-second cap return status: timed_out. For longer jobs, use the async pattern.

Bundle size includes all files in the directory minus any paths in bundle_exclude. Large fixtures or datasets should be excluded or fetched at run time.

---

## FAQ

URL: https://floom.dev/docs/faq

Q: Why does my app fail with 'command not found'?
A: The sandbox starts with a stock E2B image. If your app needs a system package (ffmpeg, pandoc, etc.), install it at the top of your run command: command: bash -c 'apt-get install -y ffmpeg -q && python app.py'.

Q: How do I update an app?
A: Run floom deploy again from the same directory. Floom creates a new bundle version. The slug stays the same; in-flight runs complete on the old bundle.

Q: How do I delete an app?
A: DELETE /api/apps/:slug with an agent token that has publish scope. There is no CLI shortcut yet.

Q: Can I run JavaScript or TypeScript?
A: Yes. Add a package.json with a start script and Floom runs npm install && npm start. TypeScript needs a compile step; add it to the start script or use ts-node.

Q: Is my app code private?
A: Apps with public: false are private. The bundle is stored with owner-only access. Public apps have their source viewable at /p/:slug.

Q: Can I pass a file as input?
A: Use x-floom-format: file on a string field in your input schema. The browser UI shows a file picker. The file is base64-encoded and sent as the field value.

Q: My Gemini key is hitting quota. What should I do?
A: Add your own GEMINI_API_KEY as a secret and use it in your app. The free Gemini tier allows roughly 15 requests per minute; upgrade to a paid key for higher throughput.

---

Source: https://floom.dev/docs
Short summary: https://floom.dev/llms.txt
Operator: Floom, Inc. — team@floom.dev
`;

export const dynamic = "force-static";

export function GET() {
  return new NextResponse(CONTENT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
