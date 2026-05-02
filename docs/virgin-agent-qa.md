# Virgin Agent QA Protocol

Purpose: give independent agents one repeatable launch-readiness test for Floom without relying on prior session context.

Scope: production Floom v0.1 at `https://floom.dev`, single-file Python function apps with JSON Schema input/output, exact-pinned hash-locked dependencies, encrypted app secrets, Supabase Auth, agent tokens, CLI publish, public/private access, E2B execution, API run, MCP run, and minimal UI smoke.

Do not run this protocol against production until the coordinator explicitly assigns a run.

Browser session handoff and provider ownership notes are operator-only records
kept in the private launch evidence store.

## No-Secret Rules

- Never print, paste, screenshot, commit, or log raw tokens, JWTs, Supabase service-role keys, E2B keys, Vercel tokens, cookies, or `.env` contents.
- Show only token prefixes, token ids, app slugs, execution ids, status codes, timings, and redacted output.
- Store temporary env files only under `/tmp`, `chmod 600`, and delete them before reporting.
- Use `[REDACTED]` for any output field that looks like `token`, `secret`, `password`, `api_key`, `private_key`, `credential`, or `authorization`.
- If a command prints a raw secret, stop the run, delete temporary files, and record the area as failed.

## Prerequisites

Tools:

- `git`
- `node`
- `npm`
- `npx`
- browser automation with screenshots
- `curl`
- optional: `jq`
- optional: Supabase SQL access for evidence queries

Environment:

- `FLOOM_API_URL=https://floom.dev`
- a fresh email address for signup or a coordinator-provided confirmed test user
- no persisted browser session from previous Floom runs
- a clean clone or working tree of `floomhq/floom-minimal`
- no raw secrets in terminal transcript or final report

Evidence directory:

```bash
mkdir -p /tmp/floom-virgin-qa
```

## Run Protocol

1. Record starting facts:
   - timestamp
   - agent name
   - repo path
   - local commit SHA
   - production URL
   - browser/device viewport
2. Start from a clean browser context.
3. Execute every checklist below.
4. Save screenshots and machine-readable evidence under `/tmp/floom-virgin-qa/<run-id>/`.
5. Append a completed run log entry to the bottom of this file or to a coordinator-designated copy.
6. Report blockers first, then scores.

## Checklist

### 1. Fresh Signup

- Open `https://floom.dev/login`.
- Confirm the page has sign-up and sign-in paths.
- Create a new account with email/password.
- Record whether Supabase accepts the signup or returns an email/rate-limit error.
- If signup succeeds, record the post-submit UI state and screenshot path.
- If signup fails due to provider rate limit, mark this area failed and continue only with a confirmed test user supplied by the coordinator.

Pass criteria:

- Signup works from production URL, or the failure is a documented Supabase provider limit with exact message and screenshot.
- No redirect to `localhost`.

### 2. Email Confirm Behavior

- Open the confirmation email in a safe mailbox if available.
- Click the confirmation link.
- Confirm the browser lands on `https://floom.dev/auth/callback` or the intended production redirect.
- Confirm the final page is `/tokens` or a signed-in production page.

Pass criteria:

- Confirmation never lands on `localhost`.
- Session becomes usable on production.

### 3. Browser-Authorized CLI Setup And Manual Token Management

- Run `npx @floomhq/cli@latest setup` with a temporary config path.
- Confirm setup opens or prints `/cli/authorize?code=...`.
- Approve from a signed-in browser and verify the CLI saves a token without printing it.
- Open `/tokens`.
- Create one manual agent token for management UI coverage.
- Confirm the manual raw token appears exactly once.
- Click copy and confirm copied state.
- Refresh the page.
- Confirm token list shows prefix/metadata but not raw tokens.
- Revoke the manual token.
- Confirm revoked token is no longer usable.
- Confirm MCP must not expose a token-creation tool.

Pass criteria:

- Token create/copy/list/revoke works in browser.
- Raw token is hidden after refresh.
- Revoked token fails publish/run.
- MCP cannot mint or return raw agent tokens.

### 4. CLI Publish With Token

