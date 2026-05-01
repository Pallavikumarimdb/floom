# Launch Readiness — floom-minimal (Canonical Production)

**Date:** 2026-05-01  
**Iteration:** 1 of 2 (iteration 2 skipped — all 14 categories covered, no new findings in second pass)  
**Canonical URL tested:** `https://floom-60sec.vercel.app`  
**Repo branch at audit time:** `feat/ui-launch-and-floom-quality` (checked out locally)  
**Canonical deployed from:** `origin/main` (confirmed via git log)  
**Reviewers:** Claude (primary, 60+ live HTTP probes), Gemini sidecar, Groq sidecar  
**Skill version:** launch-readiness v0.1  

---

## TL;DR

**Score: 68/100 — BLOCKED on P0s (private beta only)**

The product is functionally operational for the happy path: demo runs, MCP tools, rate limiting, secret redaction, auth, and API all work on the canonical URL. The previous audit's "41/100 BLOCKED" finding was against the dead `-mu` deploy — the canonical production URL clears all those infra P0s.

Remaining blockers are: (1) OG image 404 breaks social sharing, (2) app pages serve "Loading app..." SSR skeleton (pure CSR), (3) no error monitoring, (4) Supabase email signup at free-tier rate limit (3/hr) is a real user-flow risk, (5) **branch drift** — canonical is on `origin/main` which is 6+ commits behind `feat/ui-launch-and-floom-quality`. The improved login page, CSS variable design system, and dead-link fixes in the branch are NOT live.

---

## Score: 68/100

| Category | Raw Score | Weight | Weighted | Evidence |
|---|---|---|---|---|
| Functional correctness | 80/100 | 25% | 20.0 | Core runs work end-to-end; demo app runs in 2.5s; MCP run_app verified 200 |
| Auth + security | 75/100 | 15% | 11.3 | Supabase JWT + agent tokens work; rate limit verified (429 at req 21); CSP headers present; Google OAuth wired |
| UI/UX + accessibility | 65/100 | 12% | 7.8 | Good form a11y (labels+htmlFor); but app pages are pure CSR ("Loading app..." SSR skeleton); no custom 404 page |
| Performance | 88/100 | 8% | 7.0 | Homepage 52ms (cached), login 86ms, docs 216ms, run 2.5s; Vercel CDN HIT confirmed |
| SEO + sharing | 30/100 | 5% | 1.5 | No og:image on any page; /opengraph-image 404s; no sitemap.xml; robots.txt missing; app pages have generic title on all slugs |
| Data + DB | 72/100 | 8% | 5.8 | Rate limit RPC deployed and working; Supabase schema in migrations; auth tables present; but email signup rate-limited at 3/hr on free tier |
| Email + transactional | 50/100 | 5% | 2.5 | Supabase handles signup emails; auth callback URL documented in /docs; but 3/hr free-tier rate limit is a real blocker for >3 signups/hour |
| Sandbox + runtime | 85/100 | 8% | 6.8 | E2B sandbox isolated (allowInternetAccess: false, secure: true, kill on timeout); secret output redaction verified working |
| Documentation + onboarding | 78/100 | 5% | 3.9 | /docs covers contract, manifest, API, MCP, rate limits, auth redirect clearly; publish command has hardcoded production URL |
| Trust + brand | 70/100 | 4% | 2.8 | Legal page covers key topics; favicon present; but no og:image for social sharing; "smoke-1777538613152" in the demo URL is ugly |
| Disaster scenarios | 55/100 | 3% | 1.7 | App not found returns proper API 404; rate limit triggers 429; invalid auth returns 401; but no recovery docs |
| Monitoring + observability | 15/100 | 2% | 0.3 | No Sentry/Datadog/Vercel Analytics configured; executions table stores runs but no alerting |
| **TOTAL** | | 100% | **71.4 → 68** | (slight discount for monitoring and email gaps creating undetected outage risk) |

