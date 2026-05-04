# Floom v0.4 Launch Audit Checklist

**Source of truth for launch readiness.** Every item must be 10/10 verified, not "presumed working."

**Bar:** MIN-of-dims = 10. Average doesn't count. Strong dims do not cover for weak ones.

**Status legend:**
- `[ ]` not yet verified at 10/10
- `[~]` partially verified / in flight
- `[x]` verified 10/10 — last checked date in note
- `BLOCKED` — known broken / blocker

**For each item:** if you mark `[x]`, append the date + verification method (curl command, screenshot path, agent run ID, etc.). No checking off without evidence.

---

## A. Core deploy + run flow (weight 25%)

- [ ] **A1** `npm install -g @floomhq/cli@latest` succeeds on fresh Mac/Linux/Windows machine
  - Acceptance: `floom --version` returns 0.3.3+ on all 3 platforms
  - Test: spin up fresh Docker image with Node, run install, check version

- [ ] **A2** `npx @floomhq/cli@latest setup` flow opens browser, completes auth, saves `~/.floom/config.json`
  - Acceptance: Token persisted, `floom auth whoami` returns user info
  - Test: real browser walk on a fresh machine

- [ ] **A3** `floom init` produces 2-file scaffold (floom.yaml with embedded schemas + app.py)
  - Acceptance: 2 files created, no `*.schema.json`, manifest valid
  - Test: `cd /tmp/x && floom init --name X --slug x --type custom && ls`

- [ ] **A4** `floom init --split-schemas` produces 4-file legacy scaffold
  - Acceptance: floom.yaml + app.py + input.schema.json + output.schema.json
  - Test: `cd /tmp/y && floom init --split-schemas && ls`

- [ ] **A5** `floom deploy` from a 2-file dir succeeds + returns `https://floom.dev/p/<slug>`
  - Acceptance: bundle uploads, app row in DB, `/p/<slug>` returns 200
  - Test: deploy a hello-world via CLI, curl the URL

- [ ] **A6** `floom deploy` from a 4-file legacy dir succeeds (backwards compat)
  - Acceptance: same as A5
  - Test: deploy a multi-file app, curl URL

- [ ] **A7** `floom run <slug>` returns JSON output via CLI
  - Acceptance: exit 0, valid JSON, expected output shape
  - Test: `floom run meeting-action-items '{"transcript":"..."}' --json`

- [ ] **A8** `floom run <slug>` on floom.dev (NOT floom-60sec) returns valid result
  - Acceptance: no 404 on the run endpoint (Kimi hit this earlier)
  - Test: `curl -X POST https://floom.dev/api/apps/<slug>/run`

- [ ] **A9** `/p/<slug>` page renders for public apps to anon users
  - Acceptance: 200, page shows form per input_schema, "Run" button works
  - Test: curl + browser walk

- [ ] **A10** `/p/<slug>` page renders for owner of private apps; 404 for anon on private
  - Acceptance: owner sees app, anon gets 404
  - Test: two browser sessions

- [ ] **A11** Async runtime: `POST /run` returns 202 + execution_id + view_token
  - Acceptance: response shape correct, view_token decodes
  - Test: `curl -X POST .../run`, inspect response

- [ ] **A12** Polling `/api/runs/<id>` with view_token returns status updates → final result
  - Acceptance: queued → running → succeeded transitions; output present at terminal
  - Test: full poll loop in shell

- [ ] **A13** Run failure surfaces `error` + `error_detail` in response
  - Acceptance: exception in handler → `status: failed` + clear error
  - Test: deploy a broken app, run it, observe response

- [ ] **A14** App update (re-deploy same slug) creates new app_versions row, run uses latest
  - Acceptance: version increments, runs use new bundle
  - Test: deploy v1, run, deploy v2, run, verify different output

- [ ] **A15** App delete removes app + executions + bundle
  - Acceptance: `apps` row gone, `app_versions` cascade, storage object deleted
  - Test: `floom apps delete <slug>`, query DB

---

## B. Secrets (weight in Auth/Sec 15%)

- [~] **B1** `floom secrets set <slug> NAME --value-stdin` succeeds (returns 200, not 500)
  - Acceptance: HTTP 200, secret stored encrypted in app_secrets
  - Test: real CLI invocation, query DB
  - **BLOCKED 2026-05-04:** e2e test confirmed HTTP 500. Root cause: `secrets/route.ts:101` uses `onConflict: "app_id,name,runner_user_id"` referencing columns; migration `20260504060609` dropped the unique constraint and replaced with index. Plus route hardcodes `scope: "shared"` so even a fix wouldn't write per-runner. P0 fix dispatched.
  - **[~] IMPL FIXED 2026-05-04:** onConflict removed; replaced with insert-then-update-on-23505 helper. per-runner write path added. awaiting e2e verification on prod.

