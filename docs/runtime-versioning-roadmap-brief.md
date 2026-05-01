# v0.2+ versioning roadmap — briefing for Codex

Federico's call (2026-05-01): the current roadmap collapses too many capabilities into "v0.2" and "v0.3". That forces a slowest-ships-last cadence. Each capability below is independent enough to be its own minor version on its own branch, shipped when ready. **Codex owns the official roadmap doc; this brief is the input.**

## Principle

- One capability per minor version.
- One long-lived branch per capability (`feat/v0.x-<capability>`).
- Each branch has: scope freeze, "done =" criteria, contract changes, owner, target window.
- Versions ship in **order of completion**, not pre-assigned numbers. v0.2 is whichever ships first.
- A capability is **done** only when: real test fixture deploys + runs end-to-end on canonical, MCP `get_app_contract` reflects the new shape, /docs has a section, and a 5-line "what changed" entry lands in `CHANGELOG.md`.

## Capabilities (target after launch)

### A. TypeScript / Node runtime
- **Why**: JS-native ICP slice (~30-40% of AI-builder dev tools market). Schema is declared in v0.1 manifest but runtime is hollow.
- **Scope**: handler.ts → sandbox executes node, JSON Schema → form unchanged, REST + MCP unchanged. `package.json` with pinned deps, hash-locked install.
- **Branch**: `feat/v0.x-ts-node-runtime`
- **Done**: a TS handler template ships in `templates/`, deploys to canonical, runs via /p/<slug>, REST, and MCP. `get_app_contract` returns `runtime: ['python', 'node']`. /docs gets a TS section.
- **Effort**: medium (1-2 weeks). Sandbox image work + manifest validator + e2b adapter.
- **Depends on**: nothing.

### B. Multi-action / multi-endpoint
- **Why**: One slug, multiple handlers (`/p/<slug>/<action>`). Audit found 95% of this is shipped on legacy floom main. Big DX unlock for SDK-style apps.
- **Scope**: floom.yaml `actions: { extract: ..., score: ..., classify: ... }` already exists in manifest validator; runtime + UI + MCP need to map per-action. UI shows action-picker; MCP registers tool-per-action.
- **Branch**: `feat/v0.x-multi-action`
- **Done**: a 3-action template ships, REST routes by action, MCP exposes `run_app` per-action OR keeps single `run_app` with `action` arg, /p/<slug> shows action picker. `get_app_contract` removes "actions: post-v0.1" from unsupported.
- **Effort**: medium (port from legacy). 3-5 days.
- **Depends on**: nothing. Could be the FAST first ship since most code already exists in legacy.

### C. Streaming
- **Why**: Chat-like apps, long-running agents, anything that yields tokens. Currently handler returns a single object; UI shows once on completion.
- **Scope**: handler is a generator (Python `yield`) or async iterator (JS); UI streams progressive output; REST returns SSE or chunked JSON; MCP tool advertises streaming capability.
- **Branch**: `feat/v0.x-streaming`
- **Done**: a streaming chat-coach template, /p/<slug> shows tokens as they arrive (or chunks for non-token outputs), REST opens a stream, MCP `run_app` supports streaming response per spec.
- **Effort**: medium-large (2-3 weeks). Touches every layer of the run path.
- **Depends on**: nothing strictly, but cleaner if multi-action is in (so streaming applies per-action).

### D. FastAPI / OpenAPI ingest
- **Why**: Existing FastAPI apps become Floom apps. Existing OpenAPI specs become Floom apps. Audit found legacy floom main has 60-85% of this.
- **Scope**: handler is a `FastAPI` instance OR an `openapi.json`. Floom proxies all routes, generates a UI per route, registers each route as an MCP tool.
- **Branch**: `feat/v0.x-fastapi-openapi`
- **Done**: a FastAPI app in `templates/` with 3 routes deploys, each route renders a UI page, REST proxies preserve method + status, MCP `run_app` accepts route + method, OpenAPI spec auto-served at `/api/apps/<slug>/openapi.json`.
- **Effort**: large (port + harden). 2-3 weeks. Most code exists in legacy.
- **Depends on**: multi-action (B) — natural extension. Could ship as B v2.

