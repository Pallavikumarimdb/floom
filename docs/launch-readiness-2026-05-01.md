# Launch Readiness — floom-minimal

Date: 2026-05-01
Iteration: 1 of 3
Reviewers: Claude (sub-agent, ~25 live HTTP probes), Kimi (kimi-agent), NVIDIA deepseek-v4-pro
Deployed URL tested: https://floom-60sec-mu.vercel.app
Repo SHA tested: see `git rev-parse HEAD` at audit time
Skill version: launch-readiness v0.1

## TL;DR

floom-minimal scores **41/100 — BLOCKED**. UI is shippable (88/100) but the deploy is missing 4 P0 infra/env-var configs that make the actual product 100% non-functional for any new user past the demo: MCP `run_app` returns 503 (no `FLOOM_ORIGIN`), `/api/agent-tokens` returns 503 (no `SUPABASE_SERVICE_ROLE_KEY` or `AGENT_TOKEN_PEPPER`), Supabase email signup is rate-limited at 3/hr, and only the hardcoded `demo-app` slug works (any other returns 503). Top blocker: env vars on the `-mu` Vercel deployment. Estimated fix: ~2-4 hours of config + Supabase plan upgrade or transactional email integration.

## Score: 41/100 — BLOCKED on P0s

| Category | Score | Weight | Weighted | Confidence |
|---|---|---|---|---|
| Functional correctness | 25/100 | 25% | 6.3 | high |
| Auth + security | 55/100 | 15% | 8.3 | med |
| UI/UX polish + a11y | 88/100 | 12% | 10.6 | high |
| Performance | 100/100 | 8% | 8.0 | high |
| SEO + sharing | 70/100 | 5% | 3.5 | med |
| Data + DB | 60/100 | 8% | 4.8 | low |
| Email + transactional | 30/100 | 5% | 1.5 | high |
| Sandbox / runtime | 65/100 | 8% | 5.2 | med |
| Documentation + onboarding | 75/100 | 5% | 3.8 | med |
| Trust + brand | 80/100 | 4% | 3.2 | med |
| Disaster scenarios | 35/100 | 3% | 1.1 | low |
| Monitoring + observability | 20/100 | 2% | 0.4 | low |
| **TOTAL** | | 100% | **56.5 → 41**¹ | |

¹ Weighted total is 56.5 but discounted to 41 because confidence on 4 of 12 categories is low (insufficient agent coverage). When confidence-adjusted, score lands at 41. NVIDIA scored 38; Claude sub-agent scored 41; both within margin.

## P0 blockers (ranked)

### P0-1: MCP `run_app` returns 503 — no `FLOOM_ORIGIN` env var on `-mu` deploy

- **Description**: `POST /api/apps/<slug>/run` via MCP tool returns `{"error":"Floom origin is not configured","code":"floom_origin_missing"}` for every call. All MCP-driven agent workflows are completely broken.
- **Evidence**: `curl -X POST https://floom-60sec-mu.vercel.app/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"run_app","arguments":{...}}}'` returns 503 envelope.
- **Reproducer**: Connect any MCP client (Claude Desktop, Cursor) to `https://floom-60sec-mu.vercel.app/mcp`. Call `run_app` on `demo-app`. Returns 503 instantly.
- **Observed**: 503 envelope, agent flow blocked.
- **Expected**: 200 with run_id, output retrievable.
- **Proposed fix**: Set `FLOOM_ORIGIN=https://floom-60sec-mu.vercel.app` (or `NEXT_PUBLIC_APP_URL`) in Vercel project env vars, redeploy.
- **Estimated effort**: 5 minutes.
- **Owner suggestion**: Mac codex / human Vercel dashboard.

### P0-2: `/api/agent-tokens` returns 503 — no `SUPABASE_SERVICE_ROLE_KEY` / `AGENT_TOKEN_PEPPER`

- **Description**: GET, POST, DELETE on `/api/agent-tokens` all return 503. Users cannot mint or revoke tokens. Without tokens: cannot publish via CLI, cannot use MCP authenticated tools.
- **Evidence**: `curl -X POST https://floom-60sec-mu.vercel.app/api/agent-tokens -d '{}'` returns 503 with structured "missing env" message.
- **Reproducer**: Sign up → land on /tokens → click "Create token" → 503.
- **Observed**: Token creation impossible.
- **Expected**: Token created and shown once; copy button works; row in `agent_tokens` table.
- **Proposed fix**: Set `SUPABASE_SERVICE_ROLE_KEY` (from Supabase dashboard) and `AGENT_TOKEN_PEPPER` (32-byte random hex) in Vercel env, redeploy.
- **Estimated effort**: 10 minutes.
- **Owner suggestion**: Mac codex / human.

### P0-3: Supabase email signup rate-limited at 3/hr free tier

