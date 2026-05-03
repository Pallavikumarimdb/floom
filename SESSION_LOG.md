# Session log — floom-minimal

Last updated: 2026-05-04 01:08 UTC by main-agent

## Right now (live state)

- **Prod deploy**: `floom-60sec-ht0n17isl-fedes-projects-5891bd50.vercel.app` aliased to `https://floom.dev`
- **main HEAD**: includes PR #60 (stuck-run-auto-fail) + #59 (SANDBOX_TIMEOUT 290s) + #58 (MCP rate limit) + #56 (privacy redesign + 60s root cause + craft) + earlier
- **Vercel project**: `floom-60sec` (Pro tier)
- **CLI on npm**: `@floomhq/cli@0.2.36`
- **FLOOM_ASYNC_RUNTIME**: `enabled` (no trailing newline — fixed 01:08 UTC after 0-100 score caught the bug)
- **Composio catalog**: 78 toolkits, 77 connectable + 1 coming_soon
- **Open active blockers**: 3 (see "Needs Federico's eyes" below)

## Active work (in-flight agents)

- `a38d68639afdd4fd8` — sandbox poller adversarial test (preview deploy + 4 soak tests up to 30 min + 6 failure modes + 5 adversarial probes)
- `a8f0de71a57126f63` — iter-8 craft polish (Docs nav move, kill 232 em-dashes, sticky TOC, design-vs-legacy)
- `a85e5e7ad6246ae9a` — iter-8B docs roast fixes (8 of 10 findings)
- `a6ea0e21ff1438f0a` — GitHub OAuth via agent-login (waiting for Federico's signin)
- `ae5513b9958833ac5` — multi-page docs + Cmd+K search (NOT deferred — shipping now)

## Needs Federico's eyes

### [P1] Walk one Composio non-Gmail/Slack OAuth flow end-to-end — AGENT-LOGIN READY
- **Status:** session live, waiting for your signin
- **Your action:** open the noVNC URL the agent posted (`indirect-restricted-disk-poor.trycloudflare.com/vnc.html?...`), enter the password, sign into GitHub, reply "ok signed in"
- **Unblocks:** end-to-end proof for ~75 other managed-auth toolkits
- **Repeats:** 3+ times in chat before the escalation got persistent
- **First raised:** 2026-05-03 22:00 UTC

### [P0] floom-minimal repo public flip
- **Blocked because:** repo is private. Some `/docs` "View Source" links to `floomhq/floom/cli-npm/templates/<slug>` 404 (templates are inline JS in floom-minimal's `tools.ts`)
- **Your action:** ONE of three:
  - (a) `gh repo edit floomhq/floom-minimal --visibility public --accept-visibility-change-consequences` — I'll re-route View Source links to floom-minimal blob paths
  - (b) Keep private, I'll extract templates into `floomhq/floom/cli-npm/templates/<slug>/` as real files
  - (c) Keep private, drop View Source links from /docs entirely
- **First raised:** 2026-05-03 22:00 UTC

### [P1] Composio auth env var injection — verify intended flow
- **Blocked because:** `grep -rn COMPOSIO_CONNECTION_ID /root/floom-minimal/src/` returns ZERO matches. Either auto-injection from active connection isn't wired, OR it's via a different path. No Composio-using app has been exercised end-to-end.
- **Your action:** confirm intended model — auto-inject from active connection, or BYO via `floom secrets set`?
- **First raised:** 2026-05-04 00:55 UTC

## Recent decisions (last 24h)

- 2026-05-04 — Drop "v0.4 / later" framing. Ship multi-page docs + search NOW (was wrong to defer).
- 2026-05-04 — SESSION_LOG.md replaces ESCALATIONS.md as primary status surface.
- 2026-05-04 — Composio: enable 120 managed-auth toolkits, document 75 unverified pending GitHub OAuth proof.
- 2026-05-03 — Vercel Pro upgrade ($20/mo) for 300s maxDuration.
- 2026-05-03 — Floom Inc. (US) is the operator, NOT German operator. /privacy + /terms English-only, no Impressum.
- 2026-05-03 — Sandbox poller (Option B) work goes on a draft branch behind dual flag, off until post-launch flip.

## Recent shipments (last 24h)

- 2026-05-04 01:08 — fix: FLOOM_ASYNC_RUNTIME trailing-newline (env var re-added with `echo -n`); deploy redone
- 2026-05-04 — PR #60 stuck-run-auto-fail merged (cron sweep tightened, 1.5x sandbox-timeout backstop)
- 2026-05-03 — PRs #62/#63/#64/#66 opened as draft (multi-endpoint, floom-logs, app-fork, rich-input-widgets)
- 2026-05-03 — PR #59 SANDBOX_TIMEOUT 250s → 290s
- 2026-05-03 — PR #58 MCP run_app rate-limit fix (forwards X-Forwarded-For)
- 2026-05-03 — PR #56 (iter-7) merged: privacy redesign + 60s root-cause fix (`runCommand()` 55s cap was hidden) + 11 craft fixes
- 2026-05-03 — PR #57 sandbox poller draft for floom-minimal (correct repo, dual-flag gated)
- 2026-05-03 — PR #51-54 series: rate limits, retry-after, /tokens, sentry source maps
- 2026-05-03 — PR #47 corrected legal pages (US Floom Inc., dropped Impressum + DSGVO)
- 2026-05-03 — PR #41 corrected Composio "coming soon" filter for unwired providers
- 2026-05-03 — PR #38 batch-2/3/4 (21 + 8 + 3 fixes, including privacy redact cherry-pick)
- 2026-05-03 — Composio bulk-enable: 120 auth_configs ENABLED at Composio level
- 2026-05-03 — Sentry alert rules: 3 created, source maps uploading

## Recent bugs caught (last 24h)

- 2026-05-04 — `FLOOM_ASYNC_RUNTIME=enabled\n` (trailing newline) made `=== "enabled"` false → async silently OFF for ~2h. Caught by 0-100 score agent.
- 2026-05-04 — `runCommand()` 55s internal cap silently killed user code at exactly 60s wall regardless of SANDBOX_TIMEOUT_MS. Caught after multiple long-job 504s.
- 2026-05-04 — Composio `auth-configs.ts` had `limit=100` on the auth_configs fetch but workspace had 120 → silent truncation. ~20 toolkits stayed coming_soon despite working configs.
- 2026-05-03 — Sentry source map upload failed with `SENTRY_PROJECT 'floom-server\n'` (trailing newline from `echo` instead of `echo -n`).
- 2026-05-03 — QStash creds had trailing `\n` from `echo`. Would have failed slow async runs silently.
- 2026-05-03 — MCP `run_app` rate limit was bypassed because `forwardedHeaders()` only forwarded `Authorization`, not `X-Forwarded-For` → all anon callers shared one rate-limit bucket.
- 2026-05-03 — Privacy: app owners were reading runner inputs/outputs (rubric violation, fixed in PR #56).
- 2026-05-03 — `sandbox_id` in /api/runs/<id> leaked inputs to anon (PR #35 redact had landed but cherry-pick was needed in PR #38).

## 0-100 launch score (median of Claude/Kimi/Gemini, captured 2026-05-04 01:00)

- Median: **70/100**, LAUNCH-WITH-CAVEATS
- Claude 81, Kimi 70, Gemini 65
- Captured BEFORE the FLOOM_ASYNC_RUNTIME fix landed → re-score expected to bump
- Full report: `/root/fede-vault/floom/launch-score-2026-05-04.md`

## Path to 100/100 (per the score agent's plan)

After in-flight agents land + 3 small lifts:
1. Fix env-var newline ✓ DONE 01:08 UTC
2. /studio + /me routes (or refactor SiteHeader to not expect them)
3. Federico flips floom-minimal public + Composio CSRF redirect + floom validate double-output

Score expected to land 92-95.