### E. JavaScript runtime
- **Why**: Pair with TS/Node (A). Some teams run plain JS without TS.
- **Scope**: same as A but `app.js` instead of `app.ts`. No TS compile step in sandbox.
- **Branch**: `feat/v0.x-js-runtime` (or fold into A — Codex's call)
- **Done**: same shape as A, but JS handler.
- **Effort**: small if done with A (most of A's work covers this).
- **Recommendation**: bundle with A as `feat/v0.x-node-runtime` — one branch, both languages.

### F. Multi-file Python
- **Why**: Real apps grow past one file. `from utils import sanitize` etc.
- **Scope**: bundle = directory tree, sandbox preserves layout, `entrypoint:` resolves the import root.
- **Branch**: `feat/v0.x-multi-file-python`
- **Done**: a 3-file template (handler.py + utils.py + types.py) deploys + runs. `get_app_contract` removes "multi-file: post-v0.1" from unsupported.
- **Effort**: medium-large (3-5 days). Audit said 0% done anywhere.
- **Depends on**: nothing. Could be a v0.x flagship.

### G. Async + poll runtime (long-running execution)
- **Why**: v0.1 is sync-only at the API surface — `POST /api/apps/<slug>/run` blocks until done. This pins every app to <60s (Vercel Hobby cap). Anything real (web crawls, multi-step pipelines, video transcription, large LLM context) needs minutes-to-hours. The `executions` table is already async-shaped (`status`, `created_at`, `completed_at`) — only the API surface is sync.
- **Scope**: `POST /api/apps/<slug>/run` returns `{execution_id, status: "queued"}` immediately, dispatches background work. New `GET /api/executions/<id>` returns `{status, output, error, started_at, completed_at, progress?}`. `/p/<slug>` polls. MCP `run_app` gains `async: true` mode. Optional `Accept: text/event-stream` for SSE.
- **Branch**: `feat/v0.x-async-poll-runtime`
- **Spec**: `docs/v0.x-async-spec.md`
- **Done**: a long-running template (e.g. "summarize a 50-page PDF") deploys, runs for 5+ min without HTTP timeout, /p/<slug> shows live progress, MCP can either block-and-wait or fire-and-poll.
- **Effort**: large (1-2 weeks). Touches API contract, run path, UI. Forces a job-queue choice (QStash chosen — see spec).
- **Depends on**: nothing strictly, but force-multiplier for H, K, F-with-deps.

### H. Hosted Docker runtime
- **Why**: A whole class of useful apps (Playwright/Chromium crawlers, PDF processing with poppler/tesseract, audio with ffmpeg, anything with native deps) doesn't fit "single-file Python with hash-pinned wheels". Existing Floom example `ig-nano-scout/cloud/` is a Docker app today (Playwright + stealth Chromium + residential proxy) and has nowhere to land in v0.1.
- **Scope**: `floom.yaml: type: hosted, docker_image: ghcr.io/<repo>:<tag>` validates as a new manifest mode. Floom pulls the image into a Floom-managed runtime. Image entrypoint receives `{action, inputs}` JSON, returns `__FLOOM_RESULT__<json>` on stdout. Floom handles lifecycle.
- **Branch**: `feat/v0.x-hosted-docker`
- **Done**: ig-nano-scout's `cloud/apps.yaml` deploys via the Floom CLI without modification, runs via /p/<slug> + REST + MCP.
- **Effort**: large (2-4 weeks). Pick a runtime substrate (E2B custom template is closest to v0.1; Fly.io machines is broader).
- **Depends on**: G (async + poll) for any image that runs >1 min.

### I. Chromium-baked E2B template (intermediate to H)
- **Why**: Apps that need browser automation but don't want to build a Docker image. Stealth Playwright in plain Python, deployed as a `runtime: python` app, but the sandbox already has Chromium + Playwright installed.
- **Scope**: A new E2B template (`floom-chromium`) with Chromium + Playwright + common scraping deps pre-installed. `floom.yaml: runtime: python, sandbox: chromium` selects it. Cold start drops from ~60s to ~3s.
- **Branch**: `feat/v0.x-chromium-sandbox-template`
- **Done**: a "fetch + parse a JS-rendered page" template deploys + runs in <10s end-to-end on first run.
- **Effort**: small-medium (3-5 days).
- **Depends on**: nothing. Lighter alternative to H.

### J. Output-size + runtime ceilings raised further (post-v0.1)
- **Why**: v0.1 ships with bumped limits (1 MB output, 256 KB input, 60s timeout). The 60s is a Vercel Hobby cap, not a Floom design choice. Pro tier lifts to 300s; G/H lift the effective ceiling to hours via async dispatch.
- **Scope**: bump `SANDBOX_TIMEOUT_MS` to 300_000 once on Vercel Pro; gate via env var so Hobby deployments still run. Output-cap bumps as needed per app type.
- **Branch**: pair with G or do as standalone limits PR.
- **Effort**: trivial code (constant change + maxDuration export). Cost is the Vercel plan tier, not engineering time.

### K. Connections (user-side integration brokerage via Composio)
- **Why**: Apps that act on users' Gmail / Slack / Linear / Notion / GitHub data shouldn't require app developers to write per-integration OAuth. The user owns the credentials. Composio handles the auth dance + token storage + per-user `entity_id`. App handlers get a uniform "execute action on this user's account" call. Unblocks the entire multi-tenant SaaS app category.
- **Scope**: User-facing "Connect Gmail / Slack / Linear / ..." UI on Floom (Composio-powered OAuth). Per-user `connections` table mapping `user_id + provider -> composio_entity_id`. Manifest schema gains `integrations: [gmail, slack, linear]`. At run time, Floom resolves the calling user's connections and proxies Composio calls server-side (the platform Composio key never enters the sandbox — see spec).
- **Branch**: `feat/v0.x-connections`
- **Spec**: `docs/v0.x-connections-spec.md`
- **Done**: a 3-integration template (e.g. "summarize today's Gmail and post to Slack") deploys, runs as multiple Floom users without per-user secret management by the app dev.
- **Effort**: large (3-4 weeks). OAuth UI + per-user connection storage + manifest schema + runtime proxy + Composio adapter.
- **Depends on**: G (async + poll) for any flow that takes >60s.
- **Light-touch interim**: today, app devs can pin `composio-core` in `requirements.txt`, declare a `COMPOSIO_API_KEY` secret, call Composio directly. Works for app-dev-owned credentials but doesn't enable user-owned connections. K is the user-side path.

## ICE-scored priority

Scale 1-10 each, ICE = I × C × E (max 1000). Anchor: 504 (B) is high-impact + high-confidence + easy; 80 (H) is real impact but expensive and uncertain.

| ID | Capability | Impact | Confidence | Ease | ICE |
|---|---|---|---|---|---|
| B | Multi-action manifests | 7 | 9 | 8 | **504** |
| J | Lift timeout 60→300s (Vercel Pro) | 4 | 10 | 10 | **400** |
| I | Chromium-baked E2B template | 6 | 9 | 7 | **378** |
| A+E | TS/Node + JS runtime | 9 | 8 | 5 | **360** |
| G | Async + poll runtime | 10 | 8 | 4 | **320** |
| F | Multi-file Python | 5 | 8 | 7 | **280** |
| K | Connections (Composio user-side) | 10 | 6 | 3 | **180** |
| C | Streaming | 8 | 6 | 3 | **144** |
| D | FastAPI/OpenAPI ingest | 6 | 6 | 3 | **108** |
| H | Hosted Docker runtime | 8 | 5 | 2 | **80** |

## Two ways to read the table

**Pure ICE order** (raw quick wins first): B → J → I → A+E → G → F → K → C → D → H

**Force-multiplier-adjusted** (G unblocks C/H/F-with-deps/K; K unblocks every connector after; J is essentially free if on Pro): B + J + I week 1 → A+E + G weeks 2-3 → K weeks 4-7 → C / F as filler → D, H later.

ICE penalizes G for being slow, but G makes everything after it shippable. Same logic for K — once Composio brokerage is in, every additional connector (Slack → Linear → Notion → Stripe) is days, not weeks. Standalone apps that fit in 60s + don't need user connections can ship in v0.1 today.

## Suggested ship sequence (force-multiplier-adjusted)

**Week 1 post-launch** (parallel):
1. **B. Multi-action** — Codex, port from legacy. Fastest ship.
2. **I. Chromium E2B template** — Codex. Fast path to browser automation.
3. **J. Vercel Pro upgrade + `FLOOM_SANDBOX_TIMEOUT_MS=300000`** — 5 min, no code work.

**Weeks 2-3** (parallel):
4. **A+E. Node + JS runtime** — Codex, biggest TAM unlock.
5. **G. Async + poll runtime** — biggest architectural lift; force multiplier.

**Weeks 4-7** (sequential, gated on G):
6. **K. Connections (Composio user-side)** — biggest product unlock. Multi-tenant SaaS apps without OAuth code.
7. **C. Streaming** — natural extension of G.

**Later, as filler / on-demand**:
8. F. Multi-file Python.
9. D. FastAPI/OpenAPI ingest.
10. H. Hosted Docker runtime — only if a customer specifically needs custom Docker images that I can't cover.

## Branch + version cadence

- One PR per capability per branch. No bundling.
- Version assigned at merge time: first to merge after v0.1 = v0.2, next = v0.3, etc.
- Each branch has its own `docs/v0.x-<capability>-spec.md` with: scope, contract diff, test plan, rollout plan. Specs already written: G (`docs/v0.x-async-spec.md`), K (`docs/v0.x-connections-spec.md`).
- Each branch must add: (a) a real template that uses the new capability, (b) MCP `get_app_contract` reflects it, (c) /docs has a section, (d) CHANGELOG entry.

## What this brief is not

- Not a commitment on dates. Federico hasn't approved a launch date for any of these.
- Not a scope freeze. Each capability still needs its own spec doc that Codex writes.
- Not a replacement for the v0.1 launch readiness work — that ships first.

## Companion doc

For "what do we do with the work already done on legacy branches?" → `docs/legacy-migration-strategy.md`. Three-bucket call: don't lift architectural code (re-implement fresh, use legacy as reference), do lift component-level UI / business logic (Forgot Password, AppReviews, email templates) when the corresponding feature becomes priority, archive the rest with the renamed `floom-legacy` repo (read-only, stars preserved). That doc also has the concrete post-launch sequencing — when to fire each Codex agent, in what order, with what constraints (max 3 branches in flight, merge gates).

## Current sequencing note

v0.1 dependencies/secrets, UI polish, and the real `meeting-action-items` demo are merged into `main`. Future runtime branches stay isolated until the v0.1 launch gate is clean: signup/email provider verification, OAuth callback verification, repeated publish-flow QA, and final checklist evidence.

See "Suggested ship sequence (force-multiplier-adjusted)" above for the canonical post-launch order.

Federico picks the dates. Codex executes.