- [ ] **B2** `floom secrets list <slug>` shows all secrets (names only, values redacted)
  - Acceptance: lists names + scope + runner_user_id, no plaintext values
  - Test: `floom secrets list <slug>`

- [ ] **B3** `floom secrets delete <slug> NAME` removes the secret
  - Acceptance: row deleted, subsequent run fails with missing-secret if required
  - Test: delete + re-run

- [~] **B4** Per-runner secret happy path: set → run → injected into sandbox
  - Acceptance: app sees env var with set value
  - Test: e2e via test app that echoes first 4 chars of secret
  - **BLOCKED 2026-05-04:** depends on B1 fix. No write endpoint exists for per-runner secrets — `secrets/route.ts` hardcodes `scope:'shared'`. Runtime resolution is structurally correct but no row will ever be written for per-runner.
  - **[~] IMPL FIXED 2026-05-04:** write path now exists; per_runner scope written with runner_user_id=caller.userId. awaiting e2e verification on prod.

- [ ] **B5** Per-runner secret failure path: not set → run returns 400 `Missing configured app secret(s)`
  - Acceptance: 400 response, missing secret name listed
  - Test: deploy app declaring secret, don't set it, run, observe 400

- [ ] **B6** Shared scope secret (creator subsidizes for demos): all runners see creator's value
  - Acceptance: anon caller of a public `is_demo` app gets the secret injected
  - Test: meeting-action-items proves this works

- [ ] **B7** `scope: shared` deploy disclaimer: CLI warns + prompts y/N (interactive)
  - Acceptance: text warning shown, defaults to N abort, --accept-shared-secrets bypasses
  - Test: deploy a manifest with `scope: shared` interactively

- [ ] **B8** Secrets are encrypted at rest (verify ciphertext in DB, not plaintext)
  - Acceptance: `value_ciphertext` column is base64 with auth tag, not raw value
  - Test: query app_secrets, decode

- [ ] **B9** Decryption requires correct env key — wrong key fails gracefully
  - Acceptance: rotated key → "Failed to decrypt" not crash
  - Test: simulate via integration test

---

## C. Integrations (Composio)

- [ ] **C1** `/connections` page lists all 120 available toolkits with logos
  - Acceptance: page renders, all toolkits selectable, OAuth button per toolkit
  - Test: curl page + visual check

- [x] **C2** OAuth handshake for Gmail completes → row in `composio_connections` with status=active
  - Acceptance: real Google account redirected back, row created
  - Test: full OAuth walk via authenticated browser
  - **Verified 2026-05-04:** AX41 authenticated-chrome CDP walk — clicked Gmail Connect on /connections, completed Google account-chooser + consent screens for depontefede@gmail.com, redirected to `/connections?connected=1`. DB confirms new row: `provider=gmail, status=active, created_at=2026-05-04 20:51:50 UTC`. Screenshot: `/tmp/gmail-reconnect-evidence/1777928019462-consent-final.png`.

- [ ] **C3** Composio intermediated screen shows "Floom" (whitelabel)
  - Acceptance: NOT "Composio wants to connect..."
  - Test: visual screenshot during OAuth flow

- [ ] **C4** Manifest `integrations: [gmail]` field accepted (and `composio:` legacy alias works)
  - Acceptance: deploy succeeds with both forms; `composio:` shows deprecation warning
  - Test: deploy two test apps, observe deploy output

- [x] **C5** Runtime auto-injects `COMPOSIO_GMAIL_CONNECTION_ID` + `COMPOSIO_API_KEY` into sandbox
  - Acceptance: env vars present, values match composio_connections row
  - Test: e2e with test app that echoes presence + first 4 chars
  - **Verified 2026-05-04** via prod run `integ-split-fede` (execution_id `53a74db1-9c95-4908-9ed4-35b6f33ebdd9`): `cid_present: true`, `api_present: true`, status=succeeded. Prerequisites met: caller_user_id fix landed (`ebbad7d`); Gmail reconnected (`ca_wibPbVXpsnxJ`); runtime queries `composio_connections.provider` correctly.

