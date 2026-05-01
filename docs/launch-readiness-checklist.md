# Floom Launch Readiness Checklist

Purpose: define the non-negotiable launch gate for the claim:

> localhost to live and secure in 60 seconds

Launch target: `https://floom.dev`

Release scope: v0.1, not v0-only.

This checklist is the source of truth for coordinator checks and virgin-agent QA. A launch claim is not ready until every P0 row has fresh production evidence.

This file is the reusable gate, not a certificate that the current deployment passed every row. Detailed evidence, screenshots, and raw agent reports live outside the public repo.

## Scoring Rubric

| Score | Meaning |
| --- | --- |
| 0-59 | Missing entire launch dimensions or relies on memory. |
| 60-79 | Covers core path but leaves ambiguity, hidden setup, or untested provider dependencies. |
| 80-94 | Covers all major dimensions but still lacks exhaustive evidence format or repeated-agent breadth. |
| 95-100 | Every launch claim maps to a repeatable test, explicit evidence, owner, cleanup rule, and pass/fail state. |

Current checklist artifact score after the 2026-05-01 state audit: `92/100`.

Current product launch score is lower until every P0 row below has fresh production evidence. Do not treat older audit logs, stale PR notes, or pre-deploy results as current launch evidence.

Internal evidence path on AX41:

```text
/root/floom-internal/launch-evidence/floom-minimal/2026-05-01/
```

## P0 Product Path

| Gate | Required Evidence | Status |
| --- | --- | --- |
| Landing page explains one coherent product | `https://floom.dev/` loads, primary CTA points into the live demo or token flow, no split between preview stack and v0.1 stack | Needs current evidence |
| Docs explain the exact launch path | `/docs` includes v0.1 app contract, CLI, MCP, secrets, dependencies, public/private access, and unsupported app shapes | Needs current evidence |
| Legal page exists | `/legal` loads and contains contact, alpha terms, privacy/data handling, and abuse/removal channel | Needs current evidence |
| Architecture diagram exists | docs include Mermaid architecture for browser/API/CLI/MCP/Supabase/E2B/runtime secrets | Needs current evidence |
| 60-second claim stopwatch | Fresh user with token already available can publish and run a documented template from local folder to live `/p/:slug` in <= 60 seconds; log exact stopwatch start/stop | Needs current evidence |
| First-run intuition | Virgin agent follows `/docs` and CLI/MCP instructions without coordinator explanation or hidden commands | Needs current evidence |
| No legacy-stack split | user-visible docs, CLI output, MCP output, landing CTAs, and app URLs all point to `https://floom.dev`, not `preview.floom.dev` or a Vercel alias | Needs current evidence |

## P0 Auth And Tokens

| Gate | Required Evidence | Status |
| --- | --- | --- |
| Email/password signup | Fresh account creation from `https://floom.dev/login`, or provider-limit failure recorded with exact copy and SMTP issue link | Needs current evidence |
| Email confirmation | Confirmation lands on `https://floom.dev`, never localhost or Vercel alias | Needs current evidence |
| Google sign-in | Google OAuth completes through Supabase and returns to `https://floom.dev/tokens`, no 502 | Needs current evidence |
| Sign-in with existing user | Known user signs in and lands on `/tokens` | Needs current evidence |
| Token create | `/tokens` creates an agent token, raw token appears once | Needs current evidence |
| Token copy/list | copy state works; refresh hides raw token and shows prefix/metadata only | Needs current evidence |
| Token revoke | revoke works; revoked token fails publish and run | Needs current evidence |
| Token API boundary | agent tokens cannot create more agent tokens; `/api/agent-tokens` requires Supabase user bearer | Needs current evidence |
| OAuth cookie/proxy regression | Google OAuth callback completes with production cookies through Cloudflare/AX41/nginx without `502` | Needs current evidence |
| Broken image regression | Google logo and signed-in avatar render without broken image icons | Needs current evidence |
| Signup volume truth | Supabase SMTP/rate-limit status is tested and documented; if SMTP is absent, public self-serve launch is marked blocked | Needs current evidence |

