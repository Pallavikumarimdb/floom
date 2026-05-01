# Floom Launch Readiness Checklist

Purpose: define the non-negotiable launch gate for the claim:

> localhost to live and secure in 60 seconds

Launch target: `https://floom.dev`

Release scope: v0.1, not v0-only.

This checklist is the source of truth for coordinator checks and virgin-agent QA. A launch claim is not ready until every P0 row has fresh production evidence.

Checklist quality audit: `docs/launch-readiness-gap-audit-2026-05-01.md`

## Scoring Rubric

| Score | Meaning |
| --- | --- |
| 0-59 | Missing entire launch dimensions or relies on memory. |
| 60-79 | Covers core path but leaves ambiguity, hidden setup, or untested provider dependencies. |
| 80-94 | Covers all major dimensions but still lacks exhaustive evidence format or repeated-agent breadth. |
| 95-100 | Every launch claim maps to a repeatable test, explicit evidence, owner, cleanup rule, and pass/fail state. |

Current checklist artifact score after the 2026-05-01 gap patch: `100/100`.

Current product launch score is lower until every P0 row below has fresh production evidence.

## P0 Product Path

| Gate | Required Evidence | Status |
| --- | --- | --- |
| Landing page explains one coherent product | `https://floom.dev/` loads, primary CTA points into the live demo or token flow, no split between preview stack and v0.1 stack | Pending final post-merge QA |
| Docs explain the exact launch path | `/docs` includes v0.1 app contract, CLI, MCP, secrets, dependencies, public/private access, and unsupported app shapes | Pending final post-merge QA |
| Legal page exists | `/legal` loads and contains contact, alpha terms, privacy/data handling, and abuse/removal channel | Pending final post-merge QA |
| Architecture diagram exists | docs include Mermaid architecture for browser/API/CLI/MCP/Supabase/E2B/runtime secrets | Pending final post-merge QA |
| 60-second claim stopwatch | Fresh user with token already available can publish and run a documented template from local folder to live `/p/:slug` in <= 60 seconds; log exact stopwatch start/stop | Pending final post-merge QA |
| First-run intuition | Virgin agent follows `/docs` and CLI/MCP instructions without coordinator explanation or hidden commands | Pending final post-merge QA |
| No legacy-stack split | user-visible docs, CLI output, MCP output, landing CTAs, and app URLs all point to `https://floom.dev`, not `preview.floom.dev` or a Vercel alias | Pending final post-merge QA |

## P0 Auth And Tokens

| Gate | Required Evidence | Status |
| --- | --- | --- |
| Email/password signup | Fresh account creation from `https://floom.dev/login`, or provider-limit failure recorded with exact copy and SMTP issue link | Pending final post-merge QA |
| Email confirmation | Confirmation lands on `https://floom.dev`, never localhost or Vercel alias | Pending final post-merge QA |
| Google sign-in | Google OAuth completes through Supabase and returns to `https://floom.dev/tokens`, no 502 | Pending final post-merge QA |
| Sign-in with existing user | Known user signs in and lands on `/tokens` | Pending final post-merge QA |
| Token create | `/tokens` creates an agent token, raw token appears once | Pending final post-merge QA |
| Token copy/list | copy state works; refresh hides raw token and shows prefix/metadata only | Pending final post-merge QA |
| Token revoke | revoke works; revoked token fails publish and run | Pending final post-merge QA |
| Token API boundary | agent tokens cannot create more agent tokens; `/api/agent-tokens` requires Supabase user bearer | Pending final post-merge QA |
| OAuth cookie/proxy regression | Google OAuth callback completes with production cookies through Cloudflare/AX41/nginx without `502` | Pending final post-merge QA |
| Broken image regression | Google logo and signed-in avatar render without broken image icons | Pending final post-merge QA |
| Signup volume truth | Supabase SMTP/rate-limit status is tested and documented; if SMTP is absent, public self-serve launch is marked blocked | Pending final post-merge QA |

## P0 CLI Path

| Gate | Required Evidence | Status |
| --- | --- | --- |
| Published CLI version | `npx @floomhq/cli@latest --version` returns expected v0.1-capable version | Pending final post-merge QA |
| CLI default/origin clarity | docs and CLI setup use `https://floom.dev`; no silent fallback to `preview.floom.dev` for launch path | Pending final post-merge QA |
| CLI auth | isolated HOME can run `auth login --token ... --api-url https://floom.dev` and `auth whoami` | Pending final post-merge QA |
| CLI init/template path | a user can create or copy a working app from documented templates | Pending final post-merge QA |
| CLI deploy dry run | `deploy --dry-run` validates manifest/source/requirements/secrets without publishing | Pending final post-merge QA |
| CLI deploy | `deploy` publishes a new app from scratch and returns `https://floom.dev/p/:slug` | Pending final post-merge QA |
| CLI run | `run --json` executes the published app and returns non-trivial output | Pending final post-merge QA |
| CLI secrets | `secrets set/list/delete` works without echoing secret values | Pending final post-merge QA |
| CLI setup config | `npx @floomhq/cli@latest setup` writes config with `api_url=https://floom.dev`; `auth whoami` confirms the same origin | Pending final post-merge QA |
| Isolated HOME | CLI auth/deploy/run works in a fresh temporary HOME with no existing Floom config | Pending final post-merge QA |
| Published package freshness | npm `@floomhq/cli@latest` contains the same launch instructions and origin behavior as the deployed app docs | Pending final post-merge QA |