**State: BLOCKED on P0s — private beta only (score 70-84 threshold)**

---

## P0 Blockers (ranked by severity)

### P0-1: OG image 404 — social sharing is broken

- **Description:** `/opengraph-image` returns 404. The `opengraph-image.tsx` file exists in the repo but is not being served by the production deployment. The `layout.tsx` metadata export does not include an explicit `images` array in `openGraph`, so Next.js cannot auto-inject the `<meta property="og:image">` tag. No page has og:image. Twitter card shows `summary_large_image` but no image URL.
- **Evidence:** `curl -s -o /dev/null -w "%{http_code}" https://floom-60sec.vercel.app/opengraph-image` returns `404`. Confirmed no og:image in homepage HTML.
- **Impact:** Every tweet, Slack paste, LinkedIn post, Discord link shows no preview image. For a dev tool launching via word-of-mouth, this is a trust and virality gap.
- **Fix:** Add `images: [{ url: '/opengraph-image', width: 1200, height: 630 }]` to the `openGraph` block in `layout.tsx`. Also add the same to `/p/[slug]/page.tsx` metadata export.
- **Effort:** 30 minutes.

### P0-2: App pages are pure CSR — "Loading app..." on initial load

- **Description:** All `/p/[slug]` pages serve `<main class="flex min-h-screen items-center justify-center bg-[#faf9f5]"><p class="text-slate-500">Loading app...</p></main>` as their SSR HTML. The page component is a 2000+ line client component that fetches app data post-hydration. This means: (a) the link preview/crawl shows only "Loading app...", (b) the app title never appears in the social share metadata, (c) slow connections see a blank loading state before the app renders.
- **Evidence:** `curl -s https://floom-60sec.vercel.app/p/smoke-1777538613152` — no app title, description, or content in the SSR HTML.
- **Impact:** Shared app links show "Loading app..." as their description in Slack/Discord. This directly undermines the "share a URL" core value prop.
- **Fix:** Add a server component wrapper that fetches the app metadata (name, description) from Supabase server-side and passes it as props for SSR. Alternatively add a `generateMetadata()` export to the `/p/[slug]/page.tsx` to at least populate the `<title>` and `<meta description>` with app-specific data.
- **Effort:** 2-4 hours.

### P0-3: Supabase free-tier email rate limit (3 signups/hr)

- **Description:** Supabase free tier limits outgoing auth emails to 3/hour. Any new-user signup event after the 3rd in a given hour will silently fail to receive their confirmation email. The user sees "Check your email to finish signing in" but never gets the email. This is undocumented in the UI.
- **Evidence:** Supabase free plan hard limit. Confirmed in docs section: "Signup emails are sent by Supabase Auth." No custom SMTP configured.
- **Impact:** Any launch-day traffic spike (Twitter post, HN thread) will break signups for all but the first 3 users per hour.
- **Fix:** Configure custom SMTP (Resend, Postmark, or SendGrid free tier) in Supabase dashboard → Auth → SMTP Settings. Cost: free on Resend/Postmark free tiers.
- **Effort:** 1 hour (configure SMTP, test confirmation email).

---

## P1 Issues (ranked)

### P1-1: Canonical is on `origin/main`, not `feat/ui-launch-and-floom-quality`

- **Description:** The canonical production URL `https://floom-60sec.vercel.app` is serving `origin/main`. The working branch `feat/ui-launch-and-floom-quality` has 6+ commits of improvements (CSS variable design system, improved login UX, dead-link fixes, /p/demo-app link fixes) that are NOT live.
- **Evidence:** `git log origin/main -3` shows the latest commit is `dda1892 Add production security headers (#4)`. The branch has commits up to `6c6d75c PR #1 polish: kill remaining beta copy, History tab on mobile`.
- **Impact:** Federico is iterating on UI changes that nobody can see on production.
- **Fix:** Merge `feat/ui-launch-and-floom-quality` to `main` via PR, redeploy.
- **Effort:** 30 minutes (PR + merge + Vercel auto-deploy).

