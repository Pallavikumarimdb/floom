---
name: floomit
description: Find, package, publish, run, and verify Floom v0.4 apps. Authoritative reference — auto-synced from floomhq/floom-minimal on every release. Use when the user asks about Floom anything: deploying an app, writing a manifest, understanding secrets or Composio, using the CLI, or calling the REST/MCP API.
version: 0.4.0
last_synced: 2026-05-04
canonical_source: https://floom.dev/skills/floomit
---

# Floom v0.4

## What Floom is

Floom is a hosted sandbox runtime that turns Python or Node code into shareable, authenticated app URLs. You deploy a bundle (single file or multi-file tarball with dependencies), Floom provisions an E2B sandbox on demand, runs your code, and persists the result. Every app gets a browser permalink (`/p/<slug>`), a REST endpoint (`/api/apps/<slug>/run`), and an auto-registered MCP tool entry. Apps are private by default; making one public lets anyone run it anonymously. Secrets are injected at runtime — never baked into bundles. Composio integrations (Gmail, Slack, and 100+ others) are connected once per user and auto-injected per run.

---

## Manifest contract

Every app has a `floom.yaml` at the bundle root. Three valid forms:

### Form 1 — stock_e2b with explicit command (preferred for new apps)

```yaml
name: Meeting Action Items
slug: meeting-action-items
description: Extract action items from a meeting transcript using Gemini.
command: python app.py
public: true
input_schema: ./input.schema.json
output_schema: ./output.schema.json
dependencies:
  python: ./requirements.txt
secrets:
  - name: GEMINI_API_KEY
    scope: shared
composio:
  - gmail
```

### Form 2 — legacy_python (still fully supported)

```yaml
name: Pitch Coach
slug: pitch-coach
runtime: python
entrypoint: app.py
handler: run
public: true
input_schema: ./input.schema.json
output_schema: ./output.schema.json
```

`entrypoint` must be a `.py` filename; `handler` must be a valid Python identifier that exists as a top-level `def` in the entrypoint file.

### Form 3 — stock_e2b with no explicit command (auto-detect)

Omit `command:` entirely. Floom auto-detects: `app.py` → `python app.py`, `index.js` → `node index.js`, `package.json` with `scripts.start` → `npm start`. Errors if multiple candidates are found.

### All manifest fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `slug` | string | yes | lowercase, hyphens, 3–64 chars |
| `name` | string | no | display name; defaults to title-cased slug |
| `description` | string | no | shown on the app page |
| `command` | string | no | stock_e2b only; mutually exclusive with runtime/entrypoint/handler |
| `runtime` | `"python"` | legacy | legacy_python only |
| `entrypoint` | string | legacy | `.py` filename, legacy_python only |
| `handler` | string | legacy | Python function name, legacy_python only |
| `public` | boolean | no | default false |
| `input_schema` | path | no | relative path to JSON Schema file |
| `output_schema` | path | no | relative path to JSON Schema file |
| `dependencies.python` | `./requirements.txt` | no | enables pip install from requirements.txt |
| `secrets` | array | no | up to 10 entries; see Secrets section |
| `composio` | string or string[] | no | up to 20 toolkit slugs; see Composio section |
| `bundle_exclude` | string[] | no | glob patterns to omit from the tarball |

---

## Bundle structure

**Single-file app:**
```
app.py
floom.yaml
input.schema.json    # optional
output.schema.json   # optional
```

**Multi-file app with dependencies:**
```
floom.yaml
app.py
utils/helpers.py
requirements.txt
input.schema.json
output.schema.json
```

Bundle limits: 5 MB compressed, 25 MB unpacked, 500 files, 10 MB per file. The CLI excludes `node_modules/`, `.git/`, `__pycache__/`, `.venv/`, `.env*` by default.

Legacy_python apps with `dependencies.python` set use hashed requirements (`--require-hashes`). Stock_e2b apps use plain `requirements.txt` (no hash requirement).

---

## CLI flow

Install once:

```bash
npm install -g @floomhq/cli@latest
# or use without installing:
npx @floomhq/cli@latest <command>
```

Typical flow:

```bash
# 1. Authenticate (opens browser, stores token locally)
floom setup

# 2. Scaffold a new app
floom init --type custom

# 3. Deploy
floom deploy ./my-app-dir
# or from inside the app dir:
floom deploy

# 4. Run from CLI
floom run my-app-slug --inputs '{"text": "hello"}'

# 5. Manage secrets
floom secrets list my-app-slug
floom secrets set my-app-slug OPENAI_API_KEY
floom secrets delete my-app-slug OPENAI_API_KEY

# 6. List your apps
floom apps list
```

