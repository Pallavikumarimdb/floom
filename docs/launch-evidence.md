# Launch Evidence

Public repo policy: keep reusable launch gates and sanitized summaries here, not raw session logs.

Public artifacts kept in this repo:

- `docs/launch-readiness-checklist.md`
- `docs/architecture-v0.md`
- `docs/quality-bar.md`
- product-facing docs under `src/app/docs`

Internal evidence moved out of the public repo:

- dated session logs
- raw QA run logs
- screenshots
- one-off verification notes
- provider/env/debug notes
- operator browser handoff notes
- deployment origin and provider configuration maps

Internal evidence lives in the private Floom internal repository/evidence store.

Before making this repo public, run:

```bash
git ls-files docs/qa-runs docs/*session* docs/*verification* docs/*.png docs/ui-screenshots-* docs/launch-readiness-2026-*.md
```

That command must return no tracked raw evidence files.
