# Agent Browser QA Runbook

Purpose: let independent agents test Floom browser flows on AX41 without relying on the coordinator's memory.

Canonical target: `https://floom.dev`

## Browser Access

AX41 has an authenticated Chrome session exposed over Chrome DevTools Protocol:

```text
http://127.0.0.1:9222
```

Agents can use either `browser-use --connect` or Playwright `chromium.connectOverCDP("http://127.0.0.1:9222")`.

Use a named session per run:

```bash
browser-use --connect --session floom-qa-<run-id> open https://floom.dev/login
browser-use --session floom-qa-<run-id> state
browser-use --session floom-qa-<run-id> screenshot /tmp/floom-virgin-qa/<run-id>/login.png
```

For fresh unauthenticated checks, create a new isolated browser context with Playwright through CDP. Do not clear the default Chrome profile.

## Redaction Rules

Never print, screenshot, commit, or paste:

- raw agent tokens
- Supabase access or refresh tokens
- JWTs
- cookies
- Vercel tokens
- service-role keys
- E2B keys
- OAuth state parameters when they include credential material

Allowed evidence:

- app slugs
- execution ids
- HTTP status codes
- token prefixes only
- redacted screenshots after raw-token panels are closed or cropped
- screenshot hashes
- product copy and layout screenshots that contain no secrets

If a raw token appears in a screenshot, delete the screenshot and replace it with a written observation plus token prefix.

## Browser Flow Checklist

Run these in order:

1. `https://floom.dev/login` unauthenticated:
   - email/password form visible
   - Google sign-in visible
   - no localhost redirects
   - 390px viewport has no document-level horizontal overflow
2. Google sign-in:
   - OAuth starts from `https://floom.dev`
   - callback returns to `https://floom.dev/auth/callback`
   - final destination is `/tokens` or another signed-in production page
   - no 502 from AX41 nginx
3. `/tokens` authenticated:
   - signed-in email visible
   - create token works
   - token appears once
   - refresh hides raw token
   - revoke works
4. CLI flow using the created token:
   - `npx @floomhq/cli@latest --version`
   - `auth login --api-url https://floom.dev`
   - `deploy --dry-run`
   - `deploy`
   - `run --json`
5. Published app:
   - `/p/:slug` loads in browser
   - browser run succeeds
   - public REST run succeeds when app is public
   - private REST run fails without auth when app is private
   - MCP `run_app` succeeds for the intended auth mode
6. Cleanup:
   - revoke any token created during the run
   - record slugs for coordinator cleanup if the agent lacks service-role access
   - delete temporary HOME, app directories, and env files under `/tmp`

## Token API Boundary

`/api/agent-tokens` requires a Supabase user bearer token from the browser session. An agent token is not allowed to mint more agent tokens.

Agent tokens are for publishing, reading, and running apps according to scopes. They are not user-session tokens.

## Screenshots

Screenshots count only when the changed or tested UI is visible. Loading screens, browser error screens, OAuth interstitials, or screenshots containing raw tokens are not launch evidence.

Store screenshots under:

```text
/tmp/floom-virgin-qa/<run-id>/
```

Run logs committed to `docs/qa-runs/` must reference screenshot filenames or hashes, not raw secret values.
