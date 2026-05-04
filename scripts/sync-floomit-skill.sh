#!/usr/bin/env bash
# Sync the floomit skill to all consumer locations on Federico's Mac.
# Run from the floom-minimal repo root after updating skills/floomit/SKILL.md.
set -e

SOURCE="$(cd "$(dirname "$0")/.." && pwd)/skills/floomit/SKILL.md"

if [[ ! -f "$SOURCE" ]]; then
  echo "ERROR: Source not found: $SOURCE" >&2
  exit 1
fi

ssh mac "mkdir -p ~/.codex/skills/floomit ~/.claude/skills/floomit"
scp "$SOURCE" mac:~/.codex/skills/floomit/SKILL.md
scp "$SOURCE" mac:~/.claude/skills/floomit/SKILL.md
echo "Synced floomit skill to Mac (~/.codex/skills/floomit/, ~/.claude/skills/floomit/)"

# Remove the old outdated 'floom' skill on Mac to prevent confusion
ssh mac "rm -rf ~/.codex/skills/floom ~/.claude/skills/floom 2>/dev/null || true"
echo "Removed outdated 'floom' skill (use 'floomit' going forward)"
