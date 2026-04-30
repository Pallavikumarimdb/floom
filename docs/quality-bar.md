# Floom Minimal2 Quality Bar

Updated: 2026-04-29

## North Star

`localhost to live and secure in 60 seconds`

For the product, this means Floom already hosts the shell on Vercel. A builder authenticates, gets an agent token, publishes an app through the Floom skill/MCP/CLI, and receives a live `/p/:slug` page backed by Supabase and E2B.

It does not mean every app gets a new Vercel project.

## Required Output

- Super clean codebase with clear module ownership.
- Supabase is live, reproducible, and documented.
- Supabase Auth is configured for email auth first.
- Google Auth is later.
- Agent token flow exists for app publishing.
- MCP exists for agent-driven create/test/publish.
- Floom skill instructs agents how to find and package deployable apps.
- E2B runs apps for real, not only fake mode.
- UI quality matches `floom.dev` design quality and reuses/imports components where practical.
- OpenBlog-style apps become the quality gate for the next layer.

## Codebase Boundaries

Keep the repo simple and modular:

- `src/app`: Next.js routes and pages only.
- `src/components`: reusable UI components.
- `src/lib/supabase`: Supabase clients, schema-facing helpers, auth helpers.
- `src/lib/e2b`: sandbox runner and runtime adapters.
- `src/lib/floom`: manifest, limits, packaging, validation.
- `src/lib/mcp`: MCP tool handlers.
- `supabase/migrations`: the single source of truth for DB schema, storage buckets, RLS, RPCs, and policies.
- `fixtures`: example apps used by quality gates.
- `docs`: quality bar, architecture, runbooks, and verification evidence.

No duplicate Supabase model/schema definitions spread across root and `src`.

## Supabase Bar

Required:

- One live Supabase project for Floom Minimal2.
- Migration files in repo recreate:
  - `profiles`
  - `apps`
  - `app_versions`
  - `executions`
  - `agent_tokens`
  - storage bucket `app-bundles`
- RLS enabled on every public table.
- App source stored in Supabase Storage under owner-scoped paths.
- Execution rows track caller identity when available.
- Public app read/run path works.
- Private app metadata and runs are blocked for non-owner callers.
- Owner can publish a new version to an existing slug.
- Policies are tested against at least two users.
- Schema and policy summary is documented for other agents.

## Auth And Token Bar

Required:

- Email auth works.
- A builder can sign up or log in.
- A builder can create/revoke an agent token.
- Agent token permits app publish/update through MCP/CLI.
- Agent token is stored hashed in Supabase.
- Raw access tokens are never committed, printed, or stored in app source.
- Public users can run public apps without a builder token.

## MCP Bar

Required tools:

- `floom.auth_status`
- `floom.create_agent_token`
- `floom.find_candidate_apps`
- `floom.validate_manifest`
- `floom.publish_app`
- `floom.run_app`
- `floom.get_app`

The MCP must be tested by another agent from token creation through publish and live run.

## E2B Bar

Required:

- Real E2B execution passes.
- No raw E2B host/token is exposed to the browser.
- Runtime has explicit sandbox, command, request, source, input, and output limits.
- App stdout cannot corrupt the JSON output protocol.
- Errors returned to users are sanitized.
- Sandbox lifecycle cleans up after runs.
- Python fixture passes.
- TypeScript fixture passes before claiming TypeScript support.
- OpenBlog/FastAPI-style app passes before claiming broader app support.

## UI Bar

Required:

- Homepage has the Floom-quality visual language from `floom.dev`.
- Landing CTA offers:
  - install Floom skill / MCP
  - run/test a live app
- App page resembles `floom.dev/p/competitor-lens` in design quality.
- No inert controls.
- Inputs are visibly interactive.
- Output rendering is clear.
- Browser screenshots verify home and app pages.
- Live public app page works in browser with no console errors.

## App Coverage Bar

Tiny v0 proof:

- Python single-function app.
- JSON Schema input/output.
- Live `/p/:slug` page.
- Real E2B run.
- Supabase execution row.

Before broader claim:

- TypeScript app.
- Python multi-file app.
- App with dependencies.
- App with secrets by name.
- OpenBlog from `federicodeponte/openblog`.

OpenBlog gate:

- Inspect `openapi.json`.
- Package all endpoints/actions.
- Start or adapt FastAPI app in E2B.
- Verify all OpenAPI endpoints through Floom.
- Persist job/run state in Supabase instead of in-memory only.

## Release Gate

Do not call this 100/100 until all are verified:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- secret scan
- Supabase migration/policy verification on the real Floom project
- email auth and agent token flow
- MCP publish flow
- E2B live run matrix
- browser screenshots for local and live
- live Vercel deploy serves current commit
- at least two independent agents run the token-to-publish flow
- comparison against `floom-minimal`

