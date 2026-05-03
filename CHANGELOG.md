## v0.x — Stock-E2B mode

Floom is now a thin wrapper on top of E2B. Drop the runtime constraints
that v0.1 enforced; let agents ship anything that runs on stock E2B base.

### Added
- Multi-file Python projects (tarball bundle, multi-file imports work natively)
- Node.js / TypeScript / Bun / any runtime E2B base supports
- `command: <shell>` field in floom.yaml (auto-detect if omitted)
- Optional `output_schema` (run-only / cron-shaped apps now valid)
- Per-app E2B-minute quota (30 min/day default, lifts the implicit "narrow contract" cost cap)
- Per-owner E2B-hour quota (2 hr/day default)
- Auto-bundle-exclude defaults (node_modules, .git, etc.)
- Stock E2B sandbox: same `base` template, no per-app builds

### Changed
- `requirements.txt` no longer requires `--require-hashes` (still supported as opt-in)
- Bundle format: gzipped tarball (was: single file). `bundle_kind` column tracks both for backwards compat.

### Backwards compatible
- v0.1 contract still works unchanged. Apps published with the strict shape
  keep running. Validator accepts both shapes.

### Known limits
- Sync only — runs cap at 60s on Vercel Hobby. Long-running runs need
  capability G (async + poll), shipping separately.
- Stock-E2B mode is wider than v0.1's curated contract. Apps that abuse
  E2B-minute quotas are auto-rate-limited; persistent abusers may be
  suspended per ToS.