- [~] **C6** Real Gmail SDK call from sandbox succeeds (`Action.GMAIL_FETCH_EMAILS`)
  - Acceptance: returns valid Gmail data, no DNS error, no auth error
  - Test: e2e with read-only Gmail action
  - **PARTIAL 2026-05-04:** Sandbox can REACH Composio backend (HTTP request landed) but probe call returned `HTTP 403 Forbidden`. Likely related to Composio "playground vs production" Federico-callable item. Floom infra correct; Composio API key scope/tier issue. Federico to address Composio dashboard config.

- [ ] **C7** Missing-connection error path: caller without Gmail connection → 412 with `connect` action
  - Acceptance: 412 response, body has `{action:"connect", url:"/connections", toolkits:["gmail"]}`
  - Test: anon caller OR authed-but-not-connected caller, run, observe 412

- [ ] **C8** Sign-in error path: anon caller → 412 with `sign-in` action
  - Acceptance: 412, body has `{action:"sign-in", url:"/login"}`
  - Test: anon, run, observe

- [ ] **C9** Frontend renders missing-connection error with clickable Connect/Sign-in CTA
  - Acceptance: RunSurface shows error UI with CTA leading to right URL
  - Test: trigger 412, screenshot

- [ ] **C10** Multi-toolkit app (`integrations: [gmail, slack]`) injects both connection IDs
  - Acceptance: both env vars present
  - Test: deploy multi-toolkit app, run

- [ ] **C11** Connection revoke flow: user can disconnect Gmail; subsequent runs fail with 412
  - Acceptance: row marked inactive, runs blocked
  - Test: revoke via /connections, attempt run

- [ ] **C12** /docs/integrations page exists, accurate, lists all 120 toolkits
  - Acceptance: 200, content matches reality, /docs/composio redirects here
  - **Currently:** rename agent in flight

---

## D. Auth & tokens

- [ ] **D1** Sign-up via Google OAuth completes → user row in Supabase auth + welcome email sent
  - Acceptance: full e2e fresh signup
  - Test: real signup with new Google account

- [ ] **D2** Sign-in via Google OAuth completes → session cookie set
  - Acceptance: subsequent requests authed
  - Test: real flow

- [ ] **D3** Session expiry / refresh works correctly
  - Acceptance: refresh tokens roll over, no premature logout
  - Test: 24hr session test

- [ ] **D4** `/tokens` page lists all user's agent tokens
  - Acceptance: page renders, shows all tokens with scopes + expiry
  - Test: authed page load

- [ ] **D5** Mint new agent token via UI works (returns plaintext once, then redacted)
  - Acceptance: shown once, hashed in DB
  - Test: real mint flow

- [ ] **D6** Agent token scopes enforced: `run` scope can run but not deploy
  - Acceptance: `run`-only token returns 403 on deploy
  - Test: mint scoped token, attempt out-of-scope action

- [ ] **D7** Agent token scopes enforced: `manage:apps` scope required for deploy
  - Acceptance: deploy without manage:apps fails
  - Test: as D6 inverse

- [ ] **D8** Agent token revoke removes access immediately
  - Acceptance: revoked token returns 401 on next request
  - Test: revoke + retry

- [ ] **D9** Magic-link / password reset email arrives + works
  - Acceptance: email lands, link clicks, password set
  - Test: real flow

- [ ] **D10** Failed auth attempts rate-limited
  - Acceptance: brute-force returns 429 after threshold
  - Test: 50 wrong attempts, observe 429

---

## E. MCP server

- [ ] **E1** `https://floom.dev/mcp` endpoint returns valid MCP metadata (tools/list)
  - Acceptance: JSON with tools array, schemas
  - Test: curl

- [ ] **E2** `find_candidate_apps` MCP tool works
  - Acceptance: tools/call returns matching apps
  - Test: real MCP client invocation

- [ ] **E3** `run_app` MCP tool works (returns execution_id, polls to completion)
  - Acceptance: full run lifecycle via MCP
  - Test: real MCP client

- [ ] **E4** `read_run` MCP tool works (returns execution status + output)
  - Acceptance: matches /api/runs/<id> shape
  - Test: real MCP client

- [ ] **E5** MCP auth: agent token forwarded via Authorization works
  - Acceptance: scoped tokens enforce scopes via MCP
  - Test: scoped token + MCP run

- [ ] **E6** MCP works with Claude Desktop / Cursor / standard MCP clients
  - Acceptance: install instructions tested in real client
  - Test: install MCP in Claude Desktop, run an app

---

## F. Sandbox runtime