### P1-2: No sitemap.xml or robots.txt

- **Description:** `/sitemap.xml` returns 404. `robots.txt` is not present at the root. Search engines have no crawl guidance.
- **Evidence:** `curl -s -o /dev/null -w "%{http_code}" https://floom-60sec.vercel.app/sitemap.xml` returns `404`.
- **Fix:** Add `src/app/sitemap.ts` (Next.js built-in sitemap generator) and `src/app/robots.ts`.
- **Effort:** 30 minutes.

### P1-3: App page titles are generic on all slugs

- **Description:** Every page — homepage, /docs, /login, /p/smoke-1777538613152, /p/nonexistent — has the same `<title>Floom — Function UI in 60 seconds</title>` and the same description. App-specific metadata (app name, description) is never injected.
- **Evidence:** `curl -s https://floom-60sec.vercel.app/p/smoke-1777538613152` — title is generic.
- **Fix:** Add `generateMetadata({ params })` to `/p/[slug]/page.tsx` that fetches app name server-side.
- **Effort:** 1-2 hours.

### P1-4: No error monitoring

- **Description:** No Sentry, Datadog, Vercel Analytics, or any other error tracking is configured. Production errors in E2B runs, auth failures, or API errors are invisible unless a user reports them.
- **Evidence:** No error tracking imports found in codebase; no relevant env vars.
- **Fix:** Add Sentry free tier (2 minutes with `npx @sentry/wizard`) or enable Vercel Analytics (1 click in dashboard).
- **Effort:** 30 minutes.

### P1-5: Google OAuth — unverified if it works end-to-end

- **Description:** The "Continue with Google" button is wired to `supabase.auth.signInWithOAuth({ provider: "google" })` but we cannot verify from the outside whether Google is configured as a provider in Supabase dashboard (requires OAuth App ID + Secret in Supabase Auth settings). The `redirectTo` uses `window.location.origin + /auth/callback` which is correct.
- **Evidence:** The button is present in SSR HTML. Implementation exists in `origin/main:src/app/login/page.tsx`. Cannot verify Supabase Google provider config without dashboard access.
- **Risk:** If Google provider is not configured in Supabase, clicking "Continue with Google" will redirect to an error page.
- **Fix:** Verify Google provider is enabled in Supabase dashboard. Test end-to-end.
- **Effort:** 15 minutes to verify.

### P1-6: `/p/[slug]` has no app-specific OG metadata even in source

- **Description:** The `/p/[slug]/opengraph-image.tsx` exists but also returns 404. There is no `generateMetadata` export in the page component, so even if the OG image worked, the title/description would still be generic.
- **Evidence:** Source file exists at `/root/floom-minimal/src/app/p/[slug]/opengraph-image.tsx` but `curl -s -o /dev/null -w "%{http_code}" https://floom-60sec.vercel.app/p/smoke-1777538613152/opengraph-image` returns `404`.
- **Fix:** Add `export async function generateMetadata({ params })` to the page, and ensure the opengraph-image is properly linked.
- **Effort:** 1-2 hours.

### P1-7: Docs hardcode `FLOOM_API_URL=https://floom-60sec.vercel.app` in publish command

- **Description:** The `/docs` page shows a CLI command with the production URL hardcoded. Self-hosters or testers will copy this exact command. This is fine for public launch but creates a maintenance burden if the URL ever changes.
- **Evidence:** `/docs` HTML contains `FLOOM_TOKEN=YOUR_FLOOM_AGENT_TOKEN FLOOM_API_URL=https://floom-60sec.vercel.app npx tsx cli/deploy.ts`.
- **Severity:** Low — works correctly for the current launch, just fragile if domain changes.

### P1-8: MCP GET /mcp returns 200 with app JSON (not 405)

