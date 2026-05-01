# Launch Readiness - 2026-04-30

Production target: `https://floom-60sec.vercel.app`

Commit tested: `aa672d817f949ef2362919abb18d34d3280426db`

Independent QA logs:

- `docs/qa-runs/qa-run-1-20260430114154.md`
- `docs/qa-runs/qa-run-2-20260430114407.md`
- `docs/qa-runs/qa-run-3-20260430113428.md`

## Locked Launch Claim

Exact claim wording:

> from localhost to live and secure in 60sec

Verified meaning:

- The 60sec path starts after account setup and agent-token creation.
- The app is one stdlib-only Python file with `floom.yaml`, `input.schema.json`, and `output.schema.json`.
- The CLI publishes with `FLOOM_TOKEN`.
- The app becomes live at `/p/:slug` and runs through browser/API flows.
- Public apps allow anonymous metadata and run access.
- Private apps block anonymous metadata and runs, and allow owner-token metadata and runs.
- Secure means the verified v0 controls: E2B sandboxed execution, scoped/revocable agent tokens created through `/tokens`, schema-marked input/output redaction before persistence, caller-derived plus per-app run rate limits, and public/private access control.

Out of mainline unless re-verified end to end: TypeScript apps, Java apps, dependency installation, user-provided secrets, OpenAPI/FastAPI apps, multi-file bundles, background workers, arbitrary web servers, and full repo hosting.

## Verified Working

- Authenticated browser token creation works.
- Agent token is shown once, hidden after refresh, and revoke works.
- Fresh public app publish from CLI works with `FLOOM_TOKEN`.
- Fresh private app publish from CLI works with `FLOOM_TOKEN`.
- Public anonymous metadata and run work.
- Private anonymous metadata and run are blocked.
- Private owner token metadata and run work.
- Invalid bearer token on public run returns `401`.
- Revoked token fails private run and publish.
- Browser run works for the tested single-file Python apps.
- REST API run works for public and private-owner flows.
- MCP descriptor and `run_app` work for tested flows.
- Supabase evidence exists for apps, app versions, executions, token metadata, bundle storage, and private bucket config in QA runs #1 and #2.
- E2B-backed production execution returned app output; fake-mode output was not observed.
- Secret-like inputs and schema-marked output fields are redacted before persistence or response output.
- `/docs` and `/legal` are live.
- OpenBlog was classified as outside v0 scope: multi-file Python, dependencies, OpenAPI/FastAPI-style surface, stateful async endpoints.

## Blocking Public Self-Serve Launch

- Supabase public signup returns `email rate limit exceeded`.
- Email confirmation link behavior is not verified because no fresh confirmation email was generated.
- Supabase provider-side Site URL / Redirect URL config could not be read or changed with the current token.

Required Supabase Auth settings:

- Site URL: `https://floom-60sec.vercel.app`
- Redirect URL: `https://floom-60sec.vercel.app/auth/callback`
- Google provider enabled in Supabase Auth with the production Google OAuth client ID and client secret.
- Google Cloud OAuth redirect URI includes the Supabase callback URL shown in the Supabase Google provider settings.

After provider email is unblocked, run `docs/virgin-agent-qa.md` again from a fresh browser and verify confirmation lands on production, not localhost.

## Fresh-Agent Launch Gate Checklist

Before launch, a fresh agent must verify each item with live production evidence:

- [ ] Start from a fresh browser profile or cleared session.
- [ ] Confirm signup/sign-in lands on `https://floom-60sec.vercel.app/auth/callback`, not localhost.
- [ ] Create an agent token in `/tokens`; verify the raw token is shown once.
- [ ] Publish the verified single-file stdlib Python fixture with `FLOOM_TOKEN` and production `FLOOM_API_URL`.
- [ ] Open the returned `/p/:slug` page and run it in the browser.
- [ ] Run the same app through the REST API with the owner token.
- [ ] Verify a public app allows anonymous metadata and run.
- [ ] Verify a private app blocks anonymous metadata and run.
- [ ] Verify a private app allows owner-token metadata and run.
- [ ] Verify an invalid bearer token returns `401`.
- [ ] Revoke the token and verify publish/private run fail.
- [ ] Capture Supabase evidence for app, app version, execution, token metadata, and private bundle storage.
- [ ] Confirm production execution is E2B-backed and fake-mode output is not observed.
- [ ] Confirm secret-like inputs and schema-marked output are redacted as `[REDACTED]`.
- [ ] Confirm MCP does not expose token creation; create tokens from `/tokens`.
- [ ] Confirm caller-derived and per-app run rate limits execute before E2B execution.
- [ ] Confirm docs do not present TypeScript, Java, dependencies, secrets, OpenAPI/FastAPI, or multi-file apps as v0 mainline.

## Scores From Independent Runs

| Area | Run #1 | Run #2 | Run #3 | Current Read |
| --- | ---: | ---: | ---: | --- |
| Token create/copy/list/revoke | 100 | 95 | 0 | Pass in token-focused runs |
| CLI publish with token | 100 | 100 | 0 | Pass in token-focused runs |
| Public app access | 100 | 100 | 95 | Pass |
| Private app access | 100 | 100 | 0 | Pass in token-focused runs |
| Browser run | 95 | 85 | 90 | Pass with minor validation UX gap |
| API run | 100 | 100 | 95 | Pass |
| MCP run | 95 | 95 | 90 | Pass |
| Supabase rows/storage | 95 | 95 | 50 | Pass when DB evidence is collected |
| E2B execution | 90 | 95 | 70 | Pass at production-output level |
| OpenBlog coverage | 35 | 35 | 100 classification | Not v0-supported |
| Mobile UI | 75 | 95 | 90 | Pass after docs command wrapping cleanup |
| Public signup | 55 | 55 | 60 | Blocked |
| Email confirmation | 40 | 50 | 0 | Blocked |

## Launch Decision

Authenticated-token v0 demo: pass.

Public self-serve launch: fail until Supabase signup/email confirmation is unblocked and verified.

60-second claim: verified only for the narrow path after account/token setup: single-file stdlib Python app, existing token, CLI publish, browser/API run.