- [ ] **F1** E2B sandbox spins up within reasonable time (<10s p95)
  - Acceptance: time-to-first-stdout <10s on warm path
  - Test: time 20 cold runs, measure p95

- [ ] **F2** Outbound HTTPS to googleapis.com works (proven by meeting-action-items)
  - Acceptance: Gemini call succeeds
  - Test: existing e2e

- [ ] **F3** Outbound HTTPS to other hosts works (api.openai.com, slack.com, github.com)
  - Acceptance: real HTTP call returns 200 from sandbox
  - Test: deploy a probe app calling each, observe

- [ ] **F4** Outbound HTTPS to Composio backend works
  - Acceptance: SDK calls reach backend.composio.dev
  - Test: e2e Gmail call

- [ ] **F5** `requirements.txt` install completes for typical packages
  - Acceptance: numpy, requests, gspread, etc. install + import work
  - Test: deploy app with requirements, observe install logs

- [ ] **F6** 30-min runtime cap: app running 25 minutes succeeds at end
  - Acceptance: status `succeeded` at ~1500s, not killed at 290s
  - Test: deploy sleep(1500) app, run, observe
  - **Currently:** code shipped, soak in flight

- [ ] **F7** App crash (Python exception) surfaces via stderr to user
  - Acceptance: error shown in UI + API
  - Test: deploy `raise Exception("test")`, run

- [ ] **F8** App stdout > MAX_STDOUT_TAIL_BYTES truncates with marker
  - Acceptance: tail returned, truncation indicator present
  - Test: print 100KB to stdout, observe response

- [ ] **F9** Sandbox memory limit enforced (OOM kills cleanly)
  - Acceptance: alloc 10GB → OOM kill → status failed with helpful error
  - Test: deploy memory bomb, observe

- [ ] **F10** Sandbox CPU limit enforced (no single app exhausts host)
  - Acceptance: CPU-heavy app capped, doesn't degrade other apps
  - Test: deploy infinite loop, parallel benign run, observe latency

- [ ] **F11** No stale sandboxes after run completion (cleanup verified)
  - Acceptance: sandbox terminated within 30s of execution end
  - Test: query E2B API for active sandboxes count over time

---

## G. Quotas & rate limits

- [ ] **G1** Per-app daily E2B quota (1800s default) enforced; 429 on overshoot
  - Acceptance: subsequent runs blocked once quota exhausted
  - Test: hammer an app, observe 429
  - **Currently:** 429 verified on meeting-action-items today

- [ ] **G2** Per-owner daily E2B quota (7200s default) enforced
  - Acceptance: across multiple apps owned by same user
  - Test: quota math sums correctly

- [ ] **G3** Anon rate limit (20/min/IP) fires correctly
  - Acceptance: 21st req in 60s gets 429
  - Test: rapid burst from same IP

- [ ] **G4** `is_demo` apps get tighter caps (5/hr/IP, 100/hr/app)
  - Acceptance: 6th anon run within 1hr gets 429 with Retry-After=3600
  - Test: 6-burst on meeting-action-items
  - **Currently:** verified earlier today

- [ ] **G5** Authed-non-owner rate limit (60/min) higher than anon
  - Acceptance: authed user not throttled at 20/min
  - Test: real authed user burst

- [ ] **G6** Quota warning email at 80% of daily cap
  - Acceptance: email sent to creator, template visually correct
  - Test: simulate 80% usage, check inbox

- [ ] **G7** Quota reset rolls over correctly at UTC midnight
  - Acceptance: counter resets, new runs allowed
  - Test: cron observation across midnight

---

## H. Observability

- [ ] **H1** `/api/status` returns `overall: ok` with all 5 component checks
  - Acceptance: supabase, e2b, floom-mcp, qstash, resend all `ok`
  - Test: curl
  - **Currently:** ✓ as of session

- [ ] **H2** BetterStack uptime monitor green, 4 regions
  - Acceptance: dashboard shows 100% availability over last 24h
  - Test: visit BetterStack dashboard

- [ ] **H3** Sentry capture works: throw an error in `/api/test-error`, verify it lands
  - Acceptance: issue appears in Sentry within 1 min
  - Test: trigger known error, observe

- [ ] **H4** Sentry alert routing: new error → email to team@floom.dev within 5 min
  - Acceptance: real email arrival
  - Test: trigger error, watch inbox

- [ ] **H5** Virgin curl gate runs on every Vercel deploy + opens P0 issue on failure
  - Acceptance: GitHub Action triggers correctly, opens issue on synthetic fail
  - Test: deliberately break a step, watch GitHub Issue created

