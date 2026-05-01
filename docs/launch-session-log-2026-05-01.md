# Launch Session Log - 2026-05-01

## Launch Target

Launch target is v0.1, not v0-only.

The launch claim is:

> localhost to live and secure in 60 seconds

For launch readiness, v0.1 must support:

- single-file Python apps
- exact-pinned, hash-locked `requirements.txt`
- encrypted app secrets at rest
- runtime-only secret injection into E2B
- browser, API, CLI, and MCP publish/run paths
- public/private access control
- signup/signin, token creation, token revoke, and revoked-token rejection

## Current Infrastructure State

- `https://floom.dev` is served by AX41 nginx and proxies to the verified Vercel deployment.
- Direct Vercel domain attach for `floom.dev` is blocked because the domain is assigned to another Vercel project outside the current `fedes-projects-5891bd50` scope.
- Supabase Auth Site URL is set to `https://floom.dev`.
- Supabase Auth redirect allowlist includes:
  - `https://floom-60sec.vercel.app/auth/callback`
  - `https://floom-60sec.vercel.app/auth/callback?next=/tokens`
  - `https://floom-60sec-mu.vercel.app/auth/callback`
  - `https://floom-60sec-mu.vercel.app/auth/callback?next=/tokens`
  - `https://floom.dev/auth/callback`
  - `https://floom.dev/auth/callback?next=/tokens`
- AX41 nginx proxy header buffers were increased after Google OAuth callback produced 502 from oversized Supabase auth cookie headers.
- Auth callback code now uses configured public origin, so callback failures redirect to `https://floom.dev/login`, not the Vercel alias.

## Active Work

- Branch: `launch/v0.1-deps-secrets`
- Source: current `main` plus PR #3 `v0.1-hardening-main`
- Latest audited branch commit: `f614a33`
- PR #3 conflict status: conflicts resolved locally in:
  - `scripts/test-fake-run.mjs`
  - `src/lib/floom/manifest.ts`
  - `src/lib/mcp/tools.ts`
- Local checks already passed on the integration branch:
  - `npm run typecheck`
  - `npm run lint` with existing warnings only
  - `npm test`
  - `npm run build`
- Vercel production env now includes `FLOOM_SECRET_ENCRYPTION_KEY`.

## Open Launch Blockers

1. Merge `launch/v0.1-deps-secrets` to `main` by itself after final canonical URL verification.
2. Close superseded PR #3 after `main` contains v0.1.
3. Update PR #11 after v0.1 lands on `main`; it currently conflicts with the v0.1 branch and must not be batched.
4. Supabase SMTP remains open for public self-serve signup volume beyond the default provider limits.
5. Sentry / Vercel Analytics remains open.
6. Fresh Google OAuth callback still needs a post-merge smoke because provider/OAuth/proxy settings can drift outside the repo.

## Verified On Production

- `https://floom.dev` serves the Vercel deployment through AX41 nginx.
- `https://floom.dev/mcp` returns the Floom MCP descriptor.
- `meeting-action-items` exists as the canonical public demo app.
- Live v0.1 gate passed on `https://floom.dev`:
  - CLI publish of a dependency app.
  - MCP publish of a dependency app.
  - REST and MCP run of dependency app.
  - Public secret-backed app rejection.
  - MCP publish of private secret app.
  - Private metadata/page access controls.
  - Missing-secret failure before run.
  - Encrypted secret set/list/delete through CLI.
  - Scoped-token and non-owner negative checks.
  - REST and MCP run of private secret app with redacted output.
  - Supabase evidence check proving secrets are not persisted in execution output.
- Published `@floomhq/cli@latest` is `0.2.16`.
- Published npm CLI passed isolated `auth login`, `deploy --dry-run`, `deploy`, `run --json`, and REST run against `https://floom.dev`.
- Virgin QA run A verified browser login/token creation, token revoke, CLI publish/run, public browser/API/MCP run, and 390px overflow.
- Virgin QA run B verified MCP/CLI publish and run from scratch, including MCP app-contract tools.
- Independent security audit verified the dependency install sandbox no longer receives secrets and the secret runtime sandbox has no internet.
- `f614a33` fixes publish response URLs so API/MCP publish responses use the configured canonical origin instead of the Vercel alias.
- Post-`f614a33` production MCP publish verified returned app URL `https://floom.dev/p/url-canon-20260501074153-30a48c`, run execution `79b9d828-0a94-4074-bc0c-547412c71c0c`, and coordinator cleanup succeeded.
- `main` deployed to production at commit `5a83c0a8abef02e4bfc89af72089d157f037111d`.
- Final production v0.1 live gate passed after the `main` deploy with dependency slug `req-gate-20260501074701-5acba7`, secret slug `secret-gate-20260501074701-5acba7`, and all 16 automated checks green.

## Subagent Browser QA

Independent agents can use AX41 browser sessions. The required handoff is now documented in `docs/agent-browser-qa-runbook.md`.

Auth/env ownership is documented in `docs/launch-env-auth-map.md`.

Use `node scripts/run-live-v01-gate.mjs` from the repo root to rerun the live gate with redacted output. It expects `/tmp/floom-v01-prod-refresh.env` and `/tmp/floom-v01-agent-token` unless overridden by `FLOOM_VERCEL_ENV_FILE` and `FLOOM_TOKEN_FILE`.

## User-Reported Blocking List

- PR #11 merge: UI v11 polish and templates.
- PR #3 merge: v0.1 dependencies and encrypted secrets.
- Supabase SMTP: remove default 3/hr signup email cap.
- Sentry / Vercel Analytics.
- Real meeting-action-items handler on canonical production.
- Visual unify agent for `/docs`, `/legal`, HeroDemo, and icons.
- A11y and multi-browser pass.
- Status page can land post-launch.

## Verification Rule

Do not claim launch readiness until the full flow passes:

signup/signin -> token -> CLI setup -> publish v0.1 app -> set encrypted secret -> browser/API/MCP run -> revoke token -> verify revoked token fails.