The CLI uses a device-flow auth: `floom setup` opens `https://floom.dev/cli/authorize` in the browser, you approve, and a token is stored locally. Agent tokens (from `/settings/agent-tokens`) also work via `FLOOM_TOKEN` env var.

---

## Run paths

### Browser
```
https://floom.dev/p/<slug>
```
Renders the full UI: input form driven by `input_schema`, runs in the sandbox, shows output. Anonymous for public apps, requires sign-in for private apps.

### REST API

Submit a run:
```bash
curl -X POST "https://floom.dev/api/apps/<slug>/run" \
  -H "content-type: application/json" \
  --data '{"inputs":{"transcript":"Alice: send the report by Friday"}}'
```

Response (async runtime enabled):
```json
{
  "execution_id": "uuid",
  "status": "queued",
  "view_token": "abc123..."
}
```

Poll for result:
```bash
curl "https://floom.dev/api/runs/<execution_id>" \
  -H "Authorization: ViewToken <view_token>"
```

Response (terminal):
```json
{
  "execution_id": "uuid",
  "status": "succeeded",
  "output": { "action_items": [...] },
  "error": null,
  "started_at": "...",
  "completed_at": "..."
}
```

For private apps, include an owner agent token:
```bash
curl -X POST "https://floom.dev/api/apps/<slug>/run" \
  -H "Authorization: Bearer $FLOOM_TOKEN" \
  -H "content-type: application/json" \
  --data '{"inputs":{"pitch":"We help teams..."}}'
```

Wait for completion in one request (adds `?wait=true`):
```bash
curl -X POST "https://floom.dev/api/apps/<slug>/run?wait=true" \
  -H "content-type: application/json" \
  --data '{"inputs":{"text":"..."}}'
```
Returns 200 with full result if it completes within ~4 minutes, otherwise 202 with partial snapshot.

### MCP

Endpoint: `https://floom.dev/mcp`

Available tools:
- `auth_status` — check token identity
- `list_apps` — list your apps
- `get_app` / `get_app_contract` — fetch app metadata and schema
- `find_candidate_apps` — search for apps matching a query
- `run_app` — run an app by slug with inputs
- `get_execution` — poll execution status
- `publish_app` — deploy a new app via MCP (accepts files dict)
- `set_secret` — configure a secret value
- `start_device_flow` / `poll_device_flow` — auth from MCP clients
- `list_my_connections` — list Composio connections

For authenticated MCP calls, pass `Authorization: Bearer <agent_token>` in the MCP session headers.

---

## Secrets

Two scopes:

### `shared` — creator pays, everyone runs

The app owner stores the secret value once. It is injected for every runner automatically. Good for API keys the creator controls (Gemini, Anthropic, etc.).

```yaml
secrets:
  - name: GEMINI_API_KEY
    scope: shared
```

Set the value via CLI:
```bash
floom secrets set meeting-action-items GEMINI_API_KEY
```

Shared-secret apps that have `is_demo: true` in the DB get a tighter rate limit (5 runs/IP/hour, 100 runs/hour per app) to prevent abuse of the shared key.

### `per-runner` — each user provides their own

Each runner stores their own value via the app's settings page or CLI. The app cannot run until the runner has configured the secret. Anonymous callers get a 401 with `requires_sign_in: true` — they must sign in first.

```yaml
secrets:
  - name: OPENAI_API_KEY
    scope: per-runner
```

Default for object form when `scope` is omitted: `per-runner`. Bare string form (legacy) defaults to `shared`.

```yaml
# Legacy bare string form — resolves to shared scope
secrets:
  - GEMINI_API_KEY
```

Secrets are encrypted at rest (AES-256-GCM) and redacted from execution output before storage.

---

## Composio integrations

Declare the toolkits your app needs. Floom auto-injects the runner's connection credentials at runtime — no raw tokens in the manifest.

```yaml
# Single toolkit
composio: gmail

# Multiple toolkits
composio:
  - gmail
  - slack
```

At runtime, Floom injects:
- `COMPOSIO_<TOOLKIT_UPPERCASE>_CONNECTION_ID` — the runner's Composio account ID for that toolkit
- `COMPOSIO_CONNECTION_ID` — same value (last toolkit wins for single-toolkit apps)
- `COMPOSIO_API_KEY` — the platform's Composio API key (server-side)

If the runner has no active connection for a required toolkit, the run returns 412:
```json
{
  "error": "missing_composio_connection",
  "toolkits": ["gmail"],
  "next": { "action": "connect", "url": "/connections" }
}
```

Runners connect their accounts at `https://floom.dev/connections`. Anonymous callers get `"next": { "action": "sign-in", "url": "/login" }`.

Up to 20 toolkit slugs per app. Toolkit slug format: lowercase letters, digits, hyphens (e.g. `gmail`, `google-calendar`, `slack`).

