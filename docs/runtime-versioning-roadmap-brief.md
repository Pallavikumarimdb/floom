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

## Suggested order (most → least bang per ship-week)

1. **B. Multi-action** — fastest (port from legacy), unlocks most user requests
2. **A+E. Node + JS runtime** — biggest TAM expansion (JS-native ICP)
3. **C. Streaming** — best demo-ability for launches/posts
4. **F. Multi-file Python** — long-tail of "real" apps
5. **D. FastAPI / OpenAPI ingest** — power-user feature, bigger lift

## Branch + version cadence

- One PR per capability per branch. No bundling.
- Version assigned at merge time: first to merge after v0.1 = v0.2, next = v0.3, etc.
- Each branch has its own `docs/v0.x-<capability>-spec.md` with: scope, contract diff, test plan, rollout plan.
- Each branch must add: (a) a real template that uses the new capability, (b) MCP `get_app_contract` reflects it, (c) /docs has a section, (d) CHANGELOG entry.

## What this brief is not

- Not a commitment on dates. Federico hasn't approved a launch date for any of these.
- Not a scope freeze. Each capability still needs its own spec doc that Codex writes.
- Not a replacement for the v0.1 launch readiness work — that ships first.

## Companion doc

For "what do we do with the work already done on legacy branches?" → `docs/legacy-migration-strategy.md`. Three-bucket call: don't lift architectural code (re-implement fresh, use legacy as reference), do lift component-level UI / business logic (Forgot Password, AppReviews, email templates) when the corresponding feature becomes priority, archive the rest with the renamed `floom-legacy` repo (read-only, stars preserved). That doc also has the concrete post-launch sequencing — when to fire each Codex agent, in what order, with what constraints (max 3 branches in flight, merge gates).

## Current sequencing note

v0.1 dependencies/secrets, UI polish, and the real `meeting-action-items` demo are merged into `main`. Future runtime branches stay isolated until the v0.1 launch gate is clean: signup/email provider verification, OAuth callback verification, repeated publish-flow QA, and final checklist evidence.

Recommended first wave (parallel):
- B (multi-action) — Codex agent, 5 days, fastest ship
- A+E (Node + JS) — Codex agent, 10 days, biggest TAM unlock
- F (multi-file Python) — Codex agent, 5 days, parallel with B

Second wave (after first wave settles, ~3 weeks post-launch):
- C (streaming) — flagship for the v0.x demo
- D (FastAPI/OpenAPI) — power-user feature

Federico picks the dates. Codex executes.
