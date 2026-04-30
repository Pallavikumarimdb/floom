# Floom v0 / v0.1 hardening

from localhost to live and secure in 60sec.

## What is this?

Floom v0 is a minimal vertical slice for packaging a local, single-file, stdlib-only Python function app and running it through a generated JSON Schema UI. The verified v0 launch claim is: from localhost to live and secure in 60sec. This claim starts after account and agent-token setup, and covers CLI publish plus browser/API run for the verified v0 contract.

Secure in the v0 claim means the verified controls are in place: E2B sandboxed execution, scoped agent tokens created through `/tokens`, schema-marked input/output redaction before persistence, caller-derived plus per-app run rate limits, and public/private access control. The local demo works without Supabase. Supabase-backed API routes require Supabase env and return 503 JSON when that env is missing.

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
FLOOM_TOKEN=YOUR_FLOOM_AGENT_TOKEN FLOOM_API_URL=https://floom-60sec.vercel.app npx tsx cli/deploy.ts ./fixtures/python-simple
```

For local development, set `FLOOM_API_URL=http://localhost:3000` after `npm run dev`.
Without Supabase env, visit `/p/demo-app` for the local demo. In the hosted v0, use the homepage CTA to open the retained live app.

## Launch Claim Contract

The mainline v0 path is intentionally narrow:

- Account setup and agent-token creation happen before the 60sec timer.
- Apps use one `app.py` file with Python stdlib only.
- Inputs and outputs are declared with JSON Schema.
- Publish uses `FLOOM_TOKEN` and the CLI.
- Public apps can be read and run anonymously.
- Private apps require a valid owner token for metadata and runs.

Not part of the v0 launch claim: TypeScript apps, Java apps, dependency installation, user-provided secrets, OpenAPI/FastAPI apps, multi-file bundles, background workers, and arbitrary web servers.

The v0.1 branch claim is separate: it adds exact-pinned Python dependencies and manifest-declared secret names with operator-provisioned server env injection. v0.1 is not covered by the v0 60-second launch claim until it receives its own end-to-end launch verification.

## App Contract

`floom.yaml`:

```yaml
name: Pitch Coach
slug: pitch-coach
runtime: python
entrypoint: app.py
handler: run
input_schema: ./input.schema.json
output_schema: ./output.schema.json
```

Python v0:

```python
def run(inputs: dict) -> dict:
    return {"result": "hello"}
```

## Runtime Flow

1. CLI packages local app directory.
2. CLI validates `floom.yaml`, input JSON Schema, output JSON Schema.
3. CLI sends the Python entrypoint to Floom API (`POST /api/apps`).
4. With Supabase env configured, Floom API creates app/version records in Supabase.
5. Floom runs through E2B when `E2B_API_KEY` is configured.
6. In fake mode, the runner returns mock output for local development and tests only.
7. With `E2B_API_KEY`, the runner uploads the entrypoint to E2B and invokes the handler.
8. Floom validates inputs and outputs, stores execution records when Supabase is configured, and renders results.

## MCP

The v0 MCP endpoint is `/mcp`.

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

`get_app_contract` returns the current manifest, `app.py`, input/output schema examples, optional v0.1 dependency/secret fields, and explicit unsupported cases. Agents use it before generating app files so they do not create FastAPI/OpenAPI, TypeScript, multi-file, server, or multi-action apps for this function runtime.

`list_app_templates` and `get_app_template` return useful copy-paste v0 app bundles. Current templates:

- `invoice_calculator`
- `utm_url_builder`
- `csv_stats`
- `meeting_action_items`

Each template includes `floom.yaml`, `app.py`, `input.schema.json`, and `output.schema.json`. They use one stdlib-only Python file and no secrets.

## v0.1 Scope

v0.1 adds two capabilities without turning Floom into broad web hosting:

- Python dependency installation from an exact-pinned `requirements.txt` declared as `dependencies.python`.
- Secret names in `floom.yaml`, with owner-scoped server env values injected only into the E2B runtime.

v0.1 does not claim arbitrary HTTP servers, FastAPI/OpenAPI apps, TypeScript apps, background workers, or full repo hosting. Those stay post-v0.1 until the runtime, auth, limits, and UI contracts are verified end to end.

Secret value storage is operator-provisioned environment injection only. User-managed secret storage and encrypted per-user secret persistence remain a launch blocker for a self-serve v0.1 secrets flow.

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

## v0 Exclusions

- Studio
- Marketplace
- Billing
- Teams/org switcher
- PostHog/Sentry setup
- Custom renderers
- File uploads
- Cron
- Per-app Vercel deploys
- Arbitrary Docker repos
- Full web app hosting