---

## Sandbox capabilities

Works:
- Outbound HTTPS (verified: `meeting-action-items` calls `googleapis.com`)
- `requirements.txt` dependencies installed at runtime
- Multi-file Python modules, helper files, data files
- Environment variables injected as secrets and Composio connections
- Reading `process.env` / `os.environ` for injected values
- Node.js apps (`node index.js`, `npm start`)
- Up to 30 minutes runtime (SANDBOX_TIMEOUT_MS = 1,800,000 ms)

Does NOT work:
- Background workers or daemons (no persistent processes between runs)
- Scheduled tasks or cron jobs (Floom is request-response only)
- WebSocket servers
- Incoming network connections (sandbox is outbound-only)
- Browser automation (no display, no Chromium)
- File persistence between runs (sandbox is ephemeral)
- Runs longer than 30 minutes

Output size limit: 1 MB. Input size limit: 256 KB. Bundle: 5 MB compressed / 25 MB unpacked.

---

## Verify a deployment

After `floom deploy`, run this checklist:

1. **CLI returned URL**: deploy prints `/p/<slug>` — confirm the URL matches your slug.
2. **Browser test**: open `https://floom.dev/p/<slug>`, fill the form, submit, confirm output matches schema.
3. **REST test**:
   ```bash
   curl -fsS -X POST "https://floom.dev/api/apps/<slug>/run" \
     -H "content-type: application/json" \
     --data '{"inputs":{...}}'
   ```
   Expect `status: "succeeded"` (sync) or `status: "queued"` + `execution_id` (async).
4. **Private app**: confirm anonymous run returns 404, not the app output.
5. **Secrets**: if the app uses `per-runner` secrets, confirm an unconfigured runner gets `requires_sign_in: true` in the error.

---

## Common errors and what they mean

| Error / Status | Cause | Fix |
|---|---|---|
| `404 App not found` | Slug doesn't exist, or app is private and caller isn't the owner | Check slug; add `Authorization: Bearer <token>` for private apps |
| `400 Invalid input` | Input doesn't match `input_schema` | Check required fields and types |
| `400 Missing configured app secret(s): X` | `shared` secret not set by creator | Run `floom secrets set <slug> X` |
| `401 requires_sign_in: true` | App requires `per-runner` secret; caller is anonymous | User must sign in and set their own secret value |
| `412 missing_composio_connection` | Runner has no active Composio connection for a required toolkit | Direct user to `/connections` |
| `429 Run rate limit exceeded` | Too many runs in the window | Back off; demo apps cap at 5/hr per IP |
| `429 app_quota_exhausted` | App or owner hit daily E2B seconds cap | Wait until UTC midnight reset; default 30 min/day per app, 2 hr/day per owner |
| `502 sandbox_unavailable` | E2B sandbox failed to start | Retry after `retry_after` seconds |
| `500` on run | Server error; check execution row for `error_detail` | Check logs; may be a Python exception |

---

## Reject these patterns (will not work in v0.4)

- **Background workers**: Floom runs one request, returns output, sandbox exits. No persistent processes.
- **Cron jobs**: No scheduled execution. Build a separate scheduler that calls the REST API.
- **WebSocket servers**: Not supported. Request-response only.
- **Browser automation**: No display in sandbox. Do not use Playwright/Puppeteer/Selenium.
- **Runs over 30 minutes**: Hard sandbox timeout. Design apps to complete in under 30 minutes; bound inputs if needed.
- **Inter-app calls via localhost**: Each sandbox is isolated. Call other apps via `https://floom.dev/api/apps/<slug>/run`.
- **Arbitrary system daemons**: The sandbox is a single-run E2B environment, not a persistent VM.

---

## Agent tokens

Agent tokens are long-lived credentials created at `https://floom.dev/settings/agent-tokens`. Format: `flm_live_<prefix>_<secret>`.

Scopes available: `read`, `run`, `publish`. Default when creating via API: all three.

Pass as: `Authorization: Bearer flm_live_...`

Token lifetime: 90 days. Tokens can be revoked in the settings page.

---

## Versioning and updates

Platform version: v0.4.0. Last sync: 2026-05-04.

This file is the canonical source. It is auto-synced to:
- `~/.codex/skills/floomit/SKILL.md` (Codex/Kimi on Federico's Mac)
- `~/.claude/skills/floomit/SKILL.md` (Claude Code on Federico's Mac)
- `https://floom.dev/skills/floomit` (public, fetchable by any agent)

To refresh after a platform update:
```bash
cd ~/floom-minimal && bash scripts/sync-floomit-skill.sh
```

If this file is older than 7 days, fetch the latest from:
```bash
curl -s https://floom.dev/skills/floomit/raw
```