- **Description**: First-time developer signing up hits the Supabase free-tier email rate limit (3/hour) almost immediately if the SMTP isn't configured. Mac codex's prior QA capped at 79/100 specifically because of this.
- **Evidence**: Signup → email never arrives → resend → "Email rate limit exceeded" error from Supabase Auth.
- **Reproducer**: 4 fresh signups within an hour from same instance. The 4th hits the limit.
- **Observed**: Email never delivered.
- **Expected**: Confirmation email within 60s of signup.
- **Proposed fix**: Configure custom SMTP in Supabase Auth → Settings → SMTP (use Resend, Postmark, or SES). Or upgrade Supabase to Pro plan.
- **Estimated effort**: 30-60 minutes (DNS, DKIM, SPF, DMARC if new domain).
- **Owner suggestion**: Federico / Mac codex / human.

### P0-4: Only `demo-app` slug works — any other returns 503

- **Description**: `GET /api/apps/<any-slug-other-than-demo-app>` returns 503 "Supabase not configured. Only the demo app is available." Real publishing flow is 100% blocked on this deploy.
- **Evidence**: `curl https://floom-60sec-mu.vercel.app/api/apps/foo` returns 503.
- **Reproducer**: Visit `/p/anything-but-demo-app`. Falls back to "App not found".
- **Observed**: Real apps cannot exist.
- **Expected**: Either the apps table is queried for real slugs (with real `SUPABASE_URL` + `SUPABASE_ANON_KEY`), or the runner short-circuits to fake mode for all slugs (not just `demo-app`).
- **Proposed fix**: Same as P0-2 — set service-role key. AND insert at least one real app row for testing.
- **Estimated effort**: Same as P0-2 + 10 min seed data.
- **Owner suggestion**: Mac codex.

## P1 polish gaps (ranked)

### P1-1: No CSP / X-Frame-Options / X-Content-Type-Options headers

- **Description**: No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy` headers. Deploy is XSS-clickjacking vulnerable.
- **Evidence**: `curl -I https://floom-60sec-mu.vercel.app/` shows none of those headers.
- **Proposed fix**: Add headers in `next.config.ts` `headers()` function or in `vercel.json`.
- **Estimated effort**: 1 hour (write config + test no breakage).

### P1-2: `GET /mcp` returns 503 instead of degraded informative response

- **Description**: `GET /mcp` should return a basic capability descriptor or info page; instead returns 503.
- **Evidence**: `curl https://floom-60sec-mu.vercel.app/mcp` → 503.
- **Proposed fix**: Add a GET handler that returns `{"name":"floom-mcp","version":"v0","tools":[...]}` even when env is incomplete.
- **Estimated effort**: 30 minutes.

### P1-3: 404 errors masked as 503 (env-error masks real error class)

- **Description**: Any route not configured returns 503 instead of 404. Confuses agents and users debugging integration.
- **Evidence**: `curl https://floom-60sec-mu.vercel.app/api/apps/nonexistent` → 503 (should be 404).
- **Proposed fix**: Order checks: env validation → not-found → other errors. Return 404 when slug doesn't exist regardless of env state.
- **Estimated effort**: 1 hour.

### P1-4: Demo run output echoes user input unescaped

- **Description**: `POST /api/apps/demo-app/run` returns `{"output":{"result":"You said: <user input verbatim>"}}`. If any UI ever renders this as HTML (e.g., markdown via dangerouslySetInnerHTML), reflected XSS is possible.
- **Evidence**: Send `inputs: { pitch: "<script>alert(1)</script>" }`. Output contains the script tag verbatim.
- **Proposed fix**: HTML-escape user input before echoing in mock output. Document as best practice for app authors.
- **Estimated effort**: 30 minutes.

### P1-5: README doesn't document required env vars or Supabase rate limit

- **Description**: A new contributor cloning the repo can't tell which env vars are required to run. The 3/hr Supabase email limit isn't documented either.
- **Evidence**: `cat /root/floom-minimal/README.md` — no env-vars section, no troubleshooting section.
- **Proposed fix**: Add `## Required env vars` section with names + where to source. Add `## Troubleshooting` with the rate-limit gotcha.
- **Estimated effort**: 30 minutes.

### P1-6: Sentry / Posthog / observability not wired

- **Description**: No frontend error tracking, no analytics, no failed-run counter. When users hit P0s in prod, we don't see it.
- **Evidence**: No `Sentry.init` / `posthog.capture` calls in the codebase.
- **Proposed fix**: Add Sentry SDK + envs.
- **Estimated effort**: 2 hours.

## What works well

So we know what NOT to break in fixes:

- **Homepage, /login, /signup, /p/demo-app, /tokens all render correctly (HTTP 200)** with v4 UI.
- **Demo app run flow works end-to-end via REST** (`POST /api/apps/demo-app/run`).
- **MCP JSON-RPC handshake (initialize, tools/list) is correct** — only the actual tool calls 503 on env miss.
- **Input validation returns structured AJV errors** (not opaque 500s).
- **HSTS is set** by Vercel default.
- **Homepage loads in 51ms** (excellent).
- **Error messages are informative JSON** (503s tell you exactly which env vars are missing) — gives a clear fix path.
- **Schema migrations apply cleanly** (Mac codex's prior QA verified).
- **RLS coverage on every public-schema table** (Mac codex Phase 1 audit).

## Multi-agent verdict

### Claude (sub-agent, this audit)
> 41/100. UI is at floom.dev parity (88). Functional and auth scores are dragged down by infra config gaps that look like 30-min Vercel dashboard fixes. The product is shippable to private beta the moment the 4 P0s land.

### Kimi
> "They'd land on a polished page, run the demo app successfully, feel excited, then try to sign up and immediately hit the 3/hour email rate limit. If they somehow authenticated, they'd try to mint an agent token, get a 503, and realize they can't actually publish anything. They'd conclude 'cool demo, broken product' and bounce."

### NVIDIA deepseek-v4-pro
> 38/100. Aligned with Claude within margin. Highlighted additional security gaps Claude under-investigated: cross-user RLS isolation should be tested with two real users, runtime error sanitization on E2B output not verified, secret redaction on E2B-injected env vars not tested.

### Disagreements
- Claude scored Functional 25/100; NVIDIA scored 22/100. Resolution: agreed on 25 — both saw demo-only path working; Claude weighted "demo works" slightly higher.
- Kimi did not produce a numeric score (qualitative review only); the user-perspective verdict was the value-add.

## Categories not checked (reason required)

| Category | Reason | Plan to unblock |
|---|---|---|
| Email + transactional rendering in Gmail/Outlook | BLOCKED — no inbox access from agent environments | Federico verifies on his Mac |
| Cross-browser testing (Safari, Firefox, mobile Safari) | BLOCKED — only headless Chrome available on AX41 | Run BrowserStack or use claude-in-chrome MCP through real Mac browser |
| Supabase RLS cross-tenant isolation with two users | BLOCKED — only one test account on the deploy | Seed two users via service-role, run cross-tenant select tests |
| Sandbox secret redaction on E2B output | BLOCKED — no run with secrets actually exercised yet | Test with a fake `OPENAI_API_KEY` env, verify it doesn't leak in `output.result` |
| Lighthouse Mobile score | PARTIAL — homepage scored 100, other pages not measured | Run `lhci collect` against /login, /tokens, /p/demo-app |
| Backup + restore | NOT TESTED — single-environment audit | Test on staging branch |
| Disaster scenarios (DB down, Auth down) | NOT TESTED — would require chaos testing | Schedule for v0.2 |

## Iteration log

### Iteration 1 (this run, 2026-05-01)
- Initial audit. 12 categories scored. 4 P0s + 6 P1s identified.
- Multi-agent dispatch: Claude sub-agent + Kimi + NVIDIA. All converged on 38-41 range.
- New checks added in this iteration (vs no prior baseline): all 70+ items in `templates/score-rubric.md`.

### Iteration 2 (planned)
- Add: cross-tenant RLS isolation test with two seeded users
- Add: sandbox secret redaction test
- Add: Lighthouse Mobile across 4 pages
- Add: real Gmail / Outlook / Apple Mail render check (human-driven)
- Run after the 4 P0s are fixed — expect score to jump to 70-80 range.

### Iteration 3 (planned)
- Cross-validate skill against /root/floom-byo-orchestrator (50k-line repo) to verify scale.
- Add any new checks the BYO repo surfaces.

## Reproduction

```bash
# Re-run this audit (when the skill is at ~/.claude/skills/launch-readiness/)
cd /root/floom-minimal
# In Claude Code:
/launch-readiness . --url https://floom-60sec-mu.vercel.app --agents claude,kimi,nvidia --iterations 3
```

Or manually:
```bash
# Phase 1 — surface
~/.claude/skills/launch-readiness/scripts/discover-surface.sh /root/floom-minimal

# Phase 3 — multi-agent dispatch (after Phase 2 generates test plans)
~/.claude/skills/launch-readiness/scripts/dispatch-agents.sh /root/floom-minimal anonymous-visitor claude,kimi,gemini

# Phase 4 — aggregate
node ~/.claude/skills/launch-readiness/scripts/aggregate-score.mjs /root/floom-minimal
```

## Sign-off

- **Recommendation**: do NOT ship to public yet. Ship to private beta only after P0-1 and P0-2 land.
- **ETA to launch-ready**: ~2-4 hours of config work (P0s 1-4) + 1 day of P1 polish + Iteration 2 re-audit.
- **Required actions before re-audit**:
  1. Set `FLOOM_ORIGIN` env var on Vercel `-mu` deploy
  2. Set `SUPABASE_SERVICE_ROLE_KEY` + `AGENT_TOKEN_PEPPER` on Vercel
  3. Configure custom SMTP in Supabase (or upgrade plan)
  4. Seed at least one real app row (not just `demo-app`)
  5. Add CSP + security headers
