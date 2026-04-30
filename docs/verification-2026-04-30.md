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
- Verified app page: `https://floom-60sec.vercel.app/p/smoke-1777538613152`
- GitHub repo: `floomhq/floom-minimal2`
- Latest deployed commit verified during this pass: `8e8caba`

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
- Time: `1164ms`
- Output: `{ "result": "real e2b ok", "name": "Floom" }`
- Production fake mode is disabled even when fake-mode env flags are set.
- Suspicious output keys such as token/password/api_key/private_key/credential/authorization are redacted recursively.

## Supabase Verification

Project ref:

- `bdlzxpgsmlmijopdhqdf`

Applied migrations:

- `20260429120000_remote_baseline`
- `20260430080000_floom_v0_core`
- `20260430093000_drop_public_metadata_policies`
- `20260430100000_retire_legacy_auth_trigger`
- `20260430103000_harden_app_bundle_storage`

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
- `storage.objects` has RLS enabled.
- `app-bundles` has owner-scoped select, insert, update, and delete policies.
- `agent_tokens.scopes` defaults to `read`, `run`, `publish`, and `revoke`.

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

- Slug: `smoke-1777538613152`
- Page: `https://floom-60sec.vercel.app/p/smoke-1777538613152`
- Publish time: `1916ms`
- API run time: `3318ms`
- Browser run/render time: `2888ms`
- Execution id: `6b5f9991-1a8b-4f89-9626-2bb47d090659`
- Output: `Great pitch! You said: Floom turns local functions into secure live apps.`
- Redacted secret-like output value: `[REDACTED]`

## Launch Auth And Token Flow

Verified on production after adding `/login` and `/tokens`:

1. Created a fresh confirmed Supabase Auth user.
2. Signed in through the browser at `/login`.
3. Landed on `/tokens`.
4. Created an agent token through the UI.
5. Verified the raw token was shown once.
6. Verified the token copy button showed copied state.
7. Published a fixture app with:
   `FLOOM_TOKEN=... FLOOM_API_URL=https://floom-60sec.vercel.app npx tsx cli/deploy.ts <fixture-dir>`
8. Opened the returned `/p/:slug` page.
9. Ran the app in the browser.
10. Verified `[REDACTED]` output for secret-like fields.
11. Verified Supabase execution row status `success`.
12. Revoked the token through the UI.

Launch flow result:

- Slug: `browser-1777568579620`
- Page: `https://floom-60sec.vercel.app/p/browser-1777568579620`
- Browser run/render time: `3485ms`
- Console error count: `0`
- Screenshot: `docs/launch-token-flow-2026-04-30.png`

Known launch risk:

- Open self-signup hit Supabase email rate limiting during repeated smoke tests. The sign-in/token/publish flow is verified with a fresh confirmed user. For launch-night demos, use confirmed/invited builder accounts or wait for the project email rate limit to reset before relying on open signup.

Browser verification:

- Rendered app title.
- Submitted generated form.
- Rendered output.
- Console error count: `0`
- Screenshot: `docs/live-smoke-app-page-2026-04-30.png`

## Current Score

Technical v0 slice: `94/100`.

Remaining blockers before calling the whole thing `100/100`:

- More than one fixture app needs live verification.
- Token-to-publish flow needs a public skill/CLI wrapper so the user path is one command.
- OpenBlog/FastAPI is not in the verified scope.