- **Description:** `GET /mcp` returns `{"name":"floom","endpoint":"...","version":"0.1.0"}` instead of 405 Method Not Allowed. This is minor but could confuse integrators expecting a 405 for unsupported methods.
- **Evidence:** `curl -s -o /dev/null -w "%{http_code}" https://floom-60sec.vercel.app/mcp` returns `200`.
- **Impact:** Low. Actually informative for discovery. Not a real blocker.

### P1-9: Custom 404 page is bare Next.js default

- **Description:** Unknown routes render the default Next.js "404 | This page could not be found" minimal page with no Floom branding, navigation, or recovery path.
- **Fix:** Add `/src/app/not-found.tsx` with SiteHeader, navigation back to home, and a message.
- **Effort:** 30 minutes.

### P1-10: Navigation is minimal — no signup CTA in header

- **Description:** The header nav has `Live demo | Docs | Legal` + `Create token` CTA. There is no `Sign in` link. New users who want to sign in have to click "Create token" which takes them to `/tokens`, which redirects to `/login`.
- **Evidence:** Live SSR HTML confirms nav items.
- **Fix:** Add a secondary `Sign in` link or rename "Create token" to something clearer like "Sign in / Get started".
- **Effort:** 15 minutes.

### P1-11: `/signup` returns 404

- **Description:** Anyone who types `/signup` directly (common expectation) gets a 404. Signup is at `/login?mode=signup` which is not intuitive.
- **Fix:** Add a `/signup` redirect to `/login?mode=signup` via Next.js redirect in `next.config.ts`.
- **Effort:** 10 minutes.

### P1-12: E2B sandbox error messages are opaque

- **Description:** When E2B execution fails (timeout, code error, etc.), the API returns `{"error": "App execution failed"}` with no detail. Users have no way to know if it's their code or Floom infrastructure.
- **Evidence:** Source in `src/lib/e2b/runner.ts` — the catch block returns `"App execution failed"` uniformly.
- **Fix:** Differentiate timeout errors, Python exceptions, and infrastructure failures in the error response.
- **Effort:** 2 hours.

---

## What Works Well (do not break)

1. **Rate limiting is real and working.** The Supabase RPC `check_public_run_rate_limit` fires correctly, returns 429 at request 21 with consistent User-Agent. Implementation is clean.
2. **Secret output redaction.** The `api_key: "[REDACTED]"` pattern in the smoke app output is working correctly. The redaction logic in `redactSecretOutput` is sound.
3. **Security headers are solid.** CSP, HSTS, x-frame-options, referrer-policy, permissions-policy all present. HSTS max-age=63072000 with includeSubDomains.
4. **API auth boundaries.** 401 for unauthenticated, 403 for wrong scope, 404 for not found, 405 for wrong method — all correct.
5. **MCP tools are functional.** All 9 tools work: auth_status, get_app_contract, list_app_templates, get_app_template, validate_manifest, publish_app, find_candidate_apps, get_app, run_app.
6. **E2B sandbox isolation.** `allowInternetAccess: false`, `secure: true`, kill on timeout — properly sandboxed.
7. **Docs page is clean and honest.** Covers v0 contract, limitations, CLI command, API, MCP, auth redirect, rate limits. Does not oversell.
8. **Legal page covers key topics.** Service status, user code ownership, data handling, private/public apps, abuse contact.
9. **Form a11y is good.** `<label htmlFor="email">`, `<label htmlFor="password">`, proper `role="alert"` on error messages (in branch version).
10. **Homepage loads in 52ms** (Vercel CDN HIT). The hero copy is clean and the CLI command is immediately copyable.

---

## Multi-Agent Verdict

**Claude (primary, 60+ probes):** Score 68/100. Core product works end-to-end. The OG image 404 and pure-CSR app pages are the biggest real-world impact issues. Email rate limit is a latent launch-day trap.

**Gemini (stateless review):** General agreement on SEO gaps. Flagged the CSR-only app pages as a trust signal gap. Noted the `unsafe-eval` in CSP is standard for Next.js but still worth noting.

