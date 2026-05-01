# Launch Final Checklist Audit - Run E - 2026-05-01

Scope: adversarial checklist/code/docs audit for `https://floom.dev`.

Worktree: `/tmp/floom-main-post-analytics`  
Commit audited: `41db43bc9c597b1b484c328ef45d40c9e45341bb`  
Branch: `main`  
Production target: `https://floom.dev`  
Raw secrets printed: no

## Launch Readiness Score

**79/100 - blocked by one concrete P0.**

The code/docs surface is mostly aligned for v0.1: single-file Python, hash-locked dependencies, private encrypted app secrets, public/private access, CLI, and MCP. The score is capped below 80 because a rendered production app page still exposes a self-host Docker/BYOK claim that is outside the v0.1 launch contract and violates the checklist exit criterion that unsupported product claims are absent from UI/docs/MCP/CLI.

## P0 Blockers

### P0-1 - Rendered app page overpromises unsupported self-host Docker/BYOK distribution

Evidence:

- Source contains the unsupported card in `src/app/p/[slug]/AppPermalinkPage.tsx:1548`: `Self-host`.
- Source contains the unsupported claim in `src/app/p/[slug]/AppPermalinkPage.tsx:1552`: `One Docker command. Bring your own API key. Yours forever.`
- Source contains the unsupported command in `src/app/p/[slug]/AppPermalinkPage.tsx:1555`: `docker run -e GEMINI_BYOK=$KEY -p 3000:3000 ghcr.io/floomhq/${app.slug}:latest`.
- Browser-rendered production evidence from Chrome CDP on `https://floom.dev/p/meeting-action-items`, Source tab: page text includes `SELF-HOST`, `One Docker command. Bring your own API key. Yours forever.`, and `ghcr.io/floomhq/meeting-action-items:latest`.
- Screenshot evidence: `/tmp/floom-audit-e-source-tab.png`.

Why this is P0:

- `docs/launch-readiness-checklist.md:137` makes unsupported product claims in UI/docs/MCP/CLI a launch exit criterion.
- `docs/launch-env-auth-map.md:109-116`, `src/lib/mcp/tools.ts:407-430`, and `src/app/docs/page.tsx:213-216` scope v0.1 away from broad app hosting, arbitrary servers, and post-v0 app shapes.
- I found no code path in the audited route handlers, CLI scripts, or MCP tools that builds, publishes, or validates per-app Docker images at `ghcr.io/floomhq/<slug>:latest`.

Required fix before launch: remove or gate the self-host card from the v0.1 public app page until the Docker/BYOK distribution path has an implemented, tested, and documented release path.

## PR #11 Batch Decision

**Do not batch PR #11.**

Verified with `gh pr view 11 --json ...`:

- PR: `https://github.com/floomhq/floom-minimal/pull/11`
- State: `OPEN`
- Head: `feat/ui-launch-and-floom-quality`
- Base: `main`
- `mergeable`: `CONFLICTING`
- `mergeStateStatus`: `DIRTY`
- Changed files: `94`
- Diff size: `14,217` additions, `691` deletions
- Touched launch-sensitive areas include `src/lib/mcp/tools.ts`, `src/app/p/[slug]/AppPermalinkPage.tsx`, docs, package files, migrations, templates, and broad UI surfaces.

This confirms `docs/launch-env-auth-map.md:120-125`: PR #11 needs a separate rebase/merge-update and launch-gate rerun.

## Adversarial Findings That Are Not P0 Blockers

