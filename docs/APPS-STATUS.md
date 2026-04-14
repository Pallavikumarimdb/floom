# Bundled apps status · v0.2.0

Audit of the 15 apps in `apps/server/src/db/seed.json` against the v0.2.0 protocol. These apps are opt-in via `FLOOM_SEED_APPS=true` (see docs/SELF_HOST.md). The v0.2 default is an empty hub populated via `apps.yaml`.

## Summary

| Metric | Count |
|--------|-------|
| Apps in seed | 15 |
| Hosted (docker-runner) | 15 |
| Proxied (HTTP) | 0 |
| Work without secrets | 4 |
| Need at least one secret | 11 |
| Work with MCP `_auth` per-user extension | 11 (after secrets_needed declared) |
| Work on self-host without `docker.sock` mount | 0 |

All 15 bundled apps are hosted-mode (docker-based). None have been converted to proxied-mode yet. The v0.2 self-host story works for `apps.yaml`-declared proxied apps; the bundled catalog still needs docker.sock.

## Per-app status

| Slug | Manifest v2 | secrets_needed | Docker-sock required | Works via HTTP | Works via MCP | _auth compatible | Needs conversion to proxied |
|------|-------------|----------------|----------------------|----------------|---------------|------------------|-----------------------------|
| blast-radius | yes | [] | yes (hosted) | yes (with sock) | yes (with sock) | N/A (no secrets) | recommended |
| bouncer | yes | [GEMINI_API_KEY] | yes (hosted) | yes (server-side sock + key) | yes | yes | recommended |
| claude-wrapped | yes | [] | yes (hosted) | yes (with sock) | yes (with sock) | N/A | recommended |
| dep-check | yes | [] | yes (hosted) | yes (with sock) | yes (with sock) | N/A | recommended |
| flyfast | yes | [FLYFAST_INTERNAL_TOKEN] | yes (hosted) | yes (server-side) | yes | yes | blocked (internal infra) |
| hook-stats | yes | [] | yes (hosted) | yes (with sock) | yes (with sock) | N/A | recommended |
| openanalytics | yes | [GEMINI_API_KEY] | yes (hosted) | yes | yes | yes | recommended |
| openblog | yes | [GEMINI_API_KEY] | yes (hosted) | yes | yes | yes | recommended |
| opencontext | yes | [GEMINI_API_KEY] | yes (hosted) | yes | yes | yes | recommended |
| opendraft | yes | [GOOGLE_API_KEY] | yes (hosted) | yes | yes | yes | recommended |
| opengtm | yes | [] | yes (hosted) | yes (with sock) | yes (with sock) | N/A | recommended |
| openkeyword | yes | [GEMINI_API_KEY] | yes (hosted) | yes | yes | yes | recommended |
| openpaper | yes | [OPENPAPER_API_TOKEN] | yes (hosted) | yes | yes | yes | recommended |
| openslides | yes | (see manifest) | yes (hosted) | yes | yes | yes | recommended |
| session-recall | yes | (see manifest) | yes (hosted) | yes | yes | yes | recommended |

## What changed in v0.2.0 for these apps

1. **Missing-secret error path** — previously hosted apps that needed secrets returned verbose Python tracebacks that MCP clients could not surface to users. Now the runner validates `manifest.secrets_needed` before dispatching. If any secret is missing AND the MCP client hasn't provided it via `_auth`, a structured `{error: "missing_secrets", required: [...], help: "..."}` response is returned before the container is even started.

2. **MCP `_auth` extension** — all 11 secret-requiring apps now automatically expose an optional `_auth` object in their tool's `inputSchema`. The LLM or the user can populate it per call. Secrets flow through to the container env for that single run; they are never persisted server-side. This directly unblocks OpenPaper, Session Recall, OpenContext, OpenBlog, etc. for Claude Desktop / Cursor / Cline without requiring server-side secret seeding.

3. **FLOOM_SEED_APPS opt-in** — these 15 apps no longer load by default. Self-hosters who want the bundled catalog must set `FLOOM_SEED_APPS=true` AND mount `/var/run/docker.sock`. This eliminates the first-boot crash that new users hit in v0.1.

## Proxied-conversion roadmap

The ideal end state is every app in `apps/server/src/db/seed.json` being a thin proxy to a public HTTP endpoint owned by its author. That eliminates the docker.sock dependency entirely for self-hosters.

**Needed per app:**
1. A public HTTP endpoint (e.g. https://api.openpaper.dev)
2. An OpenAPI 3.x spec URL
3. Author moves the `secrets_needed` semantics from container env vars to HTTP headers (via the proxied-runner's auth layer)
4. Replace the hosted seed entry with a proxied apps.yaml entry

**Who owns each conversion:**
- flyfast, openpaper, opendraft, openslides, session-recall, opencontext, openanalytics, openblog, opengtm, openkeyword, claude-wrapped, hook-stats — Federico
- blast-radius, dep-check, bouncer — already public git-based; conversion is mostly about shipping a public OpenAPI spec

**Target: all 15 converted by v0.3.0.** Until then, the bundled catalog is the docker-sock path and `apps.yaml` is the proxied path.

## Test coverage

The v0.2.0 stress test (`test/stress/test-ingest-stress.mjs`) covers 4 real OpenAPI specs (Stripe, GitHub, Petstore, Resend) and validates the full ingest pipeline: fetch → $ref deref → servers[] resolve → operation extraction. The 15 bundled apps do NOT go through this path because they are hosted-mode, not proxied. Their coverage lives in `apps/server/src/services/docker.ts` which was not touched by v0.2.

## Still open

- No public OpenAPI spec for any of the 15 apps (all authored internally)
- No integration test runs a bundled app end-to-end with a mocked docker socket
- No /api/hub endpoint that surfaces per-app tool schemas for HTTP-only clients (audit recommendation #7, deferred)
- Docker-sock path still works for preview.floom.dev where all 15 apps run
