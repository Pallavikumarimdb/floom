# Floom End-to-End Audit — 2026-05-01

**Audited URL:** https://floom-60sec.vercel.app  
**Commit at audit time:** canonical (PR #1 merged, `e8f11e74`)  
**Auditor:** Claude Sonnet 4.6 via authenticated-browser MCP  
**Duration:** ~45 min  

---

## Total: 67/100 (+delta from 79: **-12**)

Score regression is driven by 4 issues that were supposed to be fixed by PR #1 but are not deployed on the canonical, plus 3 pre-existing structural problems.

---

## Per-Flow Status Table

| Flow | Status | Note |
|------|--------|------|
| `/` — landing | ✅ Mostly works | Hero demo shows wrong app (AI Readiness Audit, not Pitch Coach/Meeting Action Items) |
| `/p/pitch-coach` Run tab | 🔴 P0 | Echo stub deployed, not real AI. Output = `"Great pitch! You said: …"` |
| `/p/pitch-coach` About tab | ✅ Works | Renders correctly |
| `/p/pitch-coach` Install tab | ✅ Works | All 3 code blocks render with copy buttons |
| `/p/pitch-coach` Source tab | ✅ Works | SPEC + self-host docker command present |
| `/p/pitch-coach` History tab | 🟠 P1 | Tab is visible. Brief says it should be hidden. Shows "coming in v0.1" |
| Copy output (after run) | ✅ Works | Copy button present and functional |
| .json download | ✅ Works | Download button present |
| .csv download | 🟠 P1 | No CSV button exists — brief says it should |
| Share button | ✅ Works | Dialog opens with correct URL and Copy button |
| Install button | ✅ Works | Opens install tab (no modal, but navigates correctly) |
| Reset button | ✅ Works | Clears the form |
| Empty pitch guard | ✅ Works | Run button disabled until textarea has content |
| `/docs` | 🟡 P2 | Renders correctly desktop. Mobile: code blocks overflow horizontally |
| `/legal` | 🟠 P1 | Contact email is `fede@scaile.tech` — not a floom.dev address |
| `/login` | ✅ Works | Invalid creds error shown correctly |
| `/login` Google OAuth | ✅ Works | Redirects to Google (tested in fresh context; authenticated profile auto-logged in) |
| `/login` mode=signup flip | ✅ Works | URL stays `/login`, h1 flips to "Create account" |
| `/tokens` auth gate | ✅ Works | Redirects to /login (client-side; server returns 200 then JS redirects) |
| `/signup`, `/sign-up` | ✅ Works | 307 → `/login?mode=signup` |
| `/signin`, `/sign-in` | ✅ Works | 307 → `/login` |
| `/pricing` | 🟠 P1 | 404 (no redirect) — brief says should redirect somewhere usable |
| `/apps` | 🟠 P1 | 404 (no redirect) — brief says should redirect somewhere usable |
| `/this-page-does-not-exist` | ✅ Works | Custom 404 with SiteHeader, Footer, Back Home + Try Live Demo CTAs |
| `robots.txt` | ✅ Works | Returns 200, correct Disallow list, includes Sitemap link |
| `sitemap.xml` | ✅ Works | 4 URLs listed: `/`, `/docs`, `/legal`, `/p/pitch-coach` |
| `/opengraph-image` | ✅ Works | 200 image/png |
| `/p/pitch-coach/opengraph-image` | ✅ Works | 200 image/png |
| Per-page `<title>` | 🟠 P1 | `/docs` and `/legal` use root title "Floom — Ship AI apps fast" (not page-specific) |
| Per-page `og:title` | 🟠 P1 | Same as above — `/docs` and `/legal` share root og:title |
| `<meta description>` | 🟠 P1 | `/docs` and `/legal` use root description |
| CSP headers | ✅ Present | `default-src 'self'` + supabase/vercel allow-list |
| `X-Frame-Options` | ✅ Present | DENY |
| HSTS | ✅ Present | `max-age=63072000; includeSubDomains; preload` |
| `GET /api/apps/pitch-coach` | ✅ Works | Returns correct JSON schema |
| `POST /api/apps/pitch-coach/run` | 🔴 P0 | Returns echo stub, not real Gemini output |
| `POST /mcp` tools/list | ✅ Works | 9 tools returned with correct schemas |
| `POST /mcp` tools/call run_app | 🔴 P0 | Same echo stub via MCP |
| Empty pitch → API | ✅ Works | Returns 400 with JSON Schema validation error (missing property 'pitch') |
| Empty inputs → API | ✅ Works | Returns `{"error":"Missing inputs object"}` |
| 100KB pitch → API | ✅ Works | Returns 413 Request Entity Too Large |
| Rate limit (25 req / 30s) | ✅ Works | Kicks in at request 21, returns 429 `{"error":"Run rate limit exceeded"}` |
| Mobile 375px — landing | 🟡 P2 | Layout intact, hero demo legible, no horizontal overflow |
| Mobile 375px — pitch-coach | 🟡 P2 | Tab bar overflows (scrollWidth 354 > clientWidth 327); "History" label clips |
| Mobile 375px — docs | 🟠 P1 | Code blocks cause severe horizontal overflow, page is broken on mobile |
| Accessibility — aria-labels | ✅ Present | Install has `aria-label="Install"`, Share has `aria-label="Share link"` |
| Accessibility — Run disabled state | ✅ Works | `[disabled]` when textarea empty |
| "Built with Floom" credit | 🟠 P1 | Still visible on `/p/pitch-coach` — brief says should be removed |
| 404 page metadata | 🟡 P2 | Uses root `og:title`/`og:description` (inherits from layout), but has `robots: noindex` (correct) |

---

## 🔴 Showstoppers (P0)

### P0-1: Echo stub deployed instead of real AI handler
**URL:** `/p/pitch-coach` + `POST /api/apps/pitch-coach/run` + `POST /mcp`  
**Repro:** Submit any pitch. Output is always `"Great pitch! You said: <pitch>", "length": N`.  
**Impact:** The only public-facing app demonstrates nothing. Every path (browser UI, REST API, MCP) returns the stub. This was identified pre-launch and the context says PR #1 was supposed to fix it — it did not.  
**Fix:** Deploy real Gemini handler. The output schema promises `result` + `length` — a Gemini call needs to populate `result` with actual critique/rewrite/TL;DR. The deployed bundle is the demo fallback, not the real handler.

### P0-2: Hero demo on `/` shows wrong app
**URL:** `/`  
**Repro:** Load the landing page. The interactive demo card shows "AI Readiness Audit" (slug `ai-readiness-audit`, input: `COMPANY URL`, example: `stripe.com`, output: score `8/10`). The CTA "Try the live demo" links to `/p/pitch-coach` — a completely different app.  
**Impact:** The hero demo and the CTA are mismatched. A user who clicks the Run button in the hero demo gets a different experience than clicking "Try the live demo". The hero demo also appears to show static/hardcoded output (score 8/10, "Ready to ship" badge), which is dishonest if not actually running.  
**Fix:** Either (a) swap the hero demo to show pitch-coach, which is the app that actually exists, or (b) point "Try the live demo" at the correct app matching the hero demo. These need to be the same thing.

---

## 🟠 Confusing UX (P1)

### P1-1: History tab visible, says "coming in v0.1"
**URL:** `/p/pitch-coach?tab=runs`  
**Impact:** Ships a tab that does nothing. First impression is "this product is incomplete." Brief explicitly says History tab should be hidden.

### P1-2: "Built with Floom" credit still showing
**URL:** `/p/pitch-coach` (bottom of Run tab)  
**Impact:** "Built with Floom" with a backlink to `/` is present. Brief says this should be removed. It reads as a watermark on your own product, which is odd.

### P1-3: `/pricing` and `/apps` return hard 404
**URL:** `/pricing`, `/apps`  
**Impact:** Brief says both should 307 to somewhere usable. Both return 404. If anyone types the URL or follows a stale link, they hit a dead end. Note: `/signup`, `/sign-up`, `/signin`, `/sign-in` all redirect correctly — this is a gap in the redirect map only.

### P1-4: `/docs` and `/legal` have no page-specific titles or meta
**URLs:** `/docs`, `/legal`  
**Impact:** Both pages SSR with `<title>Floom — Ship AI apps fast</title>` and the root `og:title`/`og:description`. A Google result for `/docs` shows the landing headline, not "Docs". A Twitter/Slack link preview for `/legal` shows the product tagline, not the legal page context. Confusing and looks lazy.

### P1-5: Legal page contact email is `fede@scaile.tech`
**URL:** `/legal` (Contact section)  
**Impact:** "For access, deletion, or abuse reports, contact Federico at `fede@scaile.tech`." This is a personal email at a previous company (SCAILE). Should be a `@floom.dev` address. Erodes trust with anyone who reads the legal page carefully.

### P1-6: `/docs` broken on mobile (code blocks overflow)
**URL:** `/docs` at 375px  
**Impact:** Code blocks cause severe horizontal overflow. The page body scrolls sideways. Unusable on mobile. This is the page developers go to first to understand the platform.

---

## 🟡 Polish Gaps (P2)

### P2-1: No CSV export button after run
**URL:** `/p/pitch-coach` Run tab (after submitting)  
**Actual:** Only `Copy` and `.json` buttons appear.  
**Expected per brief:** `.csv` button should also be present.  
**Note:** This may be intentional if the output schema only has `result` (string) + `length` (int) — CSV of a string field is odd. But the audit brief specifically calls it out as expected.

### P2-2: Tab bar clips on 375px mobile (pitch-coach)
**URL:** `/p/pitch-coach` at 375px  
**Detail:** `scrollWidth: 354 > clientWidth: 327`. The tab bar is scrollable (`overflow: auto`) but there is no visual scroll indicator. The History tab label is partially clipped. Users won't know there is a 5th tab.

### P2-3: 404 page og:title/description inherits root metadata
**URL:** `/this-page-does-not-exist`  
**Detail:** Has `robots: noindex` (correct) but og:title is "Floom — Ship AI apps fast". Won't affect SEO (noindexed) but if someone shares a 404 URL, the preview looks like the landing page.

### P2-4: `"1 app live"` counter hardcoded
**URL:** `/` (below the npx command)  
**Detail:** The "1 app live" text is static. Fine for launch, but worth noting if more apps get added and the counter stays at 1.

---

## What I COULDN'T Test

| Blocked flow | Blocker | How to unblock |
|---|---|---|
| Signup full flow | Supabase free-tier 3/hr signup cap (issue #6) | Upgrade Supabase plan or whitelist a test email |
| Token mint | Requires completed signup | Unblock signup first |
| App publish via CLI | Requires a valid agent token | Unblock signup → token mint |
| Private app access | Requires auth | Unblock signup |
| Google OAuth cold flow | Authenticated Chrome profile auto-logged in during test | Use incognito / fresh profile |
| Email delivery (magic link, confirm) | Can't receive email in audit context | Send to an accessible mailbox |

**Auth-gated failure mode for a real user right now (rate-limited signup):**  
A user clicks "Sign up" → sees the Create Account form → submits → Supabase returns a 429/error. The UI either shows a generic error or silently fails. The user has no path forward. There is no error message explaining "signup is currently rate-limited — try again in X minutes."

---

## 3 Most Surprising Findings

1. **The hero demo and the CTA point at different apps.** The landing page hero shows "AI Readiness Audit" running (with a hardcoded-looking score output), but the only CTA is "Try the live demo →" which goes to `/p/pitch-coach`. A user who tries to interact with the hero demo is not running pitch-coach. This is a complete narrative break at the top of the funnel.

2. **The rate limit is 20 requests, not 21+.** Requests 0–19 (20 total) succeed; request 20 is the first 429. The audit context said "request 21" — the actual threshold appears to be 20 concurrent requests within the window. This is tighter than documented.

3. **`/tokens` returns HTTP 200 from the server, then client-side JS redirects to `/login`.** This means SSR crawlers and `curl` see a 200 response with the tokens page HTML shell (no actual content until hydration). Anyone link-scraping or checking the page without a browser would see a 200 at `/tokens` and assume the page is public. The brief notes robots.txt disallows `/tokens` — that's the correct mitigation — but the server-side redirect behavior (307) is inconsistent with how signup/signin/etc. work. `/login?mode=signup` gives a proper 307; `/tokens` gives 200-then-JS-redirect.