- `docs/launch-readiness-checklist.md:102-104` still says `main` push and deploy are pending. Local git reports `main` at `41db43b` tracking `origin/main`, and production `HEAD` probes for `/`, `/docs`, `/legal`, and `/mcp` returned `200`. This is stale checklist status, not a product-code blocker.
- `docs/launch-readiness-checklist.md:84` says invalid bearer fails instead of downgrading to anonymous. The run route enforces this at `src/app/api/apps/[slug]/run/route.ts:88-93`. Public metadata remains public even with an invalid bearer: `GET https://floom.dev/api/apps/meeting-action-items` with `Authorization: Bearer definitely-invalid-audit-token` returned `200`, matching anonymous metadata. This is a checklist precision gap, not an access-control bypass, because the app is public.
- The local `cli/deploy.ts` and `cli/secrets.ts` scripts are thinner than the published CLI, but the published package matches the launch docs for the checked commands. `npm view @floomhq/cli version bin --json` returned `0.2.16` with bin `floom`, and `npx -y @floomhq/cli@latest --help`, `deploy --help`, `auth login --help`, `init --help`, and `secrets --help` exposed the documented v0.1 commands.
- YAML/config guidance is consistent across parser and docs for the audited v0.1 keys. `parseManifest` rejects post-v0.1 fields (`actions`, `visibility`, `manifest_version`, `secrets_needed`, `openapi_spec_url`) and accepts only file-path schema references and `dependencies.python: ./requirements.txt`.
- Dependency and secret controls have code support: hash-locked exact pins are enforced in `src/lib/floom/requirements.ts`, secret names are validated and encrypted with AES-256-GCM in `src/lib/floom/runtime-secrets.ts`, public secret-backed publish is rejected in `src/app/api/apps/route.ts:84-89`, and secret runtime executes without internet when secrets are present in `src/lib/e2b/runner.ts:76-79`.

## Verification Run

Read-only checks run:

- `git status --short && git branch --show-current`
- `bash /root/.claude/skills/agents/scripts/scan.sh floom`
- `npm run typecheck` - passed
- `npm test` - passed; fake mode returned the expected fake-run output
- `npm run lint` - passed with 18 warnings, 0 errors
- `npm audit --omit=dev --audit-level=moderate` - `found 0 vulnerabilities`
- `npm view @floomhq/cli version bin --json` - `0.2.16`, bin `floom`
- `npx -y @floomhq/cli@latest --version` - `0.2.16`
- `npx -y @floomhq/cli@latest --help`
- `npx -y @floomhq/cli@latest deploy --help`
- `npx -y @floomhq/cli@latest auth login --help`
- `npx -y @floomhq/cli@latest init --help`
- `npx -y @floomhq/cli@latest secrets --help`
- `curl -fsS https://floom.dev/mcp` - descriptor returned `https://floom.dev/mcp`
- `curl -fsS https://floom.dev/mcp` JSON-RPC `tools/list` - returned the 9 documented tools and no `create_agent_token`
- `curl -I -sS https://floom.dev/ https://floom.dev/docs https://floom.dev/legal` - all returned `200`
- Chrome CDP render check of `https://floom.dev/p/meeting-action-items` Source tab - verified the unsupported self-host claim is visible
- `gh pr view 11 --json ...` - verified PR #11 is conflicting/dirty

## Self-Audit Statement

I performed the required self-audit for this documentation-only run: inspected the named docs/code paths, traced the launch claims to implementation, ran typecheck/test/lint/audit and production read-only probes, verified the rendered UI claim with a browser screenshot, checked PR #11 merge state, and confirmed the final diff only adds this audit file.

## Coordinator Resolution

Fixed after this audit by replacing the public app page Source tab self-host Docker/BYOK card with v0.1-safe `floom.yaml` and HTTP API guidance.

Resolution commit: `40971f5`.

Post-fix evidence:

- source grep has no `ghcr`, `GEMINI_BYOK`, `Self-host`, `One Docker command`, or `floom.json` in `src/app/p/[slug]/AppPermalinkPage.tsx`
- typecheck, test, lint, and build passed
- production `/p/meeting-action-items` Source tab renders `Spec (floom.yaml)` and HTTP API guidance, not Docker/BYOK copy
- screenshot: `/tmp/floom-source-tab-v01-safe.png`
- screenshot sha256: `b45027f41dc36749d2c13b431e15e2c667373f6cabd80abc3e83106a71526102`