## P0 CLI Path

| Gate | Required Evidence | Status |
| --- | --- | --- |
| Published CLI version | `npx @floomhq/cli@latest --version` returns expected v0.1-capable version | Needs current evidence |
| CLI default/origin clarity | docs and CLI setup use `https://floom.dev`; no silent fallback to `preview.floom.dev` for launch path | Needs current evidence |
| CLI auth | isolated HOME can run `auth login --token ... --api-url https://floom.dev` and `auth whoami` | Needs current evidence |
| CLI init/template path | a user can create or copy a working app from documented templates | Needs current evidence |
| CLI deploy dry run | `deploy --dry-run` validates manifest/source/requirements/secrets without publishing | Needs current evidence |
| CLI deploy | `deploy` publishes a new app from scratch and returns `https://floom.dev/p/:slug` | Needs current evidence |
| CLI run | `run --json` executes the published app and returns non-trivial output | Needs current evidence |
| CLI secrets | `secrets set/list/delete` works without echoing secret values | Needs current evidence |
| CLI setup config | `npx @floomhq/cli@latest setup` writes config with `api_url=https://floom.dev`; `auth whoami` confirms the same origin | Needs current evidence |
| Isolated HOME | CLI auth/deploy/run works in a fresh temporary HOME with no existing Floom config | Needs current evidence |
| Published package freshness | npm `@floomhq/cli@latest` contains the same launch instructions and origin behavior as the deployed app docs | Needs current evidence |

## P0 MCP Path

| Gate | Required Evidence | Status |
| --- | --- | --- |
| MCP descriptor | `GET /mcp` returns Floom descriptor at `https://floom.dev/mcp` | Needs current evidence |
| Tool list | MCP exposes `auth_status`, `get_app_contract`, `list_app_templates`, `get_app_template`, `validate_manifest`, `publish_app`, `find_candidate_apps`, `get_app`, `run_app` | Needs current evidence |
| No token minting | MCP does not expose `create_agent_token` | Needs current evidence |
| Contract guidance | `get_app_contract` clearly says v0.1 supports single-file Python, hash-locked deps, encrypted secrets, JSON schemas, public/private access | Needs current evidence |
| Unsupported guidance | MCP rejects or flags TypeScript, Java, FastAPI/OpenAPI, multi-file, unpinned deps, unhashed deps, unsupported secrets | Needs current evidence |
| Template guidance | MCP templates can produce a publishable app without custom tribal knowledge | Needs current evidence |
| MCP publish | virgin agent publishes a new app from scratch with an agent token | Needs current evidence |
| MCP run | virgin agent runs the app through MCP and sees correct output | Needs current evidence |
| MCP setup clarity | MCP responses explain the exact local files required: `floom.yaml`, `app.py`, `input.schema.json`, `output.schema.json`, optional hash-locked `requirements.txt`, and secret names only | Needs current evidence |
| MCP no-overpromise | MCP guidance never suggests TypeScript, Java, FastAPI/OpenAPI, multi-file, unpinned deps, raw secret values, teams, or per-user ACLs as launch-supported | Needs current evidence |
| MCP template matrix | every listed MCP template validates, publishes under a unique slug, and runs at least once | Needs current evidence |
| MCP malformed input | malformed JSON-RPC, missing auth, invalid bearer, invalid schema, and unsupported manifest return clear safe errors | Needs current evidence |

## P0 v0.1 Runtime

