# Launch Readiness - 2026-05-01 Post-PR1 Bot Runs

Production target: `https://floom-60sec.vercel.app`

Current production commit: `e7f4af082441b8b558bb64e6fbbbd83c73fbf6ee`

Locked launch claim:

> From localhost to live and secure in 60sec.

Verified scope for that claim:

- Single-file stdlib Python function app.
- `floom.yaml`, `input.schema.json`, `output.schema.json`, and one Python entrypoint.
- Existing confirmed account and agent token.
- CLI or MCP publish to the canonical production host.
- Browser, REST API, and MCP run.
- Public/private access control.

Out of scope for v0:

- Python dependencies.
- App secrets.
- Multi-file apps.
- FastAPI/OpenAPI apps.
- TypeScript apps.
- Java apps.
- OpenBlog-style stateful web apps.

## Independent Bot Evidence

Logs are stored outside the repo under `/tmp/floom-launch-bot-logs/` and were scanned for raw token/JWT/Supabase/E2B/password patterns before this summary was written.

| Run | Focus | Result | Notes |
| --- | --- | --- | --- |
| Bot #2 | MCP publish/run plus CLI private publish | Pass for assigned flow | Published `bot2-mcp-20260501041020ai98` and `bot2-cli-20260501041020ai98`; MCP run, public API run, private owner API run, revoke enforcement passed. |
| Bot #3 | Signup/OAuth/token/public publish | Pass except email confirmation | Fresh signup submission was accepted; Google OAuth reached Google without redirect mismatch; token create/revoke, CLI publish, browser/API run, revoked publish passed. Email confirmation was not verified because the generated mailbox was inaccessible. |
| Bot #4 | Public/private publish from scratch | Pass | Published `bot4-public-1777603032` and `bot4-private-1777603032`; anonymous public flow, private anonymous block, owner token private run, invalid bearer, revoke, local gates all passed. |

Bot #1 was closed after it became stuck without final evidence. A partial log exists and was not counted as final launch evidence.

## Direct Production Evidence

- Main merged and deployed after PR #1 UI launch polish: `e8f11e74db39ede0ed7a756d44653e884ac4628d`.
- Vercel Analytics merged and deployed after PR #10: `e7f4af082441b8b558bb64e6fbbbd83c73fbf6ee`.
- Production routes verified at `e7f4af0`:
  - `/`
  - `/login`
  - `/docs`
  - `/legal`
  - `/p/pitch-coach`
  - `/api/apps/pitch-coach`
  - `/mcp`
  - `/opengraph-image`
  - `/p/pitch-coach/opengraph-image`
  - `/_vercel/insights/script.js`
- Production `pitch-coach` E2B run succeeded with execution `6326b064-4a0f-4906-afa8-099cc5ce9894`.
- 390px browser checks on home, login, docs, legal, and app pages had:
  - zero console errors
  - no horizontal overflow
  - no waitlist copy

## Supabase Evidence

Direct admin evidence was collected for the bot-created apps without logging raw secrets.

- Found app rows:
  - `bot-3-public-20260501035947`, public `true`
  - `bot2-mcp-20260501041020ai98`, public `true`
  - `bot2-cli-20260501041020ai98`, public `false`
- Found app rows for bot #4:
  - `bot4-public-1777603032`, public `true`
  - `bot4-private-1777603032`, public `false`
- Found 5 app version rows across bot #2, bot #3, and bot #4 evidence checks.
- Each version had a private `app-bundles` storage object.
- Found 9 successful execution rows for those app ids.
- Found 13 agent-token rows for the bot owners, all revoked.

## Current Scores

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Repo clean / pushed / deployed | 100 | Main equals deployed production commit `e7f4af0`; clean post-merge clone passed local gates. |
| Landing, docs, legal, app UI | 96 | Production browser pass at 390px across public pages with no console errors or overflow. |
| OG/social metadata | 95 | Global and app OG image endpoints return 200 PNG. |
| Vercel production deploy | 99 | Canonical alias points at the verified deployment; route sweep is green. |
| Vercel Analytics | 100 | `/_vercel/insights/script.js` returns 200 JavaScript in production. |
| Sentry/error monitoring | 35 | Still waiting for Sentry project/DSN. |
| Supabase schema/storage/RLS | 94 | Direct rows, versions, private storage objects, executions, and revoked tokens verified. |
| Auth sign-in | 94 | Confirmed test users sign in and reach `/tokens`; Google OAuth starts without redirect mismatch. |
| Public signup | 85 | Fresh signup submission accepted in bot #3; confirmation email not verified. |
| Email confirmation | 70 | Blocked by inaccessible generated mailbox; provider redirect no longer points at localhost in OAuth start evidence. |
| Token UI | 98 | Token visible once, hidden after refresh, copy/revoke verified by bots #2/#3/#4. |
| CLI publish | 100 | Fresh public/private apps published from scratch by bots #2/#3/#4. |
| MCP publish/run | 96 | Bot #2 published and ran via MCP; contract/template guardrails verified. |
| API run | 100 | Public and private-owner runs verified; private anonymous blocked. |
| Browser app run | 98 | Mobile browser output screenshots from bots #2/#3/#4. |
| Public/private access control | 100 | Anonymous public pass, private anonymous block, owner token pass, invalid bearer 401, revoked token 401. |
| E2B runtime | 96 | Production executions returned real app output and execution ids. |
| Scoped v0 app coverage | 94 | v0-safe contract is explicit; unsupported app shapes are rejected or classified. |
| Broad app coverage | 35 | Dependencies, secrets, multi-file, TypeScript, Java, OpenAPI/FastAPI remain out of scope. |
| Code cleanliness | 90 | Local gates pass; remaining lint warnings are non-blocking and pre-existing. |

Overall:

- Controlled/invited-user v0 launch: `96/100`.
- Public self-serve launch: `88/100`.
- Broad any-app launch: `35/100`.

## Remaining Launch Blockers

1. Sentry is not wired because no canonical Sentry DSN/project is present yet.
2. Email confirmation has not been verified end to end with an accessible mailbox after the latest Supabase auth callback work.
3. Public self-serve launch still depends on reliable transactional email; custom SMTP is tracked in GitHub issue `#6`.
4. Broad app support remains intentionally post-v0.

## Launch Decision

The locked v0 claim is verified for confirmed users with an agent token:

> From localhost to live and secure in 60sec.

Public self-serve remains gated on email confirmation and SMTP reliability. Broad app hosting remains out of scope.
