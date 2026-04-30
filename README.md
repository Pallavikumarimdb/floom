# Floom v0

From localhost to live and secure in 60 seconds.

## What is this?

Floom v0 is a minimal vertical slice that lets a developer deploy a local Python or TypeScript function app with one command. It packages the app, validates schemas, stores the record in Supabase, and returns a secure shareable URL at `floom.dev/p/:slug`.

## Stack

- Next.js on Vercel for the Floom shell
- Supabase Auth + Postgres + RLS
- E2B SDK for sandboxed execution
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
    runner.ts              # E2B sandbox runner (with fake mode)
    supabase/
      client.ts            # Browser Supabase client
      server.ts            # Server Supabase client
      admin.ts             # Service-role Supabase client
    types.ts               # TypeScript types
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



### 3. Install dependencies

```bash
npm install
```

### 4. Start the dev server

```bash
npm run dev
```

### 5. Deploy the fixture app

```bash
npx tsx cli/deploy.ts ./fixture-app http://localhost:3000 YOUR_SUPABASE_AUTH_TOKEN
```

Or manually seed the database and visit `/p/pitch-coach`.

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
4. Floom API creates app/version records in Supabase.
5. Floom starts E2B from one shared runner template.
6. Floom uploads bundle to E2B.
7. E2B installs declared dependencies.
8. E2B runs a tiny wrapper server.
9. Floom stores sandbox metadata and returns `https://floom.dev/p/:slug`.
10. Coworkers use the generated UI. Floom validates inputs, invokes E2B, stores output, and renders results.

## Fake Mode

If `E2B_API_KEY` is not set, the runner operates in fake mode and returns mock output. This is useful for local development and testing without E2B credits.

## Quality Gates

- [x] App deploy/register API exists
- [x] `/p/:slug` loads with generated form
- [x] Input validation via JSON Schema
- [x] E2B execution (real or fake mode)
- [x] Output validation via JSON Schema
- [x] Supabase RLS policies defined
- [x] Share URL logic implemented
- [x] Raw E2B host/token hidden from users
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