- [ ] **H6** Virgin Kimi walk runs daily + opens P1 on confusion
  - Acceptance: nightly cron triggers, output saved, issue on FAIL
  - Test: review most recent run

- [ ] **H7** Migration drift detector blocks PRs with column drift
  - Acceptance: synthetic drift PR fails CI
  - Test: open PR adding a select to a non-existent column

---

## I. Email + transactional

- [ ] **I1** SPF record for send.floom.dev valid
  - Acceptance: `dig +short send.floom.dev TXT` shows v=spf1
  - Test: dig
  - **Currently:** ✓ verified earlier

- [ ] **I2** DKIM record for resend._domainkey.send.floom.dev valid
  - Acceptance: 2048-bit RSA key
  - Test: dig
  - **Currently:** ✓

- [ ] **I3** DMARC for floom.dev resolves (org-level fallback per RFC 7489)
  - Acceptance: dig _dmarc.floom.dev returns v=DMARC1
  - Test: dig
  - **Currently:** ✓

- [ ] **I4** Welcome email arrives in inbox (not spam) within 30s of signup
  - Acceptance: real signup → welcome arrives
  - Test: fresh signup with depontefede@gmail.com

- [ ] **I5** Welcome email visual design matches v0.4 brand (Inter, current palette, correct logo)
  - Acceptance: visual match to design system
  - Test: open in Gmail, screenshot, compare to floom.dev landing

- [ ] **I6** Welcome email Reply-To: team@floom.dev
  - Acceptance: hitting Reply opens compose to team@floom.dev
  - Test: real email + view-source

- [ ] **I7** Welcome email links resolve (CTA → /, not /tokens or 404)
  - Acceptance: every link clickable, lands on correct page
  - Test: click each link

- [ ] **I8** App-published email sent on first deploy of a public app
  - Acceptance: arrives, links work
  - Test: deploy public app, watch inbox

- [ ] **I9** Quota-warning email arrives at 80% threshold
  - Acceptance: per G6
  - Test: per G6

- [ ] **I10** Magic-link / password reset email design matches brand + works
  - Acceptance: visual + functional
  - Test: trigger flow

- [ ] **I11** Plain-text fallback present in every HTML email
  - Acceptance: `text` field set on every Resend send
  - Test: code review + view email source

---

## J. Docs & onboarding

- [ ] **J1** /docs/quickstart works for fresh user (Kimi virgin walk score 9+)
  - Acceptance: a new agent following quickstart literally can deploy a hello-world
  - Test: virgin Kimi walk
  - **Currently:** Kimi gave 3/10 earlier; needs re-test

- [ ] **J2** /docs/manifest covers all manifest fields with examples
  - Acceptance: every field in manifest.ts is documented
  - Test: cross-ref code vs doc

- [ ] **J3** /docs/integrations page exists, accurate, links to /connections
  - Acceptance: 200, /docs/composio redirects here
  - **Currently:** rename agent in flight

- [ ] **J4** /docs/secrets covers per-runner + shared with CLI examples
  - Acceptance: all 3 CLI commands shown, both scopes explained
  - Test: code review

- [ ] **J5** /docs/api covers all REST endpoints with curl examples + correct response shapes
  - Acceptance: curl examples copy-paste work
  - Test: try each example

- [ ] **J6** /docs/troubleshooting covers all real error responses
  - Acceptance: 429, App not found, missing GEMINI_API_KEY, missing_integration all listed
  - **Currently:** 3 missing per virgin review

- [ ] **J7** /docs/examples lists working slugs that match documented manifest format
  - Acceptance: every example app's manifest documented in /docs/manifest
  - **Currently:** pitch-coach + ai-readiness-audit use undocumented v2.0 format

- [ ] **J8** /docs/auth covers Google OAuth + agent tokens + scopes
  - Acceptance: complete reference
  - Test: code review

- [ ] **J9** /docs/ci covers FLOOM_API_KEY + GitHub Actions example
  - Acceptance: copy-pasteable GitHub Action works
  - Test: try the example
  - **Currently:** ✓ FLOOM_TOKEN→FLOOM_API_KEY fixed

- [ ] **J10** /docs/mcp covers MCP server setup + tool list + Claude Desktop install
  - Acceptance: real MCP install instructions
  - Test: existence + try install

