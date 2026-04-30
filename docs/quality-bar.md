# Floom Minimal Quality Bar

Updated: 2026-04-29

## North Star

`localhost to live and secure in 60 seconds`

For the product, this means Floom already hosts the shell on Vercel. A builder authenticates, gets an agent token, publishes an app through the Floom skill/MCP/CLI, and receives a live `/p/:slug` page backed by Supabase and E2B.

It does not mean every app gets a new Vercel project.

## Required Output

- Super clean codebase with clear module ownership.
- Supabase is live, reproducible, and documented.
- Supabase Auth is configured for email auth first.
- Google OAuth sign-in is available in the login UI once the Supabase Google provider is configured.
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

- One live Supabase project for Floom Minimal.
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
- Agent token scopes are explicit: `read`, `run`, `publish`.
- Agent tokens expire by default.
- Token prefix is stored for display; raw token is shown once.
- Token hashing uses a server-only pepper outside the database.
- Raw access tokens are never committed, printed, or stored in app source.
- Public users can run public apps without a builder token.
- Private apps require owner auth or an authorized agent token.

## Abuse And Safety Bar

Required:

- Service-role API routes have black-box authorization tests; do not rely only on Supabase RLS tests.
- Publish is atomic across storage upload, `apps`, and `app_versions`, or leaves a clean rollback state.
- Uploaded JSON Schemas pass metaschema validation and complexity limits before storage.
- Per-app and per-IP run limits exist before public sharing.
- Source bundle size, file count, input size, output size, stdout size, timeout, and concurrency limits are enforced.
- Public run endpoint blocks private apps and disabled apps.
- Production execution fails closed if E2B, Supabase service-role, anon key, or agent-token pepper env is missing.
- User code never receives Floom service-role credentials.
- User code sees only explicit secret names that the builder configured.
- Error messages sent to browsers never include provider tokens, Supabase service-role keys, raw stack traces with env values, or E2B URLs.
- Sandboxes are killed or allowed to expire after each run.
- Run cleanup covers stale queued/running executions.
- App deletion or disable stops new public runs.
- Every publish and run writes an audit record with caller type, app id, version id, execution id, and sanitized error code.

## MCP Bar

Required tools:

- `auth_status`
- `create_agent_token`
- `get_app_contract`
- `list_app_templates`
- `get_app_template`
- `find_candidate_apps`
- `validate_manifest`
- `publish_app`
- `run_app`
- `get_app`

The MCP must be tested by another agent from token creation through publish and live run.

MCP safety requirements:

- Authorization forwarding uses a pinned/allowlisted Floom origin, not an arbitrary request-derived host.
- Tool failures always become JSON-RPC errors or tool `isError` results.
- Network/provider failures do not crash the MCP route or leak tokens.

## Skill And CLI Bar

Required:

- The Floom skill explains how to find deployable candidate apps in a repo.
- The skill validates app shape before publishing.
- The skill refuses broad claims for unsupported app types.
- The CLI and MCP share the same manifest validation code.
- The happy path is one command after first auth:
  - validate
  - package
  - publish
  - run smoke input
  - return `/p/:slug`
- First-run guidance detects missing auth, missing Supabase token, missing Floom agent token, and missing manifest.

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
- Empty, loading, running, success, validation-error, runtime-error, and private-app states are visible and tested.
- The app page shows enough provenance for trust: app name, owner/publisher where safe, latest version time, and run status.

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
- comparison against archived `floom-minimal-archive`

## Claim Measurement Bar

Required:

- The 60-second timer starts from a repo with:
  - Floom auth already completed.
  - Agent token available to the local agent.
  - Valid `floom.yaml`.
  - Small Python function app with no dependency install.
- The timer ends when:
  - `/p/:slug` is live.
  - A smoke run has executed in E2B.
  - The run row is present in Supabase.
- Record timings for:
  - validate
  - package
  - publish
  - E2B run
  - live page load
- Keep separate timings for first-run setup, warm publish, and broader app modes.

## Operations Bar

Required:

- Minimal runbook documents how to rotate Floom service keys, E2B key, token pepper, and Supabase anon/service-role keys.
- Minimal rollback path exists for a bad app version.
- Database migrations are reproducible from a clean Supabase project and additive against the current live project.
- Production env vars are listed by name only.
- Monitoring is minimal but real: health endpoint, failed-run count, and failed-publish count.
- Retention policy exists for source bundles, execution rows, logs, and future output files.
