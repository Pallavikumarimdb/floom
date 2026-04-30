# Floom v0

Local function apps with a generated UI in 60 seconds.

## What is this?

Floom v0 is a minimal vertical slice for packaging a local Python or TypeScript function app and running it through a generated JSON Schema UI. The local demo works without Supabase. Supabase-backed API routes require Supabase env and return 503 JSON when that env is missing.

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
    runner.ts              # Runner with E2B integration and fake mode
    supabase/
      client.ts            # Browser Supabase client
      server.ts            # Server Supabase client
      admin.ts             # Service-role Supabase client
    types.ts               # TypeScript types
supabase/migrations/        # Database schema + RLS policies
fixture-app/                # Example Python app for testing
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

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. Run Supabase migrations

Apply the migration in `supabase/migrations/20260429120000_init.sql` to your Supabase project.

### 3. Install dependencies

```bash
npm install
```

### 4. Start the dev server

```bash
npm run dev
```

### 5. Register the fixture app with Supabase configured

```bash
npx tsx cli/deploy.ts ./fixture-app http://localhost:3000 YOUR_SUPABASE_AUTH_TOKEN
```

Without Supabase env, visit `/p/demo-app` for the local demo.

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
secrets: []
dependencies:
  python: []
```

Python v0:

```python
def run(inputs: dict) -> dict:
    return {"result": "hello"}
```

TypeScript v0:

```ts
export async function run(inputs: Record<string, unknown>) {
  return { result: "hello" };
}
```

## Runtime Flow

1. CLI packages local app directory.
2. CLI validates `floom.yaml`, input JSON Schema, output JSON Schema.
3. CLI sends bundle to Floom API (`POST /api/apps`).
4. With Supabase env configured, Floom API creates app/version records in Supabase.
5. Floom runs through fake mode unless `E2B_API_KEY` is configured.
6. In fake mode, the runner returns mock output for local testing.
7. With `E2B_API_KEY`, the runner uploads the entrypoint to E2B, installs declared dependencies, and invokes the handler.
8. Floom validates inputs and outputs, stores execution records when Supabase is configured, and renders results.

## Fake Mode

If `E2B_API_KEY` is not set, the runner operates in fake mode and returns mock output. This is useful for local development and testing without E2B credits.

## Quality Gates

- [x] App deploy/register API exists
- [x] `/p/:slug` loads with generated form
- [x] Input validation via JSON Schema
- [x] Fake runner execution
- [x] Output validation via JSON Schema
- [x] Supabase RLS policies defined
- [x] Share-token authorization lookup implemented
- [x] Share token lookup compares SHA-256 hashes
- [x] Build passes
- [ ] Live E2B verification (requires E2B_API_KEY)

## v0 Exclusions

- Studio
- Marketplace
- Billing
- Teams/org switcher
- PostHog/Sentry setup
- Custom renderers
- File uploads
- Cron
- MCP
- Per-app Vercel deploys
- Arbitrary Docker repos
- Full web app hosting
