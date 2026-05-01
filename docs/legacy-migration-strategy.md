# Legacy → new floom migration strategy

After the rename (`floom-minimal` → `floom`, old `floom` → `floom-legacy`), there is years of work in `floom-legacy/` that's tempting to lift but mostly shouldn't be. This doc is the explicit "do this / don't do that" call so v0.x work moves fast without dragging legacy debt forward.

## TL;DR

- 🔴 **Don't lift architectural code.** Re-implement fresh in the new floom against the v0.1 stack.
- 🟢 **Do lift component-level UI / business-logic files.** They're framework-thin.
- 🟡 **Archive the rest read-only.** Stars + history preserved, code not deleted.

## Why most of legacy doesn't lift cleanly

The legacy floom monorepo was built against a different stack:

| Layer | floom-legacy | floom (new, v0.1) |
|---|---|---|
| Auth | Better Auth | Supabase Auth |
| DB schema | `apps` with extended columns + relations + workspaces | `apps` minimal v0.1 schema |
| Sandbox | own e2b adapter + Docker fallback | thinner e2b adapter, no Docker |
| MCP server | serves token-mint + workspace-aware tools | serves the v0.1 tool set, no token mint |
| Run path | proxy + multi-endpoint + streaming partials | one-shot single-action handler |
| Public surface | full marketplace UI | single-app launch surface |

Wholesale code transplant means re-mapping every Supabase Auth call to Better Auth, every schema reference to the legacy table shape, every sandbox call to the legacy abstraction. **That's days of integration debt + bug surface per capability.** Faster to read the legacy implementation as prior art and write fresh.

## Bucket 1: 🔴 DO NOT LIFT (re-implement fresh, use legacy as reference)

These are architectural and tangled with the legacy stack. Each v0.x branch should reference the legacy file paths in its spec doc, but write new code in the new floom that fits v0.1.

| Capability | Legacy reference | What to do |
|---|---|---|
| Multi-action / multi-endpoint runtime | `floom-legacy/apps/server/src/routes/apps/[slug]/[action]/run.ts` (paths approximate) | Read for shape; implement fresh against floom-minimal's `src/app/api/apps/[slug]/run/route.ts` |
| FastAPI proxy / OpenAPI ingest | `floom-legacy/apps/server/src/runtime/proxy.ts`, `floom-legacy/apps/server/src/runtime/openapi-ingest.ts` | Read for shape; new branch implements proxy in floom |
| Multi-file Python bundling | partial — `floom-legacy/apps/server/src/runtime/python-bundle.ts` | Read; floom needs its own implementation |
| TypeScript / Node runtime | `floom-legacy/apps/server/src/runtime/node-adapter.ts` (hollow there too) | Reference for sandbox commands; write floom's own |
| Streaming response handling | `floom-legacy/apps/server/src/runtime/stream.ts` (if exists) | Read for SSE shape; new floom implementation |
| Workspace / RBAC / multi-tenant | `floom-legacy/apps/server/src/routes/workspaces.ts` (~800 lines) | **Skip entirely.** Single-account model in v0.x. |
| Marketplace UI / app browser | `floom-legacy/apps/web/src/pages/AppsDirectoryPage.tsx` | **Skip.** Single-app surface for v0.1 launch. |

## Bucket 2: 🟢 LIFT (component-level, framework-thin)

These are mostly self-contained UI + lightweight business logic. They need a Supabase Auth swap (the only real change) and small style adaptations to the v11 CSS-variable system. Cleaner to lift than rewrite.

| Component | Legacy path | Effort | When |
|---|---|---|---|
| ForgotPasswordPage | `floom-legacy/apps/web/src/pages/ForgotPasswordPage.tsx` (278 lines) | <30 min after Supabase Auth swap | When dedicated /forgot-password page becomes priority (currently inline button works) |
| ResetPasswordPage | `floom-legacy/apps/web/src/pages/ResetPasswordPage.tsx` (396 lines) | <30 min | Pair with ForgotPassword |
| AppReviews component | `floom-legacy/apps/web/src/components/AppReviews.tsx` (448 lines) | medium — needs reviews API + table | Post-launch when reviews matter |
| Email templates (Resend wiring) | `floom-legacy/apps/server/src/lib/email.ts` (120 lines) | small — adapt to Supabase Auth's email hooks | Pair with SMTP fix (Codex issue #6) |
| Onboarding flags / confetti | `floom-legacy/apps/web/src/lib/onboarding.ts` | small | Post-launch UX polish |
| App-examples sample-input library | `floom-legacy/apps/web/src/lib/app-examples.ts` | small | Already partially in floom-minimal; consolidate |

**Lift each individually as the corresponding feature becomes a priority. Don't bulk-lift.**

## Bucket 3: 🟡 ARCHIVE (preserve, don't delete)

After the rename:
- `floomhq/floom-legacy` (formerly `floomhq/floom`) keeps its star count, fork graph, history, and contributors
- Mark `archived: true` in repo settings — read-only, no new issues / PRs
- README should be updated with a one-line pointer: "this is the legacy floom monorepo. Active development moved to [floomhq/floom](https://github.com/floomhq/floom). This repo is preserved for history and reference."
- Don't delete branches; don't delete the repo.

When? After:
1. v0.1 launch settles
2. CLI source migration decision is made (current recommendation in `docs/rename-briefing.md`: keep CLI in floom-legacy with updated `repository` field; migrate to floom in v0.2 if needed)
3. Anyone with open PRs on legacy is notified

## Per-capability workflow Codex follows

When Codex starts a v0.x branch (e.g. `feat/v0.x-multi-action`):

1. Spec doc: `docs/v0.x-multi-action-spec.md` includes:
   - Goal + done criteria
   - **Prior-art pointers**: explicit `floom-legacy/<path>` references to read before implementing
   - Contract diff (what changes in `get_app_contract`, what changes in MCP tool list)
   - Test plan
   - Rollout plan (template that uses it, /docs section, CHANGELOG entry)
2. Implementation lives entirely in the new `floom` repo. No `git remote add legacy`. No cherry-picks.
3. PR description references the legacy paths read so reviewers can compare approaches.
4. CHANGELOG line on merge: `v0.x — <capability> (port from floom-legacy/<file>)`.

## Post-launch sequencing (concrete)

This is the order Codex actually fires agents in, not the order of version numbers:

**Day 0 (launch day)**: nothing on this list; focus on launch.

**Day 1-3 (post-launch settle)**: monitor, fix anything that breaks, drop any data that surprises.

**Day 4 onward**: fire 3 parallel Codex agents:
- 🟦 `feat/v0.x-multi-action` — fastest, prior art is most complete in legacy. Estimated 5 days.
- 🟦 `feat/v0.x-node-runtime` (Node + JS together) — biggest TAM. Estimated 10 days.
- 🟦 `feat/v0.x-multi-file-python` — long-tail of "real" apps. Estimated 5 days. Independent of the other two.

First merge → v0.2. Second → v0.3. Third → v0.4.

**Day 14 onward (after first wave settles)**:
- 🟦 `feat/v0.x-streaming` — flagship for the v0.x demo
- 🟦 `feat/v0.x-fastapi-openapi` — power-user feature

**Constraints**:
- No more than 3 capability branches in flight at once. More than that and review velocity collapses.
- Each merge waits for: clean build, lint clean, real template using the capability, MCP `get_app_contract` updated, /docs section, CHANGELOG entry.
- Federico approves the order if priorities shift.

## What this is NOT

- Not a date commitment.
- Not a scope freeze on individual capabilities — Codex's spec docs are the contract.
- Not blocking the launch. v0.1 ships first; this all happens after.