| Gate | Required Evidence | Status |
| --- | --- | --- |
| Single-file stdlib Python | publish and run pass | Needs current evidence |
| Python dependencies | exact-pinned, hash-locked `requirements.txt` installs and runs in E2B | Needs current evidence |
| Dependency rejection | unpinned or unhashed deps fail with clear copy | Needs current evidence |
| Encrypted secrets | secret names in manifest are accepted for private apps and values are encrypted at rest | Needs current evidence |
| Secret injection | runtime receives secrets only at execution time | Needs current evidence |
| Secret redaction | secret-like output fields are redacted | Needs current evidence |
| Network isolation | dependency install sandbox has internet and no secrets; secret runtime sandbox has secrets and no internet | Pre-merge evidence exists; needs current evidence |
| Missing secret failure | missing required secret fails before user code runs | Needs current evidence |
| Public secret app rejection | secret-backed apps cannot be public | Needs current evidence |
| YAML contract matrix | documented valid manifests publish; documented invalid fields (`runtime`, `actions`, inline schemas, multi-file entrypoints, public secrets) fail with clear copy | Needs current evidence |
| Dependency failure matrix | missing requirements file, unpinned requirement, wrong hash, install timeout, import failure, and oversized requirements fail safely | Needs current evidence |
| Secret database evidence | production DB stores encrypted ciphertext only; plaintext test secret is absent from `app_secrets`, `app_versions`, `executions`, logs, and screenshots | Needs current evidence |
| Secret RLS evidence | owner can manage secret metadata; non-owner and anon cannot read or mutate secret records | Needs current evidence |
| E2B output quality | real E2B output proves dependency import or secret use; fake-mode output is absent in production | Needs current evidence |

## P0 Access Control

| Gate | Required Evidence | Status |
| --- | --- | --- |
| Public metadata | anonymous `GET /api/apps/:slug` succeeds for public app | Needs current evidence |
| Public run | anonymous browser/API/MCP run succeeds for public app | Needs current evidence |
| Private metadata | anonymous metadata/page is blocked for private app | Needs current evidence |
| Private run | anonymous API/MCP run is blocked for private app | Needs current evidence |
| Owner access | owner session/token can read and run private app | Needs current evidence |
| Invalid bearer | invalid bearer token fails instead of downgrading to anonymous | Needs current evidence |
| Scoped token | read-only token cannot publish or run outside scope | Needs current evidence |
| Non-owner token | non-owner token cannot read/run private app | Needs current evidence |
| API automation with bearer | private app can be run via `curl`/HTTP with owner agent token, enabling n8n-style integrations; same request fails without or with wrong token | Needs current evidence |
| Rate limits | anonymous public runs, token-authenticated runs, token creation, and auth-sensitive endpoints have documented limits and tested failure behavior | Needs current evidence |
| Storage privacy | Supabase Storage bundle paths are not publicly readable; owner/server paths still work | Needs current evidence |

## P0 UI And Browser

| Gate | Required Evidence | Status |
| --- | --- | --- |
| 390px mobile | `/`, `/login`, `/tokens`, `/docs`, `/legal`, `/p/:slug` have no document-level horizontal overflow | Needs current evidence |
| Console health | public pages have no hydration errors or runtime console errors | Needs current evidence |
| Google logo/avatar | auth UI renders provider logo/avatar without broken images | Needs current evidence |
| App page run states | empty/loading/running/success/validation-error/runtime-error/private-app states are visible or directly testable | Needs current evidence |
| Live demo | canonical demo app is real v0.1 output, not a stale echo stub | Needs current evidence |
| Keyboard-only flow | login, token creation, copy, revoke, app input, app run, docs nav, and legal nav work by keyboard | Needs current evidence |
| Screen-reader basics | forms have accessible labels, buttons have names, error states are announced or visible, page titles are distinct | Needs current evidence |
| Multi-browser pass | Chromium and a Firefox/WebKit-class browser render public pages without broken layout or JS errors | Needs current evidence |
| SEO/social preview | `/`, `/p/:slug`, OpenGraph image routes, sitemap, robots, canonical URLs, and title/description tags are correct | Needs current evidence |

## P0 Production Infra