- Create a new temporary app directory from scratch with the npm CLI:

```bash
mkdir -p /tmp/floom-virgin-qa/<run-id>/<app-dir>
cd /tmp/floom-virgin-qa/<run-id>/<app-dir>
FLOOM_API_URL=https://floom.dev npx @floomhq/cli@latest init \
  --name "QA App <run-id>" \
  --slug "qa-app-<unique-suffix>" \
  --description "QA app for launch verification." \
  --type custom
FLOOM_TOKEN=<redacted> FLOOM_API_URL=https://floom.dev npx @floomhq/cli@latest deploy --dry-run
FLOOM_TOKEN=<redacted> FLOOM_API_URL=https://floom.dev npx @floomhq/cli@latest deploy
```

- Record returned slug and page URL.

Pass criteria:

- CLI returns a `/p/:slug` URL.
- Publish finishes without printing raw secrets.
- App source bundle is stored server-side.

### 5. Public App Access

- Publish an app with `public: true` in `floom.yaml`.
- In an unauthenticated browser context:
  - `GET /api/apps/:slug`
  - open `/p/:slug`
  - run the app from the browser

Pass criteria:

- Anonymous metadata read succeeds.
- Anonymous browser run succeeds.
- Supabase records a successful execution.

### 6. Private App Access

- Publish an app with `public: false` or no `public` field.
- In an unauthenticated browser context:
  - `GET /api/apps/:slug`
  - open `/p/:slug`
  - `POST /api/apps/:slug/run`
- In an authenticated owner context or with owner agent token:
  - read metadata
  - run the app

Pass criteria:

- Anonymous metadata/run is blocked.
- Owner metadata/run succeeds.
- Error copy does not reveal private app details beyond a safe not-found/forbidden state.

### 7. Browser Run

- Open the public app page.
- Fill the generated JSON Schema form.
- Submit a valid input.
- Confirm loading/running state appears.
- Confirm success output appears.
- Submit invalid input.
- Confirm validation error appears.
- Capture desktop and mobile screenshots.

Pass criteria:

- No console errors.
- No horizontal mobile overflow at 390px width.
- Output renders clearly.
- Secret-like output fields are redacted.

### 8. API Run

- Run the public app through HTTP:

```bash
curl -sS -X POST "$FLOOM_API_URL/api/apps/<slug>/run" \
  -H 'content-type: application/json' \
  --data '{"inputs":{}}'
```

- Run the private app with and without authorization.

Pass criteria:

- Public API run succeeds.
- Private unauthenticated API run fails.
- Private authorized API run succeeds.
- Response includes sanitized status/output/error only.

### 9. MCP Run

- Confirm MCP descriptor:

```bash
curl -sS "$FLOOM_API_URL/mcp"
```

- Through an MCP-capable client, test:
  - `auth_status`
  - `get_app_contract`
  - `list_app_templates`
  - `get_app_template`
  - `validate_manifest`
  - `publish_app`
  - `get_app`
  - `run_app`

Pass criteria:

- MCP endpoint is reachable.
- MCP does not list or execute `create_agent_token`.
- `get_app_contract` returns the v0.1 manifest, app.py, input/output schemas, and unsupported cases.
- `list_app_templates` returns useful v0.1-safe templates.
- `get_app_template` returns copy-paste bundles for invoice calculator, UTM URL builder, CSV stats, and meeting action item extraction.
- Tool errors return structured MCP errors.
- MCP publish/run matches CLI/API behavior.
- No token appears in tool output, logs, screenshots, or reports.

### 10. Supabase Rows And Storage Evidence

Collect evidence without exposing secrets:

- `apps` row exists for each slug.
- `app_versions` row exists for each publish.
- `executions` row exists for each run.
- Persisted execution input redacts fields marked `secret: true` or named like token/secret/password/api_key/private_key/credential/authorization.
- `agent_tokens` row exists with prefix/hash metadata only.
- `app-bundles` storage object exists under owner-scoped path.
- Public/private flags match the manifests.
- Storage bucket remains private.

Pass criteria:

- Database state matches the UI/API behavior.
- No raw token, raw source credential, or raw secret-like execution input is stored in public tables.