## P0 MCP Path

| Gate | Required Evidence | Status |
| --- | --- | --- |
| MCP descriptor | `GET /mcp` returns Floom descriptor at `https://floom.dev/mcp` | Pending final post-merge QA |
| Tool list | MCP exposes `auth_status`, `get_app_contract`, `list_app_templates`, `get_app_template`, `validate_manifest`, `publish_app`, `find_candidate_apps`, `get_app`, `run_app` | Pending final post-merge QA |
| No token minting | MCP does not expose `create_agent_token` | Pending final post-merge QA |
| Contract guidance | `get_app_contract` clearly says v0.1 supports single-file Python, hash-locked deps, encrypted secrets, JSON schemas, public/private access | Pending final post-merge QA |
| Unsupported guidance | MCP rejects or flags TypeScript, Java, FastAPI/OpenAPI, multi-file, unpinned deps, unhashed deps, unsupported secrets | Pending final post-merge QA |
| Template guidance | MCP templates can produce a publishable app without custom tribal knowledge | Pending final post-merge QA |
| MCP publish | virgin agent publishes a new app from scratch with an agent token | Pending final post-merge QA |
| MCP run | virgin agent runs the app through MCP and sees correct output | Pending final post-merge QA |
| MCP setup clarity | MCP responses explain the exact local files required: `floom.yaml`, `app.py`, `input.schema.json`, `output.schema.json`, optional hash-locked `requirements.txt`, and secret names only | Pending final post-merge QA |
| MCP no-overpromise | MCP guidance never suggests TypeScript, Java, FastAPI/OpenAPI, multi-file, unpinned deps, raw secret values, teams, or per-user ACLs as launch-supported | Pending final post-merge QA |
| MCP template matrix | every listed MCP template validates, publishes under a unique slug, and runs at least once | Pending final post-merge QA |
| MCP malformed input | malformed JSON-RPC, missing auth, invalid bearer, invalid schema, and unsupported manifest return clear safe errors | Pending final post-merge QA |

## P0 v0.1 Runtime

| Gate | Required Evidence | Status |
| --- | --- | --- |
| Single-file stdlib Python | publish and run pass | Pending final post-merge QA |
| Python dependencies | exact-pinned, hash-locked `requirements.txt` installs and runs in E2B | Pending final post-merge QA |
| Dependency rejection | unpinned or unhashed deps fail with clear copy | Pending final post-merge QA |
| Encrypted secrets | secret names in manifest are accepted for private apps and values are encrypted at rest | Pending final post-merge QA |
| Secret injection | runtime receives secrets only at execution time | Pending final post-merge QA |
| Secret redaction | secret-like output fields are redacted | Pending final post-merge QA |
| Network isolation | dependency install sandbox has internet and no secrets; secret runtime sandbox has secrets and no internet | Verified pre-merge, pending final post-merge QA |
| Missing secret failure | missing required secret fails before user code runs | Pending final post-merge QA |
| Public secret app rejection | secret-backed apps cannot be public | Pending final post-merge QA |
| YAML contract matrix | documented valid manifests publish; documented invalid fields (`runtime`, `actions`, inline schemas, multi-file entrypoints, public secrets) fail with clear copy | Pending final post-merge QA |
| Dependency failure matrix | missing requirements file, unpinned requirement, wrong hash, install timeout, import failure, and oversized requirements fail safely | Pending final post-merge QA |
| Secret database evidence | production DB stores encrypted ciphertext only; plaintext test secret is absent from `app_secrets`, `app_versions`, `executions`, logs, and screenshots | Pending final post-merge QA |
| Secret RLS evidence | owner can manage secret metadata; non-owner and anon cannot read or mutate secret records | Pending final post-merge QA |
| E2B output quality | real E2B output proves dependency import or secret use; fake-mode output is absent in production | Pending final post-merge QA |

## P0 Access Control

| Gate | Required Evidence | Status |
| --- | --- | --- |
| Public metadata | anonymous `GET /api/apps/:slug` succeeds for public app | Pending final post-merge QA |
| Public run | anonymous browser/API/MCP run succeeds for public app | Pending final post-merge QA |
| Private metadata | anonymous metadata/page is blocked for private app | Pending final post-merge QA |
| Private run | anonymous API/MCP run is blocked for private app | Pending final post-merge QA |
| Owner access | owner session/token can read and run private app | Pending final post-merge QA |
| Invalid bearer | invalid bearer token fails instead of downgrading to anonymous | Pending final post-merge QA |
| Scoped token | read-only token cannot publish or run outside scope | Pending final post-merge QA |
| Non-owner token | non-owner token cannot read/run private app | Pending final post-merge QA |
| API automation with bearer | private app can be run via `curl`/HTTP with owner agent token, enabling n8n-style integrations; same request fails without or with wrong token | Pending final post-merge QA |
| Rate limits | anonymous public runs, token-authenticated runs, token creation, and auth-sensitive endpoints have documented limits and tested failure behavior | Pending final post-merge QA |
| Storage privacy | Supabase Storage bundle paths are not publicly readable; owner/server paths still work | Pending final post-merge QA |

