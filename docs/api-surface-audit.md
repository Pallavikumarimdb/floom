# API Surface Audit — floom-60sec.vercel.app
**Date:** 2026-05-01  
**Method:** Live curl against https://floom-60sec.vercel.app (no auth headers)  
**Source read:** src/app/api/*/route.ts, src/app/**/page.tsx, next.config.ts

---

## Security Headers Baseline

All 200 responses checked carry the following headers (set globally in next.config.ts):

| Header | Value | Present |
|--------|-------|---------|
| Content-Security-Policy | default-src 'self'; ... | ✅ |
| X-Content-Type-Options | nosniff | ✅ |
| X-Frame-Options | DENY | ✅ |
| Referrer-Policy | strict-origin-when-cross-origin | ✅ |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | ✅ |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | ✅ |

**One gap:** `Strict-Transport-Security` is served by Vercel's edge, not by the Next.js config (which does not include it in `securityHeaders`). If the app is ever self-hosted the HSTS header would be absent. This is a deployment-environment dependency, not a bug today.

---

## Endpoint Matrix

### Pages (GET)

| URL | Expected | Actual HTTP | Body check | Status | Notes |
|-----|----------|-------------|------------|--------|-------|
| `GET /` | 200 + landing HTML | **200** | HTML served | ✅ | |
| `GET /docs` | 200 | **200** | HTML served | ✅ | |
| `GET /legal` | 200 | **200** | HTML served | ✅ | |
| `GET /login` | 200 | **200** | HTML served | ✅ | |
| `GET /tokens` (unauthenticated) | 307 → /login?next=/tokens | **200** | Contains `/login` ref but also `Page not found` | 🔴 | Server-side `redirect()` issues HTTP 200 with RSC payload; curl sees 200 not 307. The redirect happens via React RSC streaming, not a proper HTTP 307. Unauthenticated users GET the shell, then are redirected client-side. |
| `GET /this-route-does-not-exist-12345` | 404 + "Page not found" | **404** | "Page not found" confirmed | ✅ | |

---

### Redirects (next.config.ts)

| URL | Expected destination | Actual HTTP | Location header | Status |
|-----|---------------------|-------------|-----------------|--------|
| `GET /signup` | 307 → /login?mode=signup | **307** | `/login?mode=signup` | ✅ |
| `GET /sign-up` | 307 → /login?mode=signup | **307** | `/login?mode=signup` | ✅ |
| `GET /signin` | 307 → /login | **307** | `/login` | ✅ |
| `GET /sign-in` | 307 → /login | **307** | `/login` | ✅ |
| `GET /pricing` | 307 → /legal#pricing | **404** | — | 🔴 | Redirect defined in next.config.ts but **not applied on live deployment**. Serving 404 instead of redirect. |
| `GET /apps` | 307 → / | **404** | — | 🔴 | Same: redirect not applied on live deployment. |
| `GET /security` | 307 → /legal#security | **404** | — | 🔴 | Same. |
| `GET /p/pitch-coach` | 307 → /p/meeting-action-items | **200** | — | 🔴 | Redirect defined in next.config.ts but the live app returns 200 and serves the Pitch Coach page (the app still exists in the DB). The redirect is suppressed because Vercel's rewrite cache / prebuilt deployment doesn't reflect the updated config. No `location` header emitted. |

**Bulk finding:** `/pricing`, `/apps`, `/security`, and `/p/pitch-coach` all have redirects declared in `next.config.ts` but the live deployment does not apply them. This suggests the config change was not picked up by the current Vercel deployment — or that the redirects.json shipped to Vercel is stale.

---

### Auth

| URL | Expected | Actual HTTP | Body | Status |
|-----|----------|-------------|------|--------|
| `GET /auth/callback` (no code) | 307 → /login?error=oauth_callback&message=... | **307** | — | ✅ |
| Location header value | `/login?error=oauth_callback&message=Authentication+failed.+Please+try+again.` | matches | | ✅ |

---

### Static / Meta assets

| URL | Expected | Actual HTTP | Content-Type | Status |
|-----|----------|-------------|--------------|--------|
| `GET /robots.txt` | 200 + text/plain | **200** | text/plain | ✅ |
| `GET /sitemap.xml` | 200 + XML | **200** | application/xml | ✅ |
| `GET /opengraph-image` | 200 + image/png | **200** | `image/png` | ✅ |
| `GET /p/meeting-action-items/opengraph-image` | 200 + image/png | **200** | `image/png` | ✅ |
| `GET /apple-icon` | 200 + image/png | **404** | text/html | 🔴 | apple-icon.tsx exists in source but Vercel deployment returns 404. File may not have been compiled/deployed. |
| `GET /manifest.webmanifest` | 200 + application/manifest+json | **404** | text/html | 🔴 | manifest.ts exists in source but deployment returns 404. |
| `GET /p/pitch-coach/opengraph-image` | not tested | n/a | | ⚠ | Not tested; /p/pitch-coach itself is broken (wrong redirect behaviour above). |

---

### API Routes

