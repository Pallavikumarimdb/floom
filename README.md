# Floom v0

Local function apps with a generated UI in 60 seconds.

## What is this?

Floom v0 is a minimal vertical slice for packaging a local Python function app and running it through a generated JSON Schema UI. The local demo works without Supabase. Supabase-backed API routes require Supabase env and return 503 JSON when that env is missing.

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

Copy `.env.local` and fill in your credentials:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# E2B (optional — without it, runner operates in fake/local mode)
E2B_API_KEY=your-e2b-api-key

```



### 3. Install dependencies

```bash
npm install
```

### 4. Start the dev server

```bash
npm run dev
```

### 5. Create a Floom agent token

Open `/login`, sign up or sign in, then open `/tokens`.

Create a token and copy it. The raw token is shown once.

### 6. Register the fixture app with Supabase configured

```bash
FLOOM_TOKEN=YOUR_FLOOM_AGENT_TOKEN FLOOM_API_URL=http://localhost:3000 npx tsx cli/deploy.ts ./fixtures/python-simple
```

Without Supabase env, visit `/p/demo-app` for the local demo. In the hosted v0, use the homepage CTA to open the retained live app.

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
- `validate_manifest`
- `find_candidate_apps`
- `publish_app`
- `run_app`
- `get_app`
- `create_agent_token`

`create_agent_token` requires a Supabase user JWT from the web login flow. The other publish/run tools accept a Floom agent token when the token has the required scope.

## Fake Mode

If `E2B_API_KEY` is not set, fake mode is available only outside production. This is useful for local development and testing without E2B credits.

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
