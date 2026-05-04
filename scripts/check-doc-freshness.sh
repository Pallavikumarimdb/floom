#!/usr/bin/env bash
# check-doc-freshness.sh
# Greps public-facing files for known-stale strings. Exits 1 if any found.
#
# To add a new stale pattern:
#   1. Add a line to STALE_PATTERNS: "id|description|regex"
#   2. If a specific file or line context should be exempt, add to EXEMPT_FILES or use
#      line-level EXEMPT_CONTEXT entries below the main loop.
#   3. Run: npm run check-doc-freshness
#   4. Commit with: "docs(freshness): catch <pattern>"

set -euo pipefail

# ---------------------------------------------------------------------------
# Public-facing file set: root-level docs + skills + llms routes + /docs/**
# Explicit exclusions: spec docs that discuss v0.x historically are allowed to
# mention version numbers in that retrospective context.
# ---------------------------------------------------------------------------
PUBLIC_FILES=$(git ls-files | grep -E \
  "^(README|LICENSE|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY|SUPPORT|CHANGELOG|AGENTS|CLAUDE)\.(md|txt)$|^docs/|^skills/|^src/app/llms" \
  | grep -v "node_modules" \
  | grep -v "^docs/v0\.x-" \
  | grep -v "^docs/architecture-v0\." \
  | grep -v "^docs/runtime-versioning-roadmap-brief\." \
  | grep -v "^docs/post-v0-templates/" \
  || true)

# ---------------------------------------------------------------------------
# Stale patterns: "id|description|grep_regex"
# Each pattern describes something that should NEVER appear in current
# public-facing copy as an active/current claim.
# ---------------------------------------------------------------------------
declare -a STALE_PATTERNS=(
  # "Floom v0.1/v0.2/v0.3" as product branding — these are superseded by v0.4.
  # Pattern does NOT fire on "Floom v0.4" (current version).
  # Intentionally excluded: spec docs under docs/v0.x-* and docs/architecture-v0.*
  # which discuss legacy versions in retrospective context (excluded from file set above).
  "floom_version_brand|obsolete 'Floom v0.1/v0.2/v0.3' used as current product branding|Floom v0\.[0-3]"
  # "Current v0.1/v0.2/v0.3" language (active claim about an old version)
  "current_v0x|'Current v0.1/v0.2/v0.3' active claim (stale — current version is v0.4)|[Cc]urrent v0\.[0-3]"
  # stale repo URL that was the pre-public working name
  "old_repo_minimal|stale floomhq/floom-minimal repo reference|floomhq/floom-minimal"
  # stale preview deployment URLs from pre-launch
  "old_deploy_60sec|stale floom-60sec.vercel.app deployment URL|floom-60sec\.vercel\.app"
  # personal email should never appear in public files
  "personal_email_depon|personal email depontefede@gmail.com leaked|depontefede@gmail\.com"
  # personal repo reference
  "personal_repo_openblog|personal repo federicodeponte/openblog|federicodeponte/openblog"
  # internal filesystem paths
  "internal_path_users|/Users/federicodeponte internal path leaked|/Users/federicodeponte"
  # internal hostname
  "internal_ax41_host|ax41.openpaper internal hostname leaked|ax41\.openpaper"
)

# ---------------------------------------------------------------------------
# Per-file exemptions: files allowed to contain specific pattern IDs
# Format: "file_path:pattern_id"
# Use when a file has a legitimate reason to reference something
# (e.g., CHANGELOG mentions old deploy URL for historical record).
# ---------------------------------------------------------------------------
declare -a FILE_EXEMPTIONS=(
  # CHANGELOG documents history — old URLs in release notes are OK
  "CHANGELOG.md:old_deploy_60sec"
  "CHANGELOG.md:old_repo_minimal"
  # CONTRIBUTING.md and SKILL.md document the gate itself — the "how to fix" text
  # intentionally contains the stale-string examples as illustrative copy.
  "CONTRIBUTING.md:floom_version_brand"
  "CONTRIBUTING.md:old_repo_minimal"
  "skills/floomit/SKILL.md:floom_version_brand"
  "skills/floomit/SKILL.md:old_repo_minimal"
)

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
EXIT_CODE=0

for pattern_spec in "${STALE_PATTERNS[@]}"; do
  IFS='|' read -r id desc regex <<< "$pattern_spec"

  pattern_hit=0
  for file in $PUBLIC_FILES; do
    [ -f "$file" ] || continue

    # Check if this file+pattern combination is exempt
    exempt=0
    for exemption in "${FILE_EXEMPTIONS[@]}"; do
      exempt_file="${exemption%%:*}"
      exempt_id="${exemption##*:}"
      if [ "$file" = "$exempt_file" ] && [ "$id" = "$exempt_id" ]; then
        exempt=1
        break
      fi
    done
    [ "$exempt" -eq 1 ] && continue

    matches=$(grep -nE "$regex" "$file" 2>/dev/null || true)
    if [ -n "$matches" ]; then
      pattern_hit=1
      EXIT_CODE=1
      echo ""
      echo "DOC-FRESHNESS FAIL: $id"
      echo "  Description: $desc"
      echo "  File: $file"
      echo "$matches" | while IFS= read -r line; do
        echo "    $line"
      done
    fi
  done
done

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "✓ Doc freshness check passed — no stale strings in public-facing files"
else
  echo "Doc freshness check FAILED — fix the stale strings above before merging"
  echo "Run locally: npm run check-doc-freshness"
fi

exit $EXIT_CODE