| URL | Method | Expected | Actual HTTP | Body (truncated 200 chars) | Status |
|-----|--------|----------|-------------|---------------------------|--------|
| `GET /api/apps/meeting-action-items` | GET | 200 + {id, slug, name, runtime, entrypoint, handler, public, input_schema, output_schema} | **200** | `{"id":"1d8baba6-b860-41b9-b455-a78c5de7bce2","slug":"meeting-action-items","name":"Meeting Action Items","runtime":"python","entrypoint":"app.py","handler":"run","public":true,"input_schema":{…},"output_schema":{…}}` | ✅ |
| `POST /api/apps/meeting-action-items/run` (empty body) | POST | 400 + `{error: "Missing inputs object"}` | **400** | `{"error":"Missing inputs object"}` | ✅ |
| `POST /api/apps/meeting-action-items/run` (valid input) | POST | 200 + {execution_id, status, output, error} | **200** | `{"execution_id":"56839a32-4a50-4446-955a-f52a07f00980","status":"success","output":{"count":2,"items":[{"task":"send the launch notes by Friday","owner":"","due":"Friday"},…]},"error":null}` | ✅ |
| `POST /api/apps/unknown-slug-xyz/run` | POST | 404 + `{error: "App not found"}` | **404** | `{"error":"App not found"}` | ✅ |
| `GET /api/agent-tokens` (no auth) | GET | 401 | **401** | `{"error":"Unauthorized"}` | ✅ |
| `GET /api/status` | GET | 200 + {overall, checks, checked_at} | **404** | Next.js 404 HTML | 🔴 | Route exists in source at src/app/api/status/route.ts but returns 404 on live deployment. Not deployed / not reachable. |
| `GET /status` | n/a (no page.tsx) | 404 | **404** | "Page not found" | ⚠ | Not a regression — there is no status page.tsx, only /api/status. CLAUDE.md comment says "/status is now a real page" but no page.tsx exists. The UI page is missing; only the API route exists and it is also 404. |

---

### MCP Endpoint

| Call | Expected | Actual HTTP | Body (truncated) | Status |
|------|----------|-------------|-----------------|--------|
| `GET /mcp` | 200 + {name, endpoint, transport} | **200** | `{"name":"floom","endpoint":"https://floom-60sec.vercel.app/mcp","transport":"json-rpc-over-http"}` | ✅ |
| `POST /mcp` initialize | 200 + JSON-RPC result | **200** | `{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"floom","version":"0.1.0"}}}` | ✅ |
| `POST /mcp` tools/list | 200 + {tools: [...]} | **200** | 9 tools returned: auth_status, get_app_contract, list_app_templates, get_app_template, validate_manifest, publish_app, find_candidate_apps, get_app, run_app | ✅ |
| `POST /mcp` tools/call list_app_templates | 200 + {templates: [...]} with **8** templates | **200** | **4 templates** returned: invoice_calculator, utm_url_builder, csv_stats, meeting_action_items | 🔴 |
| `POST /mcp` tools/call list_app_templates | — | — | Missing from live response: slugify, password_strength, regex_test, markdown_to_text | 🔴 |

**Explanation of template mismatch:** The source file `src/lib/mcp/tools.ts` defines 8 templates in `APP_TEMPLATES`. The live deployment returns only 4. The 4 missing templates (slugify, password_strength, regex_test, markdown_to_text) were either added after the last deployment, or the deployment that added them did not take effect. The audit task spec expected 8 templates but live Vercel returns 4.

---

## Sample Curls

```bash
# Health check
curl -s https://floom-60sec.vercel.app/api/apps/meeting-action-items | head -c 200

# Run app
curl -s -X POST https://floom-60sec.vercel.app/api/apps/meeting-action-items/run \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"transcript":"Action: send launch notes by Friday\nPallavi will review demo copy"}}' \
  | head -c 300

# MCP initialize
curl -s -X POST https://floom-60sec.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}' \
  | head -c 200

# MCP tools/list (count tools)
curl -s -X POST https://floom-60sec.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(len(d['result']['tools']), 'tools')"

# Auth callback (no code) — should redirect to /login
curl -si https://floom-60sec.vercel.app/auth/callback | grep location
```

---

## Top 5 Fixes

### 1. 🔴 CRITICAL — Redirects not applied on live deployment
`/pricing`, `/apps`, `/security`, `/p/pitch-coach` all return 404 or 200 instead of the 307s declared in `next.config.ts`. This means:
- `/pricing` is a dead link (shows 404, no page or redirect)
- `/apps` is a dead link (404, no page or redirect)
- `/security` is a dead link (404, no page or redirect)
- `/p/pitch-coach` serves the old Pitch Coach app page instead of redirecting to `meeting-action-items`

**Root cause:** The `next.config.ts` redirect block was not picked up by the current live Vercel deployment. Trigger a new deployment.

### 2. 🔴 HIGH — `/tokens` returns HTTP 200 unauthenticated (no server-side 307)
Source code uses Next.js `redirect()` which issues a streaming RSC redirect, not an HTTP 307. `curl` and non-JS clients see HTTP 200 with a shell page that client-side redirects to `/login`. This defeats server-side auth gating for non-browser clients and is a weak auth boundary. Fix: return `NextResponse.redirect(...)` from the page's server component, or add middleware that checks the session cookie and issues a true HTTP 307.

### 3. 🔴 HIGH — MCP `list_app_templates` returns 4 templates, not 8
Source defines 8 templates but live returns 4 (slugify, password_strength, regex_test, markdown_to_text are missing). The stale deployment is serving an older version of `tools.ts`. This is a deployment gap, not a code bug — but it means MCP consumers can't discover half the templates.

### 4. 🔴 HIGH — `/api/status` returns 404 (and `/status` has no UI page)
The `src/app/api/status/route.ts` exists and is correct, but the live deployment returns 404 for `GET /api/status`. The CLAUDE.md comment says "/status is now a real page" but there is no `src/app/status/page.tsx`. Both the API health endpoint and the status UI page are broken. Fix: redeploy; also add a `src/app/status/page.tsx` if a UI status page is intended.

### 5. 🔴 MEDIUM — `/apple-icon` and `/manifest.webmanifest` return 404
Both `src/app/apple-icon.tsx` and `src/app/manifest.ts` exist in source but the live deployment serves 404 for both. These are SEO/PWA regressions. Could be a deployment issue or a compilation issue with the specific Next.js version. Redeploy and verify; if still 404, check for build errors.
