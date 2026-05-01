# Floom v0.1

from localhost to live and secure in 60sec.

## What is this?

Floom v0.1 is the launch slice for packaging a local single-file Python function app, optionally installing exact-pinned hash-locked Python dependencies, storing owner-managed encrypted app secrets, and running it through a generated JSON Schema UI. The launch claim is: from localhost to live and secure in 60sec. This claim starts after account and agent-token setup, and covers CLI publish plus browser/API/MCP run for the verified v0.1 contract.

Secure in the v0.1 claim means the verified controls are in place: E2B sandboxed execution, scoped agent tokens created through `/tokens`, schema-marked input/output redaction before persistence, encrypted secret storage at rest, runtime-only secret injection, caller-derived plus per-app run rate limits, and public/private access control. The local demo works without Supabase. Supabase-backed API routes require Supabase env and return 503 JSON when that env is missing.

## Stack

- Next.js app shell
- Supabase schema/Auth integration when configured
- E2B SDK integration with fake mode for local testing
- JSON Schema as the app contract
- `@rjsf/core` + `@rjsf/validator-ajv8` for generated forms
- AJV for server validation

## Project Structure

```
src/
  app/
    api/
      apps/
        route.ts           # POST /api/apps — register new app
        [slug]/
          route.ts         # GET /api/apps/:slug — fetch app metadata
          run/
            route.ts       # POST /api/apps/:slug/run — execute app
    auth/callback/
      route.ts             # OAuth callback handler
    p/[slug]/
      page.tsx             # Generated UI for running apps
    page.tsx               # Homepage
  lib/
    e2b/
      runner.ts            # Runner with E2B integration and fake mode
    floom/
      limits.ts            # Request/source/schema/runtime limits
      manifest.ts          # Floom manifest validation
    supabase/
      client.ts            # Browser Supabase client
      server.ts            # Server Supabase client
      admin.ts             # Service-role Supabase client
fixtures/
  python-simple/            # Example Python app for testing
cli/
  deploy.ts                # CLI deploy script
```

## Getting Started

### 1. Configure environment variables

Create `.env.local` and fill in your credentials:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AGENT_TOKEN_PEPPER=your-random-server-only-pepper
FLOOM_SECRET_ENCRYPTION_KEY=base64-encoded-32-byte-key
FLOOM_ORIGIN=https://floom.dev
NEXT_PUBLIC_FLOOM_ORIGIN=https://floom.dev
NEXT_PUBLIC_APP_URL=https://floom.dev

# E2B (required for production runs; local tests can use explicit fake mode)
E2B_API_KEY=your-e2b-api-key

```



### 2. Install dependencies

```bash
npm install
```

### 3. Start the dev server

```bash
npm run dev
```

### 4. Create a Floom agent token

Open `/login`, sign up or sign in, then open `/tokens`.

Create a token and copy it. The raw token is shown once.

### 5. Publish the fixture app

```bash
npx @floomhq/cli@latest setup
cd fixtures/python-simple
npx @floomhq/cli@latest deploy --dry-run
npx @floomhq/cli@latest deploy
```

For local development, set `FLOOM_API_URL=http://localhost:3000` after `npm run dev`. For one-off scripts, set `FLOOM_TOKEN=YOUR_FLOOM_AGENT_TOKEN`.
Without Supabase env, visit `/p/demo-app` for the local demo. In the hosted v0.1 launch app, use the homepage CTA to open the retained live app.

`setup` must store `api_url` as `https://floom.dev` for launch testing. If an older local config points somewhere else, run setup again or set `FLOOM_API_URL=https://floom.dev` for the publish command.

### 6. Manage app secrets

Generate one server-only encryption key and configure it as `FLOOM_SECRET_ENCRYPTION_KEY`:

```bash
openssl rand -base64 32
```

The key is a base64-encoded 32-byte value. `base64:<value>` is also accepted. Keep it only in server env.

Apps declare required secret names in `floom.yaml`:

```yaml
secrets:
  - OPENAI_API_KEY
```

Set, list, and delete values with the owner token:

```bash
printf '%s' "$VALUE" | FLOOM_TOKEN=<agent-token> FLOOM_API_URL=https://floom.dev npx @floomhq/cli@latest secrets set <app-slug> OPENAI_API_KEY --value-stdin
FLOOM_TOKEN=<agent-token> FLOOM_API_URL=https://floom.dev npx @floomhq/cli@latest secrets list <app-slug>
FLOOM_TOKEN=<agent-token> FLOOM_API_URL=https://floom.dev npx @floomhq/cli@latest secrets delete <app-slug> OPENAI_API_KEY
```

The REST surface is `GET`, `PUT`, and `DELETE /api/apps/:slug/secrets`. `PUT` accepts `{ "name": "...", "value": "..." }`; responses return only `name`, `created_at`, and `updated_at` metadata.

For dependencies, every `requirements.txt` line must be an exact pin with a sha256 hash:

```text
humanize==4.9.0 --hash=sha256:ce284a76d5b1377fd8836733b983bfb0b76f1aa1c090de2566fcf008d7f6ab16
```

Declare that file from `floom.yaml`:

```yaml
dependencies:
  python: ./requirements.txt
```

## Launch Claim Contract

The mainline v0.1 path is intentionally narrow:

- Account setup and agent-token creation happen before the 60sec timer.
- Apps use one `app.py` file with Python stdlib, plus exact-pinned and hash-locked dependencies when declared with `dependencies.python`.
- Inputs and outputs are declared with JSON Schema.
- Publish uses `FLOOM_TOKEN` and the CLI.
- Public apps can be read and run anonymously.
- Private apps require a valid owner token for metadata and runs.

Not part of the v0.1 launch claim: TypeScript apps, Java apps, OpenAPI/FastAPI apps, multi-file bundles, background workers, and arbitrary web servers.

## App Contract

`floom.yaml`:

```yaml
name: Meeting Action Items
slug: meeting-action-items
runtime: python
entrypoint: app.py
handler: run
input_schema: ./input.schema.json
output_schema: ./output.schema.json
```

Python v0.1:

```python
def run(inputs: dict) -> dict:
    return {"result": "hello"}
```

## Runtime Flow

1. CLI packages local app directory.
2. CLI validates `floom.yaml`, input JSON Schema, output JSON Schema, and the Python handler.
3. CLI sends the Python entrypoint to Floom API (`POST /api/apps`).
4. With Supabase env configured, Floom API creates app/version records in Supabase.
5. App owners store declared secret values through `/api/apps/:slug/secrets`; values are encrypted in `app_secrets`.
6. Floom runs through E2B when `E2B_API_KEY` is configured.
7. In fake mode, the runner returns mock output for local development and tests only.
8. With `E2B_API_KEY`, the runner uploads the entrypoint to E2B, decrypts declared secrets server-side, injects them as E2B environment variables, and invokes the handler.
9. Floom validates inputs and outputs, stores execution records when Supabase is configured, and renders results.

## MCP

The v0.1 MCP endpoint is `/mcp`.

Use an Authorization bearer token:

```text
Authorization: Bearer YOUR_FLOOM_AGENT_TOKEN
```

Launch tools:

- `auth_status`
- `get_app_contract`
- `list_app_templates`
- `get_app_template`
- `validate_manifest`
- `find_candidate_apps`
- `publish_app`
- `run_app`
- `get_app`

MCP cannot create or return raw agent tokens. Create agent tokens from the signed-in `/tokens` page, where the raw token is shown once. The publish/run tools accept a Floom agent token when the token has the required scope.

MCP does not return raw app secret values. App secret values are managed through the REST route or `npx @floomhq/cli@latest secrets`; list responses contain metadata only.

`get_app_contract` returns the current v0.1 manifest, `app.py`, input/output schema examples, dependency/secret fields, and explicit unsupported cases. Agents use it before generating app files so they do not create FastAPI/OpenAPI, TypeScript, multi-file, server, or multi-action apps for this function runtime.

`list_app_templates` and `get_app_template` return useful copy-paste v0.1-safe app bundles. Current templates:

- `invoice_calculator`
- `utm_url_builder`
- `csv_stats`
- `meeting_action_items`

Each template includes `floom.yaml`, `app.py`, `input.schema.json`, and `output.schema.json`. They use one stdlib-only Python file and no secrets.

The deployable filesystem template in this repository is `templates/meeting-action-items`. Post-v0 references that need file upload, Gemini, or broader app hosting live under `docs/post-v0-templates`.

## v0.1 Scope

v0.1 includes these capabilities without turning Floom into broad web hosting:

- Python dependency installation from an exact-pinned, hash-locked `requirements.txt` declared as `dependencies.python`.
- Secret names in `floom.yaml`, with owner-scoped encrypted values injected only into the E2B runtime.

v0.1 does not claim arbitrary HTTP servers, FastAPI/OpenAPI apps, TypeScript apps, background workers, or full repo hosting. Those stay post-v0.1 until the runtime, auth, limits, and UI contracts are verified end to end.

Secret values are encrypted at rest in `app_secrets` with `FLOOM_SECRET_ENCRYPTION_KEY`. API, CLI, MCP, execution rows, app versions, docs, and bundle storage expose only secret names or metadata.

## Fake Mode

If `E2B_API_KEY` is not set, fake mode is available only outside production when explicitly enabled. Production fails closed without E2B credentials.

## Quality Gates

- [x] App deploy/register API exists
- [x] `/p/:slug` loads with generated form
- [x] Input validation via JSON Schema
- [x] Fake runner execution
- [x] Output validation via JSON Schema
- [x] Build passes
- [x] Live E2B verification

## v0.1 Exclusions

- Studio
- Marketplace
- Billing
- Teams/org switcher
- Sentry setup
- Custom renderers
- File uploads
- Cron
- Per-app Vercel deploys
- Arbitrary Docker repos
- Full web app hosting
