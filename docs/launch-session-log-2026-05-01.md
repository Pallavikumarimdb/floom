# Launch Session Log - 2026-05-01

## Launch Target

Launch target is v0.1, not v0-only.

The launch claim is:

> localhost to live in 60 seconds

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

1. Apply and verify Supabase `app_secrets` migration.
2. Deploy v0.1 integration branch.
3. Verify Google signup/signin to `/tokens` on `https://floom.dev`.
4. Fix token page API failure if still present after v0.1 deploy.
5. Test token create/copy/list/revoke.
6. Test CLI setup with generated token.
7. Test app publish with `requirements.txt`.
8. Test encrypted secret set/list/delete and run.
9. Test browser/API/MCP run for v0.1 apps.
10. Run virgin-agent QA for full signup/token/publish/run flow.
11. Run independent code-cleanliness/security agents.
12. Decide merge order for PR #11 UI polish after v0.1 flow is green.

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
