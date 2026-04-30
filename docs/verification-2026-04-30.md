# Floom Minimal2 Verification - 2026-04-30

## Current Claim Scope

Verified scope:

- Small Python function app.
- JSON Schema input/output.
- Floom-hosted Vercel shell.
- Supabase Auth, app registry, storage, executions, agent tokens, and rate-limit RPC.
- Real E2B execution.
- Public app page at `/p/:slug`.

Not verified for the 60-second claim yet:

- TypeScript apps.
- Multi-file bundles.
- Dependency install.
- User-provided secrets.
- FastAPI/OpenAPI apps such as OpenBlog.

## Live URLs

- Production shell: `https://floom-60sec.vercel.app`
- Verified app page: `https://floom-60sec.vercel.app/p/smoke-1777537176461`
- GitHub repo: `floomhq/floom-minimal2`
- Latest deployed commit verified during this pass: `ad24ecb`

## Local Verification

Passed after the v0 hardening and migration changes:

- `AGENT_TOKEN_PEPPER=test-pepper npm run lint`
- `AGENT_TOKEN_PEPPER=test-pepper npm run typecheck`
- `AGENT_TOKEN_PEPPER=test-pepper npm test`
- `AGENT_TOKEN_PEPPER=test-pepper npm run build`
- `git diff --check`

Real E2B runner smoke:

- Path: `src/lib/e2b/runner.ts`
- Result: success
- Time: `1103ms`
- Output: `{ "result": "Floom from real e2b" }`

## Supabase Verification

Project ref:

- `bdlzxpgsmlmijopdhqdf`

Applied migrations:

- `20260429120000_remote_baseline`
- `20260430080000_floom_v0_core`
- `20260430093000_drop_public_metadata_policies`
- `20260430100000_retire_legacy_auth_trigger`

Verified live tables:

- `profiles`
- `apps`
- `app_versions`
- `executions`
- `agent_tokens`
- `public_run_rate_limits`

Verified live constraints:

- `agent_tokens_token_hash_key`
- `agent_tokens_hash_sha256`
- `public_run_rate_limits_pkey`
- `app_versions_bundle_path_key`
- existing app/version/execution primary keys and foreign keys

Verified live policies:

- Legacy direct public-read policies for `apps` and `app_versions` were removed.
- Owner policies remain.
- Storage bucket `app-bundles` is private.

Verified RPC:

- `check_public_run_rate_limit`
- Service role has execute privilege.

## Production Vercel Verification

Vercel blocker fixed:

- Previous deploy failures were caused by Vercel team author checks on local `.localdomain` commit emails.
- Latest commits now use the Vercel account email `team@openpaper.dev`.
- Project Node.js version changed from `24.x` to `22.x`.

Production deploy:

- Build passed on Vercel.
- Production alias updated: `https://floom-60sec.vercel.app`.

## End-To-End Live Flow

Verified flow:

1. Created a Supabase Auth smoke user.
2. Signed in through Supabase Auth.
3. Minted a Floom agent token through `POST /api/agent-tokens`.
4. Published a Python fixture app through `POST /api/apps`.
5. Verified app metadata through `GET /api/apps/:slug`.
6. Verified public app page returns 200.
7. Ran the app through `POST /api/apps/:slug/run`.
8. Verified the run persisted in Supabase `executions`.

Verified app:

- Slug: `smoke-1777537176461`
- Page: `https://floom-60sec.vercel.app/p/smoke-1777537176461`
- API run time: `3012ms`
- Browser run/render time: `2667ms`
- Execution id: `2380e9ae-a935-4e53-b2bc-6bc7620ddf51`
- Output: `Great pitch! You said: Floom turns local functions into secure live apps.`

Browser verification:

- Rendered app title.
- Submitted generated form.
- Rendered output.
- Console error count: `0`
- Screenshot: `docs/live-smoke-app-page.png`

## Current Score

Technical v0 slice: `82/100`.

Remaining blockers before calling the whole thing `100/100`:

- Independent agent QA still in progress.
- More than one fixture app needs live verification.
- Token-to-publish flow needs a public skill/CLI wrapper so the user path is one command.
- UI is functional but not yet as polished as `floom.dev`.
- OpenBlog/FastAPI is not in the verified scope.
