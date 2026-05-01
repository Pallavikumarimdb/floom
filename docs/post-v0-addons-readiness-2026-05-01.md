# Post-v0 Add-on Readiness - 2026-05-01

This document records the independent read-only audits for add-on features that
remain outside the locked v0 launch claim:

> from localhost to live and secure in 60sec

The launch claim stays scoped to one stdlib Python file, `floom.yaml`, JSON
Schema input/output, agent-token publish, browser/API/MCP run, Supabase, and E2B.

## Summary

| Track | Ref / source | Readiness | Merge status | Current decision |
| --- | --- | ---: | --- | --- |
| v0.1 dependencies + encrypted app secrets | `origin/v0.1-hardening-main` at `999b8b7` | 55/100 | Open PR #3 | Keep preparing, do not merge into v0 launch |
| v0.1 dependencies + env secret prototype | `origin/v0.1-deps-secrets` at `c7b4559` | superseded | Unmerged branch | Superseded by hardening branch for encrypted storage |
| v0.2 multi-file Python bundles | `origin/v0.2-multi-file-bundles` at `95463b9` | 58/100 | Unmerged branch | Rebase and harden as add-on after v0 |
| v0.3 FastAPI/OpenAPI HTTP apps | `origin/v0.3-openapi-http-apps` at `4c21f8d` | 38/100 | Unmerged branch | Prototype only |
| Node/TypeScript hosted apps | `/tmp/floom-main` full Floom line | 55/100 | Separate product line | Extract later behind a runtime adapter |
| Java | Not found | 0/100 | No code found | New feature, not a reactivation |
| Go/Rust/PHP/Ruby | Detector/provider fragments only | 15-25/100 | Not wired | Not product support |

## v0.1 Dependencies + Encrypted Secrets

Verified branch: `origin/v0.1-hardening-main`.

What exists:

- `requirements.txt` support with constraints and tests.
- `secrets: ["NAME"]` manifest support for secret names only.
- `app_secrets` table with `value_ciphertext`, not plaintext.
- AES-256-GCM encryption via `FLOOM_SECRET_ENCRYPTION_KEY`.
- Metadata-only secret API at `/api/apps/:slug/secrets`.
- CLI secret helper at `cli/secrets.ts`.
- Server-side decrypt and E2B runtime env injection.
- RLS policy blocks direct reads of `app_secrets`.
- Live gate script covers secret set/list/delete, private run, REST/MCP run, and ciphertext evidence.

Important distinction:

- Current production main rejects app secrets, so the unencrypted-at-rest risk is avoided in v0 by not accepting user app secrets.
- Encrypted app-secret storage exists on PR #3, but it is not deployed to production.
- `origin/v0.1-deps-secrets` stores secret names and resolves values from server env; it is not the encrypted storage implementation.

Main gaps before merge:

- Rebase onto current main without losing launch hardening.
- Re-run local and live v0.1 gate after rebase.
- Verify `FLOOM_SECRET_ENCRYPTION_KEY` exists only in production env, not repo or logs.
- Confirm secret route responses never include values.
- Confirm migrated `app_secrets` rows cannot be selected by anon/owner clients directly.

## v0.2 Multi-file Python Bundles

Verified branch: `origin/v0.2-multi-file-bundles`.

What exists:

- CLI tar creation.
- API upload validation.
- Storage suffixing as `*-bundle.tar`.
- Run-route bundle detection.
- E2B tar extraction.
- Safe Python path validation.
- Size limits, docs, fixtures, and fake-run tests.

Verified branch-local checks:

- `npm ci`: pass, 0 vulnerabilities reported.
- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: pass, fake mode only.
- `npm run build`: pass.
- `git diff --check origin/main...HEAD`: pass.

Gaps before merge:

- Rebase conflicts against current main in:
  - `scripts/test-fake-run.mjs`
  - `src/app/api/apps/[slug]/run/route.ts`
  - `src/app/docs/page.tsx`
  - `src/lib/floom/manifest.ts`
- Preserve launch hardening during rebase.
- Keep v0 contract stable and expose v0.2 as additive/versioned behavior.
- Add explicit persisted bundle kind instead of inferring from `.tar`.
- Extend MCP publish path for multi-file bundles.
- Add real E2B tar execution coverage.
- Reject duplicate tar paths and add checksum validation.

## v0.3 FastAPI/OpenAPI HTTP Apps

Verified branch: `origin/v0.3-openapi-http-apps`.

What exists:

- `src/lib/floom/http-app.ts` parser/validator for `mode: http_openapi`.
- `src/lib/e2b/http-runner.ts` fake-mode HTTP runner behind `FLOOM_ENABLE_HTTP_APPS=1`.
- FastAPI fixture and design doc.
- Branch-local `typecheck`, `lint`, `test`, and `build` pass after installing dependencies.

What is not wired:

- `POST /api/apps`
- `GET /api/apps/:slug`
- `POST /api/apps/:slug/run`
- CLI deploy
- MCP publish/run
- UI operation selector
- Supabase migrations

Gaps before merge:

- Add schema fields for app mode, HTTP bundle metadata, start command, port, health path, OpenAPI path, dependencies, and secret names.
- Add multi-file bundle upload/storage first or as part of this feature.
- Map OpenAPI operations to an allowlisted action, never arbitrary caller-provided paths.
- Add UI forms per operation.
- Add real E2B FastAPI smoke coverage.
- Add `$ref`/`components` handling.
- Add dependency install security, secret injection, log redaction, and retention rules.

## Language Support

Verified across `/tmp/floom-main-post-analytics`, `/tmp/floom-main`, remote refs,
and obvious `/tmp/floom-*` scratch worktrees.

Python:

- v0 single-file is mainline and verified.
- deps/secrets, multi-file, and HTTP/OpenAPI are branch prototypes.

Node/TypeScript:

- Full Floom has runtime pieces: `runtime: "node"`, Docker build/run paths, and entrypoint discovery for `app.ts`, `app.mjs`, `app.js`, `index.ts`, `index.mjs`, `index.js`.
- Minimal v0 rejects non-Python runtimes.
- Product support still needs fixtures, publish validation, execution tests, docs, MCP contract, and UI support.

Java:

- No Java runtime code was found.
- No `.java`, `pom.xml`, `build.gradle`, `build.gradle.kts`, or `gradlew` implementation evidence was found in the audited Floom paths.
- Java is a new feature track, not stale code to revive.

Go/Rust/PHP/Ruby:

- Only detector/provider fragments exist.
- They are not wired into minimal publish/run or the launch MCP contract.

## Integration Order

1. Finish and stabilize v0 launch on the final domain.
2. Rebase and harden PR #3 for dependencies plus encrypted app secrets.
3. Prepare v0.2 multi-file bundles as an additive manifest version.
4. Build HTTP/OpenAPI/FastAPI on top of multi-file bundles and secret storage.
5. Extract Node/TypeScript support from full Floom behind the same runtime adapter interface.
6. Treat Java as a fresh runtime project.

## Non-negotiable Gates

Each add-on must pass before merge:

- Local typecheck, lint, unit/fake tests, build, and diff whitespace.
- Real E2B execution for the new runtime mode.
- API, browser, CLI, and MCP parity.
- Public/private access tests.
- Invalid token and revoked token tests.
- Secret leak scan.
- Rollback/cleanup evidence for live test rows, bundles, tokens, and users.