## P0 UI And Browser

| Gate | Required Evidence | Status |
| --- | --- | --- |
| 390px mobile | `/`, `/login`, `/tokens`, `/docs`, `/legal`, `/p/:slug` have no document-level horizontal overflow | Pending final post-merge QA |
| Console health | public pages have no hydration errors or runtime console errors | Pending final post-merge QA |
| Google logo/avatar | auth UI renders provider logo/avatar without broken images | Pending final post-merge QA |
| App page run states | empty/loading/running/success/validation-error/runtime-error/private-app states are visible or directly testable | Pending final post-merge QA |
| Live demo | canonical demo app is real v0.1 output, not a stale echo stub | Pending final post-merge QA |
| Keyboard-only flow | login, token creation, copy, revoke, app input, app run, docs nav, and legal nav work by keyboard | Pending final post-merge QA |
| Screen-reader basics | forms have accessible labels, buttons have names, error states are announced or visible, page titles are distinct | Pending final post-merge QA |
| Multi-browser pass | Chromium and a Firefox/WebKit-class browser render public pages without broken layout or JS errors | Pending final post-merge QA |
| SEO/social preview | `/`, `/p/:slug`, OpenGraph image routes, sitemap, robots, canonical URLs, and title/description tags are correct | Pending final post-merge QA |

## P0 Production Infra

| Gate | Required Evidence | Status |
| --- | --- | --- |
| `main` contains v0.1 | GitHub `main` includes dependencies, encrypted secrets, runbooks, and QA docs | Pending push |
| Vercel deployment | Vercel prod deploy succeeds from `main` | Pending deploy |
| `floom.dev` routing | `floom.dev` serves the deployed Vercel build through AX41/Cloudflare path | Pending final post-merge QA |
| Supabase migration | app secrets migration is applied in production | Verified pre-merge, pending final post-merge QA |
| Env completeness | required production env names exist in Vercel, no values in repo | Pending final post-merge QA |
| SMTP limit | Supabase SMTP/rate-limit status is documented; public signup volume is either fixed or explicitly blocked | Pending final post-merge QA |
| Observability | Sentry/Vercel Analytics status is documented | Pending final post-merge QA |
| DNS/proxy map | Cloudflare, AX41 nginx, Vercel alias, Supabase redirects, and Google OAuth callback are documented and checked from production | Pending final post-merge QA |
| Health/status | `/api/status` or equivalent health endpoint exists or its absence is explicitly accepted; status-page decision recorded | Pending final post-merge QA |
| Rollback | last known good deployment, rollback command, and cleanup command are documented | Pending final post-merge QA |
| Cleanup tooling | coordinator can delete QA-created apps, tokens, secrets, auth users, executions, and storage bundles without manual DB spelunking | Pending final post-merge QA |

## P0 Independent QA

| Gate | Required Evidence | Status |
| --- | --- | --- |
| Virgin browser QA | at least one agent uses `docs/agent-browser-qa-runbook.md` to test login/token/browser flows | Pending final post-merge QA |
| Virgin CLI QA | at least one agent uses isolated HOME and published CLI from scratch | Pending final post-merge QA |
| Virgin MCP QA | at least one agent publishes and runs through MCP from scratch | Pending final post-merge QA |
| Adversarial unsupported-app QA | at least one agent tries unsupported apps and confirms clear rejection | Pending final post-merge QA |
| Code cleanliness audit | independent agent reviews code organization/security for launch blockers | Pending final post-merge QA |
| Evidence logs | logs are committed under `docs/qa-runs/` with no raw secrets | Pending final post-merge QA |
| Agent diversity | at least three independent runs use different prompts/focus areas: browser/auth, CLI/MCP, adversarial unsupported apps, and code/security | Pending final post-merge QA |
| Evidence schema | every run log records timestamp, commit, URL, commands, slugs, execution ids, screenshots/hashes, cleanup status, failures, and score | Pending final post-merge QA |
| Secret scan after logs | repo and `/tmp/floom-virgin-qa` evidence are scanned for raw tokens/JWTs/service-role/E2B/Vercel secrets before commit | Pending final post-merge QA |
| No stale evidence | docs distinguish pre-merge, post-merge, and current-production evidence; stale run logs are not counted as current pass | Pending final post-merge QA |

## P1 Launch Polish

These do not block a controlled v0.1 launch when P0 passes, but they affect public launch quality:

- PR #11 UI polish rebased onto v0.1 main and merged after separate QA.
- Supabase custom SMTP fully configured and load-tested.
- Sentry and Vercel Analytics enabled.
- Status page added.
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