| Gate | Required Evidence | Status |
| --- | --- | --- |
| `main` contains v0.1 | GitHub `main` includes dependencies, encrypted secrets, runbooks, and QA docs | Verified on `main`; rerun after every commit |
| Vercel deployment | Vercel prod deploy succeeds from `main` | Verified on production; rerun after every commit |
| `floom.dev` routing | `floom.dev` serves the deployed Vercel build through AX41/Cloudflare path | Needs current evidence |
| Supabase migration | app secrets migration is applied in production | Pre-merge evidence exists; needs current evidence |
| Env completeness | required production env names exist in Vercel, no values in repo | Needs current evidence |
| SMTP limit | Supabase SMTP/rate-limit status is documented; public signup volume is either fixed or explicitly blocked | Needs current evidence |
| Observability | Sentry/Vercel Analytics status is documented | Needs current evidence |
| DNS/proxy map | Cloudflare, AX41 nginx, Vercel alias, Supabase redirects, and Google OAuth callback are documented and checked from production | Needs current evidence |
| Health/status | `/api/status` or equivalent health endpoint exists or its absence is explicitly accepted; status-page decision recorded | Needs current evidence |
| Rollback | last known good deployment, rollback command, and cleanup command are documented | Needs current evidence |
| Cleanup tooling | coordinator can delete QA-created apps, tokens, secrets, auth users, executions, and storage bundles without manual DB spelunking | Needs current evidence |

## P0 Independent QA

| Gate | Required Evidence | Status |
| --- | --- | --- |
| Virgin browser QA | at least one agent uses `docs/agent-browser-qa-runbook.md` to test login/token/browser flows | Needs current evidence |
| Virgin CLI QA | at least one agent uses isolated HOME and published CLI from scratch | Needs current evidence |
| Virgin MCP QA | at least one agent publishes and runs through MCP from scratch | Needs current evidence |
| Adversarial unsupported-app QA | at least one agent tries unsupported apps and confirms clear rejection | Needs current evidence |
| Code cleanliness audit | independent agent reviews code organization/security for launch blockers | Needs current evidence |
| Evidence logs | raw logs stay in the internal evidence path; public repo keeps reusable runbooks and sanitized summaries only | Pending final evidence reconciliation |
| Agent diversity | at least three independent runs use different prompts/focus areas: browser/auth, CLI/MCP, adversarial unsupported apps, and code/security | Needs current evidence |
| Evidence schema | every run log records timestamp, commit, URL, commands, slugs, execution ids, screenshots/hashes, cleanup status, failures, and score | Needs current evidence |
| Secret scan after logs | repo and `/tmp/floom-virgin-qa` evidence are scanned for raw tokens/JWTs/service-role/E2B/Vercel secrets before commit | Needs current evidence |
| No stale evidence | docs distinguish pre-merge, post-merge, and current-production evidence; stale run logs are not counted as current pass | Needs current evidence |

## P1 Launch Polish

These do not block a controlled v0.1 launch when P0 passes, but they affect public launch quality:

- PR #11 UI polish merged into `main`.
- Supabase custom SMTP fully configured and load-tested.
- Sentry status documented; Vercel Analytics disclosed in legal copy.
- Status page and `/api/status` verified after deploy.
- TypeScript, Java, FastAPI/OpenAPI, multi-file, and multi-endpoint branches mapped but not merged.
- v0.2/v0.3 add-on readiness reports for future runtimes are current and clearly marked not launched.

## Exit Criteria

Launch-ready requires:

1. every P0 row has fresh production evidence,
2. no P0 row is marked failed,
3. unsupported product claims are absent from UI/docs/MCP/CLI,
4. `main` is deployed to `https://floom.dev`,
5. final live gate passes from a fresh run,
6. at least three independent QA runs agree that token -> publish -> run works for browser, API, CLI, and MCP,
7. a human can inspect the evidence logs and reproduce the commands without reading private chat context.
