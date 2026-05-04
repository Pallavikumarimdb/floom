<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Floom skill (canonical)

`skills/floomit/SKILL.md` is the single source of truth for what Floom v0.X currently supports: manifest format, CLI, secrets, Composio, run paths, quotas, and sandbox limits. Update this file whenever shipping any feature that changes user-visible behavior.

Auto-synced to:
- `~/.codex/skills/floomit/SKILL.md` on Federico's Mac (Codex/Kimi)
- `~/.claude/skills/floomit/SKILL.md` on Federico's Mac (Claude Code)
- `https://floom.dev/skills/floomit` (public, fetchable by any agent)

After updating `skills/floomit/SKILL.md`, run:

```bash
bash scripts/sync-floomit-skill.sh
```

The CI gate `npm run check-floomit-skill` validates that `last_synced` matches today's date and that `version` is a valid semver. This runs on any PR touching `skills/floomit/SKILL.md`.
