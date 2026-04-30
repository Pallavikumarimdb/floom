# Launch Readiness - 2026-04-30

Production target: `https://floom-60sec.vercel.app`

Commit tested: `aa672d817f949ef2362919abb18d34d3280426db`

Independent QA logs:

- `docs/qa-runs/qa-run-1-20260430114154.md`
- `docs/qa-runs/qa-run-2-20260430114407.md`
- `docs/qa-runs/qa-run-3-20260430113428.md`

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
- Secret-like output fields marked in the output schema were redacted.
- `/docs` and `/legal` are live.
- OpenBlog was classified as outside v0 scope: multi-file Python, dependencies, OpenAPI/FastAPI-style surface, stateful async endpoints.

## Blocking Public Self-Serve Launch

- Supabase public signup returns `email rate limit exceeded`.
- Email confirmation link behavior is not verified because no fresh confirmation email was generated.
- Supabase provider-side Site URL / Redirect URL config could not be read or changed with the current token.

Required Supabase Auth settings:

- Site URL: `https://floom-60sec.vercel.app`
- Redirect URL: `https://floom-60sec.vercel.app/auth/callback`

After provider email is unblocked, run `docs/virgin-agent-qa.md` again from a fresh browser and verify confirmation lands on production, not localhost.

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
