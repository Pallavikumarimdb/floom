# Contributing

Floom is in active development. We welcome bug reports and focused fixes across:

- browser-authorized CLI setup
- single-file Python app publishing
- exact-pinned Python dependencies
- encrypted app secrets
- browser, REST API, and MCP runs

Please keep reports factual and reproducible. Include the command, URL, expected
result, actual result, and any sanitized logs. Do not include raw tokens, API
keys, Supabase service-role keys, cookies, or private app secrets.

For code changes, keep the patch narrow and run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Doc freshness

CI runs `scripts/check-doc-freshness.sh` on every PR and push to `main`. It
blocks merges that introduce stale strings into public-facing files.

Run locally before pushing:

```bash
npm run check-doc-freshness
```

If the check fails, it will print the file, line number, and pattern that
triggered. Common causes:

- Version references — `Floom v0.1`, `v0.2`, `v0.3` should not appear as
  current branding; the current version is reflected in `skills/floomit/SKILL.md`.
  Retrospective context in spec docs under `docs/v0.x-*` is exempt.
- Stale repo URLs — use `floomhq/floom`, not `floomhq/floom-minimal`.
- Personal email or internal paths — these should never appear in tracked files.

To add a new stale pattern, edit `STALE_PATTERNS` in
`scripts/check-doc-freshness.sh` and commit with:
`docs(freshness): catch <pattern-id>`