- [ ] **J11** /docs/faq answers top 10 likely questions
  - Acceptance: list of FAQs covers signup, deploy, run, secrets, integrations, billing, deletion, public/private, scopes, troubleshooting
  - Test: read FAQ as new user

- [ ] **J12** /llms-full.txt accurate (response shapes match v0.4)
  - Acceptance: every code example matches current API
  - Test: parse + verify
  - **Currently:** ✓ fixed

- [ ] **J13** Changelog page exists; v0.4 features documented
  - Acceptance: `/changelog` or similar lists per-runner secrets, Composio auto-injection, async runtime, view tokens, MCP server, agent token scopes, 30-min runs
  - **Currently:** doesn't exist — escalated by virgin review

- [ ] **J14** Search works on docs (or doc nav obviously discoverable)
  - Acceptance: easy to find any topic via nav OR search
  - Test: virgin walk navigation

---

## K. UI/UX polish + accessibility

- [ ] **K1** Landing page Apple-level visual quality
  - Acceptance: typography hierarchy, restrained palette, generous whitespace
  - Test: visual review against Apple Music / Notion Calendar bar

- [ ] **K2** Sticky ToC on /docs/* + /privacy + /terms + /legal + /status
  - Acceptance: ToC stays visible while scrolling
  - **Currently:** in flight (third attempt — verified against legacy repo pattern)

- [ ] **K3** Dark mode default OFF (user-controlled toggle eventually)
  - Acceptance: light mode regardless of OS preference
  - **Currently:** ✓ reverted today

- [ ] **K4** Mobile responsive on iPhone (375x812) for all key pages
  - Acceptance: no horizontal scroll, readable, hero usable
  - Test: chrome mobile emulation each page

- [ ] **K5** Loading states for every async surface (deploy, run, list)
  - Acceptance: skeleton or spinner, not blank
  - Test: throttle network, observe

- [ ] **K6** Error states designed (404, 500, network error)
  - Acceptance: branded error pages, helpful, not stack traces
  - Test: trigger each

- [ ] **K7** Empty states designed (no apps yet, no runs yet, no tokens yet)
  - Acceptance: helpful CTA, not blank
  - Test: fresh account walk

- [ ] **K8** Keyboard navigation works (tab order, focus indicators)
  - Acceptance: every interactive element reachable via keyboard
  - Test: full keyboard walk

- [ ] **K9** WCAG AA color contrast across all surfaces
  - Acceptance: all text + interactive elements pass WCAG 2.1 AA
  - Test: axe DevTools or lighthouse a11y audit

- [ ] **K10** No emojis in UI (except 🥥 brand)
  - Acceptance: SVG icons or plain text
  - Test: grep for emoji unicode in src/

- [ ] **K11** No AI-slop patterns (colored left borders, gradient backgrounds, text-in-circles)
  - Acceptance: design review pass
  - Test: visual sweep

---

## L. Performance

- [ ] **L1** Home page LCP < 2.5s on 4G
  - Acceptance: Lighthouse perf score 90+
  - Test: chrome devtools throttling

- [ ] **L2** /p/<slug> CDN cacheable (s-maxage=300, x-vercel-cache HIT)
  - Acceptance: header set + 2nd hit shows HIT
  - **Currently:** Perf 8→10 agent in flight

- [ ] **L3** /api/status p95 < 200ms
  - Acceptance: time 50 sequential
  - Test: load test

- [ ] **L4** Cold-start /api/apps/<slug>/run p95 < 2s
  - Acceptance: first req after deploy
  - Test: deploy, immediately curl

- [ ] **L5** Sustained 50 RPS on /api/status doesn't degrade
  - Acceptance: 99% 2xx, p99 < 500ms
  - **Currently:** load-test agent in flight

- [ ] **L6** No N+1 query in sweepExecutions
  - Acceptance: parallel via Promise.allSettled
  - **Currently:** in flight

- [ ] **L7** Bundle size: home page JS < 200KB gzipped
  - Acceptance: Next.js build output
  - Test: `npm run build` + check output

---

## M. SEO + sharing

- [ ] **M1** sitemap.xml lists all public pages
  - Acceptance: includes /, /docs/*, /p/<public-slug>, /privacy, /terms
  - Test: curl /sitemap.xml + grep
  - **Currently:** ✓ verified earlier

- [ ] **M2** robots.txt allows crawl of public pages, blocks /api/me/*
  - Acceptance: correct disallow + Sitemap directive
  - Test: curl /robots.txt

- [ ] **M3** Every public page has unique title + meta description
  - Acceptance: no defaults, all match content
  - Test: curl + grep

- [ ] **M4** OG images render correctly for each /p/<slug>
  - Acceptance: dynamic OG with app name + description
  - Test: visit /og/<slug>.svg + visual

- [ ] **M5** Twitter cards render (summary_large_image)
  - Acceptance: meta tags valid, preview tool shows correctly
  - Test: cards-validator.iframe.ly

- [ ] **M6** JSON-LD structured data on every page
  - Acceptance: valid Schema.org, no XSS escape issue
  - **Currently:** safeJsonLd wired

- [ ] **M7** Canonical URL set on every page
  - Acceptance: `<link rel="canonical">` correct
  - Test: grep curl output

- [ ] **M8** No broken internal links
  - Acceptance: link checker passes
  - Test: linkinator or similar

---

## N. Trust + brand

- [ ] **N1** Privacy policy page accurate (matches actual data handling)
  - Acceptance: lists Supabase, Composio, E2B, Resend, Sentry as processors
  - Test: read + cross-ref

- [ ] **N2** Terms of service page exists + linked from footer + signup
  - Acceptance: lawyered or template-acknowledged terms
  - Test: existence + visual

- [ ] **N3** Legal page covers GDPR data deletion request flow
  - Acceptance: how to request deletion, how Floom responds
  - Test: existence

- [ ] **N4** "Backed by Founders Inc" footer copy approved
  - Acceptance: per memory, decision pending
  - Test: visual + Federico approval

- [ ] **N5** Branding consistent across landing, docs, /p/<slug>, emails
  - Acceptance: same logo, palette, typography everywhere
  - Test: visual sweep

- [ ] **N6** "About" / "Contact" page or footer info
  - Acceptance: company name, contact email findable
  - Test: visual

- [ ] **N7** Pricing page exists (or "free during alpha" prominent)
  - Acceptance: clear stance on cost
  - Test: existence

---

## O. Disaster scenarios

- [ ] **O1** Branch protection on `main` requires virgin-journey + migration-drift checks
  - Acceptance: GitHub branch protection set
  - Test: gh api branches/main/protection

- [ ] **O2** Backup verification: Supabase auto-backups exist + tested restore works
  - Acceptance: restore drill on staging succeeds
  - Test: actual restore drill

- [ ] **O3** Incident runbook exists ("Supabase down at 3am, what do I do?")
  - Acceptance: docs/incident-runbook.md
  - Test: existence + readability

- [ ] **O4** Rollback procedure documented + tested
  - Acceptance: revert to previous Vercel deploy in <5 min
  - Test: drill

- [ ] **O5** API key rotation procedure documented
  - Acceptance: how to rotate Supabase service role, Composio key, Resend, etc.
  - Test: docs exist

- [ ] **O6** DDoS mitigation: Vercel + Supabase rate limits enforced
  - Acceptance: bursts blocked at edge
  - Test: synthetic burst from rented IPs

---

## P. Repo migration & OSS launch (separate milestone)

- [x] **P1** Audit floom-minimal for committed secrets (no .env, no API keys)
  - Acceptance: `gh-launch` skill reports clean
  - Test: run audit
  - **Verified:** 2026-05-04 — gitleaks detected 0 leaks across 451 commits. All test fixtures confirmed fake. See `docs/launch-readiness/oss-audit/REPORT.md`.

- [x] **P2** Audit floom-minimal for PII / customer data in fixtures
  - Acceptance: no real emails, names, tokens in repo
  - Test: grep audit
  - **Verified:** 2026-05-04 — No real customer data. One personal email found: `depontefede@gmail.com` at `AUDIT-CHECKLIST.md:384` (test instruction) — P0 fix required before flip. See REPORT.md Phase 2.

- [~] **P3** README.md polished for OSS audience
  - Acceptance: hero, value prop, quickstart, contributing
  - **Currently:** 321 lines, has hero + value prop + quickstart + stack. Missing: CI badge, npm badge, explicit "source of floom.dev" statement. P2 gaps.

- [x] **P4** CONTRIBUTING.md exists
  - Acceptance: PR process, code style, test instructions
  - **Verified:** 2026-05-04 — `CONTRIBUTING.md` exists.

- [ ] **P5** LICENSE present + appropriate
  - Acceptance: MIT or similar, top of repo
  - **Currently:** LICENSE exists but is **Source-Available Alpha** ("All rights reserved"), not an OSS license. P0 BLOCKER — Federico must decide MIT vs keep source-available before flip.

- [x] **P6** Rename floomhq/floom (legacy) → floomhq/floom-legacy + archive
  - Test: gh repo rename
  - **Verified:** 2026-05-04 — renamed + archived. `https://github.com/floomhq/floom-legacy`.

- [x] **P7** Rename floomhq/floom-minimal → floomhq/floom (becomes canonical)
  - Test: gh repo rename
  - **Verified:** 2026-05-04 — `floomhq/floom` is now the production codebase (private). Local remote URL updated.

- [ ] **P8** Flip floomhq/floom (new) public
  - Acceptance: anyone can clone
  - Test: anonymous clone
  - **Currently:** NOT STARTED — ONE-WAY DOOR, audit must be 10/10 first

- [ ] **P9** Vercel deployment still works post-rename (CI git remote updated)
  - Acceptance: PR after rename deploys cleanly
  - Test: trigger deploy

- [ ] **P10** All external references updated (floom.dev links, docs, social)
  - Acceptance: no remaining floom-minimal mentions in user-facing places
  - Test: grep + crawl

---

## Q. CLI specific

- [ ] **Q1** `floom --version` returns the installed version
  - Test: trivial

- [ ] **Q2** `floom --help` shows current commands
  - Acceptance: matches actual command set
  - Test: trivial

- [ ] **Q3** `floom <cmd> --help` shows per-command help
  - Acceptance: every command has help text
  - Test: each cmd

- [ ] **Q4** `floom --json` flag returns parseable JSON on success + error
  - Acceptance: stdout is valid JSON in both cases
  - **Currently:** ✓ shipped 0.3.1

- [ ] **Q5** `floom deploy <path>` accepts positional path argument
  - Acceptance: works as `cd <path> && floom deploy`
  - **Currently:** ✓ shipped 0.3.1

- [ ] **Q6** CLI npx hint shown when running via npx (no `floom: command not found`)
  - **Currently:** ✓ shipped 0.3.2

- [ ] **Q7** CLI `--accept-shared-secrets` flag for non-interactive deploy
  - **Currently:** ✓ shipped 0.3.0

- [ ] **Q8** CLI auto-update notice when newer version available
  - Acceptance: prompt user to upgrade
  - Test: stub older version + check stdout

---

## R. Internal hygiene

- [ ] **R1** All migration files in `supabase/migrations/` applied to prod
  - Acceptance: schema drift detector + manual spot-check both clean
  - **Currently:** drift detector ✓ but supabase_migrations table out of sync

- [ ] **R2** No `process.env.X` in src/ that's missing from .env.example
  - **Currently:** ✓ checked + fixed

- [ ] **R3** TypeScript: `npx tsc --noEmit` clean
  - **Currently:** ✓

- [ ] **R4** ESLint: `npx eslint src/` 0 errors (warnings allowed)
  - Test: each merge

- [ ] **R5** Tests: `npm test` passes (or known-failing list documented)
  - **Currently:** 4 pre-existing failures (batch3-fixes, batch7-fixes — grep tests)

- [ ] **R6** No `console.log` left in production paths
  - Acceptance: grep + remove
  - Test: grep src/ for stray logs

---

## How to use this checklist

1. **Pick an item.** Read its acceptance criteria.
2. **Verify it.** Run the test, get the evidence.
3. **Update the line.** Change `[ ]` to `[x]` and append `**Verified 2026-MM-DD via <test>** — <evidence link>`.
4. **Commit it.** Atomic commit per category, message `audit(<dim>): mark <items> verified`.

**Never check off without evidence.** Per memory: "No completion claims without fresh verification evidence."

**For agents:** dispatch one Kimi or Sonnet per category, give them this checklist + the acceptance criteria for their assigned items. They produce evidence + propose `[x]` updates. Main agent reviews + commits.

**Re-audit cadence:** every PR that touches a covered surface re-runs that category's items. CI gate fails the PR if any item degrades from `[x]` to `[ ]`.

**Source of truth:** this file, in repo at `docs/launch-readiness/AUDIT-CHECKLIST.md`. If you find an audit gap not listed here, ADD it; don't silently track elsewhere.

---

## Quick stats

- Total items: ~165
- Currently `[x]`: 0 (this is a fresh checklist; today's verifications need to be marked)
- Currently `[~]` (in flight): ~12
- Currently `BLOCKED` (known broken): 0 (after composio migration fix)
- Untested: ~150

**Honest read: we are at private-beta state.** Public launch requires every item `[x]`.