### 11. E2B Execution Evidence

For each successful run, record:

- execution id
- status
- elapsed time
- sanitized stdout/stderr summary
- output JSON
- evidence that fake mode was not used for production

Pass criteria:

- Real E2B run succeeds.
- Browser/API output comes from the sandbox run.
- Errors are sanitized.
- Sandbox lifecycle does not leak raw E2B URLs or tokens.

### 12. OpenBlog Endpoint Coverage Gate

Use `federicodeponte/openblog` only as an example-app quality gate.

- Inspect OpenBlog routes or `openapi.json`.
- List every endpoint/action.
- Classify each endpoint as:
  - supported by current v0
  - blocked by v0 scope
  - needs FastAPI/OpenAPI mode
  - needs dependencies/secrets/state
- Do not claim OpenBlog support until every endpoint has a passing Floom run.

Pass criteria:

- Current v0 limitations are explicit.
- No broad app-support claim is made without endpoint evidence.

### 13. Mobile UI Smoke

Check at minimum:

- `/`
- `/login`
- `/tokens`
- `/docs`
- `/legal`
- `/p/:slug`

Viewports:

- 390x844
- 768x1024
- 1440x900

Pass criteria:

- No loading-only screenshots.
- No horizontal overflow.
- Primary CTA is visible.
- App form and output are usable.
- Console error count is zero.

### 14. Code Cleanliness Roast

Read the current diff and relevant files.

Check:

- module boundaries match `docs/quality-bar.md`
- Supabase schema lives in `supabase/migrations`
- no duplicated schema definitions
- no dead fake-mode paths used in production
- no hardcoded localhost URLs
- no hardcoded secrets
- no source files outside the intended change scope
- tests cover auth, tokens, publish, public/private access, API, MCP, rate limit, redaction, and E2B failure modes

Pass criteria:

- Findings are concrete file/line issues.
- No stylistic nitpicks without launch impact.
- Score reflects code cleanliness and operational simplicity.

## Scoring

Score each area 0-100:

- Signup and email confirm
- Token UI
- CLI publish
- Public app access
- Private app access
- Browser run
- API run
- MCP run
- Supabase rows/storage
- E2B execution
- OpenBlog coverage gate
- Mobile UI
- Code cleanliness
- 60-second claim, scoped to authenticated single-file Python app

Overall score is the lowest score of any critical area:

- Critical areas: token UI, CLI publish, private access, public access, browser run, API run, Supabase evidence, E2B evidence.
- A single critical blocker caps overall score at 79.
- Missing independent evidence caps overall score at 89.
- Any raw secret leak caps overall score at 0.

## Run Log Template

Append one block per independent run.

```md
## QA Run - <YYYY-MM-DD HH:MM TZ>

- Agent name:
- Agent runtime/model:
- Repo path:
- Commit SHA:
- Deployment URL:
- Browser/device:
- Test public app slug:
- Test private app slug:
- Evidence directory:

### Results

| Area | Pass/Fail | Score | Evidence |
| --- | --- | ---: | --- |
| Fresh signup |  |  |  |
| Email confirm behavior |  |  |  |
| Token create/copy/list/revoke |  |  |  |
| CLI publish with token |  |  |  |
| Public app access |  |  |  |
| Private app access |  |  |  |
| Browser run |  |  |  |
| API run |  |  |  |
| MCP run |  |  |  |
| Supabase rows/storage evidence |  |  |  |
| E2B execution evidence |  |  |  |
| OpenBlog endpoint coverage gate |  |  |  |
| Mobile UI smoke |  |  |  |
| Code cleanliness roast |  |  |  |
| 60-second claim |  |  |  |

### Timings

- Signup to usable session:
- Token creation:
- CLI publish:
- Page available:
- First browser run:
- API run:
- MCP run:

### Blockers

- 

### Security Notes

- Raw secret leak observed: yes/no
- Redaction verified: yes/no
- Private app blocked for anonymous caller: yes/no

### Overall

- Overall score 0-100:
- Launch decision: pass/fail
- Required fixes before next run:
```