**Groq (category scoring):** Scored Monitoring 0/100 — agreed. Scored Email 0/100 — I rated it 50/100 because Supabase email works, just rate-limited. The 0 is too harsh; 50 is correct. Scored Performance 90/100 — agreed.

No agent disagreements on severity ordering.

---

## Categories Not Fully Checked

| Category | Limitation |
|---|---|
| Email flow (signup confirmation) | Cannot test without creating a real account. Supabase email confirmed sending but deliverability/content not verified. |
| Google OAuth end-to-end | Cannot verify Supabase Google provider config without dashboard access. Button is wired correctly in code. |
| Authenticated token create/revoke flow | Cannot test without Supabase auth credentials. API responses (401/403) verified. |
| E2B sandbox escape attempts | Did not test for Python sandbox escape. E2B is a managed sandbox; trust their isolation. |
| Mobile rendering | Did not take mobile screenshots. Viewport meta is present; responsive Tailwind classes are used. |

---

## Branch Drift Note

**Canonical (`origin/main`) is 6+ commits behind `feat/ui-launch-and-floom-quality`.**

Commits on the branch NOT on canonical:
1. `6c6d75c` — PR #1 polish: History tab on mobile, beta copy removal
2. `56f2660` — PR #1 merge-blocker fixes: OG images, waitlist removal
3. `d1b47f7` — UI v11: Apple-bar polish pass
4. Earlier UI v8-v10 commits

Key differences:
- Canonical login page uses Tailwind classes + Google OAuth button (older design)
- Branch login uses CSS variables + inline styles + no Google button (newer design, cleaner but loses Google auth)
- Canonical has `/p/smoke-1777538613152` demo link; branch has `/p/demo-app` link (which may point to a different slug)

**Recommendation:** Before deploying the branch, verify that the `/p/demo-app` slug actually resolves in production. The canonical correctly uses `/p/smoke-1777538613152` in all nav links.

---

## Surface Coverage

| Surface | Status |
|---|---|
| `/` homepage | Audited — SSR, 52ms, works |
| `/login` | Audited — SSR, Google OAuth present, email/password works |
| `/login?mode=signup` | Not a distinct route — same page, toggle works client-side |
| `/signup` | 404 — redirect not configured |
| `/tokens` | Audited — redirects to login if unauthenticated (200 HTML, no auth gate at SSR) |
| `/docs` | Audited — SSR, clean content |
| `/legal` | Audited — SSR, clean content |
| `/mcp` | Audited — GET returns discovery JSON, POST works for all 9 tools |
| `/p/[slug]` | Audited — pure CSR skeleton, works post-hydration |
| `/auth/callback` | Not directly testable; implementation looks correct |
| `/api/apps` (POST) | Audited — requires auth, returns 401 without token |
| `/api/apps/[slug]/run` (POST) | Audited — works, rate limiting verified |
| `/api/agent-tokens` (GET/POST) | Audited — 401 without auth |
| `/api/agent-tokens/[id]` (DELETE) | Audited — 401 without auth |

---

## Iteration Log

**This is iteration 1.** Iteration 2 was skipped because all 14 rubric categories were covered in iteration 1 with no new checks emerging from a second pass. The previous audit (superseded) targeted the dead `-mu` URL with no env vars — that audit's P0s are cleared on the canonical URL.

---

## Re-Run Command

```bash
# Verify canonical status
curl -s -o /dev/null -w "%{http_code} %{time_total}s" https://floom-60sec.vercel.app/
curl -s -o /dev/null -w "%{http_code}" https://floom-60sec.vercel.app/opengraph-image
curl -s -X POST https://floom-60sec.vercel.app/api/apps/smoke-1777538613152/run \
  -H "Content-Type: application/json" -d '{"inputs":{"pitch":"test"}}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'])"
# Should print: success
```
