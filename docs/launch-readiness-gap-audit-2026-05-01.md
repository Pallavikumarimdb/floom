# Launch Readiness Checklist Gap Audit - 2026-05-01

Audited file: `docs/launch-readiness-checklist.md`

Initial checklist score: `74/100`

Reason: the checklist covered the core v0.1 implementation path, but it still allowed too much ambiguity around the user experience, external-provider setup, evidence format, and repeated independent verification.

## Minimum Gaps Found

1. No stopwatch gate proves the launch claim actually completes in 60 seconds after auth/token setup.
2. No first-run intuition gate proves a new user understands what to do without coordinator explanation.
3. No check that `npx @floomhq/cli@latest setup` writes a clean config pointing at `https://floom.dev`.
4. No full template matrix; one template can pass while another documented template is broken.
5. No API automation gate for n8n/Zapier/curl-style bearer-token usage.
6. No explicit YAML/config contract table with valid and invalid examples tied to test evidence.
7. No full negative matrix for unsupported app types beyond a single FastAPI/OpenAPI mention.
8. No dependency security matrix beyond pinned/hashed basics: missing file, wrong hash, unpinned transitive case, import failure, install timeout.
9. No database-level encrypted-secret evidence requiring ciphertext differs from plaintext and RLS blocks non-owner reads.
10. No DNS/proxy/OAuth callback drift gate for Cloudflare, AX41 nginx, Vercel alias, and Supabase redirect interactions.
11. No 502 regression test for Google OAuth after large auth cookies.
12. No evidence format requirement that every QA run logs commands, slugs, execution ids, screenshots, cleanup, and secret scan result.
13. No cleanup accountability requiring all QA-created apps/tokens/users/secrets to be deleted or tracked.
14. No a11y and keyboard-only gate for login, token creation, app run, docs, and legal.
15. No multi-browser gate for Chrome/Safari/WebKit/Firefox-class rendering.
16. No status/observability gate for production error capture, health endpoint, and deploy rollback.
17. No SEO/social preview gate for `/`, `/p/:slug`, OpenGraph images, sitemap, robots, canonical URLs.
18. No explicit PR sequencing gate proving PR #11 is rebased and re-audited after v0.1.
19. No branch/readiness map for v0.2/v0.3 add-ons, creating confusion around TypeScript, Java, FastAPI/OpenAPI, and multi-file scope.
20. No operator handoff gate covering what the next agent can safely do with browser/CDP, Supabase, Vercel, Cloudflare, and Gmail.

## Checklist Score After Required Patch

Target score: `100/100` as a checklist artifact once every gap above maps to an explicit gate with evidence requirements.

Product launch readiness remains separate: the product is not `100/100` until those gates are executed and all P0 rows pass on production.
