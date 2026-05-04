#!/usr/bin/env bash
# virgin-kimi-walk.sh — Kimi-driven UX gate for Floom virgin onboarding
#
# Usage:
#   bash scripts/virgin-kimi-walk.sh [BASE_URL]
#
# BASE_URL defaults to https://floom.dev
#
# Exit codes:
#   0 — PASS  (Kimi completed the journey end-to-end)
#   1 — FAIL  (Kimi hit blockers / could not complete)
#   2 — AMBIGUOUS (Kimi output doesn't clearly signal pass or fail — manual review needed)
#
# Full Kimi output saved to /tmp/virgin-kimi-<timestamp>.txt
#
# Why Kimi (not Sonnet):
#   Per Federico's memory rule (feedback_kimi_for_audits_too): Kimi is the
#   default reviewer for audits because (a) cheaper, (b) "more stupid" so
#   it catches issues smarter models pattern-match past.

set -euo pipefail

BASE_URL="${1:-https://floom.dev}"
RUN_ID="$(date +%s)"
OUTPUT_FILE="/tmp/virgin-kimi-${RUN_ID}.txt"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== Kimi virgin walk: $BASE_URL ===" >&2
echo "Output: $OUTPUT_FILE" >&2
echo "" >&2

# Check kimi-agent is available
if ! command -v kimi-agent >/dev/null 2>&1 && [ ! -x "${HOME}/.local/bin/kimi-agent" ]; then
  echo -e "${RED}ERROR${NC}: kimi-agent not found. Install with: uv tool install kimi-cli" >&2
  exit 1
fi
KIMI_CMD="${HOME}/.local/bin/kimi-agent"
command -v kimi-agent >/dev/null 2>&1 && KIMI_CMD="kimi-agent"

# Read the floomit skill to give Kimi accurate current-state docs.
# This lives at the canonical URL published from the repo.
SKILL_URL="${BASE_URL}/skills/floomit"

PROMPT="You are a brand new Floom user. You have never used Floom before.
You just discovered Floom at ${BASE_URL}.

Your goal: deploy a hello-world Python app on Floom and run it.

Before you start, read the Floom skill document at: ${SKILL_URL}
That document is the single source of truth for the current CLI, manifest format, secrets, and Composio integration.

Walk through these steps in order. For each step:
- State what you read (URL or doc section)
- State the exact command or action you would take
- Report any confusion, missing info, or contradiction you hit
- Rate confidence 1-5 that the docs gave you everything you need for that step

Steps:
1. Visit ${BASE_URL} and find the getting-started docs.
2. Read the quickstart. What is the first command a new user runs?
3. Install the CLI. Quote the exact install command from the docs.
4. Authenticate. Describe the auth flow (no actual browser needed — just describe what the docs say to do).
5. Scaffold a new Python hello-world app. Quote the scaffold command and the resulting manifest.
6. Read the manifest. Explain what each field does. Flag any field that is undocumented or confusing.
7. Deploy the app. Quote the exact deploy command.
8. Run the app. Quote the exact run command and describe what you expect back.
9. Set a per-runner secret. Describe the manifest change and CLI command.
10. Use Composio to call Gmail: find what manifest field to add and what value to use.

After all steps, write a SUMMARY section:
- ONE sentence on whether you could complete the full journey end-to-end (start with 'I could complete' or 'I could not complete')
- Top 3 specific doc/CLI/UX gaps you hit (be concrete: quote the confusing line or the missing step)
- Confidence score 1-10 that a real non-technical user could succeed unaided

Be specific. Quote URLs and exact command strings from the docs. Do not speculate about what the docs might say — only report what you actually read."

echo "Running Kimi virgin walk (this takes ~30-60 seconds)..." >&2
"$KIMI_CMD" "$PROMPT" 2>&1 | tee "$OUTPUT_FILE"

echo "" >&2
echo "--- Parsing verdict ---" >&2

# Determine verdict from Kimi output
PASS_SIGNAL=$(grep -ci "I could complete\|completed.*end-to-end\|journey.*complete\|finish.*journey\|succeeded.*deploy" "$OUTPUT_FILE" 2>/dev/null || true)
FAIL_SIGNAL=$(grep -ci "I could not complete\|could not deploy\|stuck\|cannot proceed\|could not finish\|blocked\|abandoned\|no install command\|not found in docs\|missing.*command\|undocumented" "$OUTPUT_FILE" 2>/dev/null || true)

if [ "$PASS_SIGNAL" -gt 0 ] && [ "$FAIL_SIGNAL" -eq 0 ]; then
  echo ""
  echo -e "${GREEN}=== KIMI VIRGIN WALK: PASS ===${NC}"
  echo "Full output: $OUTPUT_FILE"
  exit 0
elif [ "$FAIL_SIGNAL" -gt "$PASS_SIGNAL" ]; then
  echo ""
  echo -e "${RED}=== KIMI VIRGIN WALK: FAIL ===${NC}"
  echo "Full output: $OUTPUT_FILE"
  echo ""
  echo "--- Top findings (grep for key signals) ---"
  grep -i "confusion\|gap\|missing\|broken\|error\|cannot\|could not\|unclear\|undocumented" "$OUTPUT_FILE" | head -15 || true
  exit 1
else
  echo ""
  echo -e "${YELLOW}=== KIMI VIRGIN WALK: AMBIGUOUS — manual review needed ===${NC}"
  echo "Full output: $OUTPUT_FILE"
  echo ""
  echo "Pass signals: $PASS_SIGNAL  Fail signals: $FAIL_SIGNAL"
  echo "Review $OUTPUT_FILE and triage manually."
  exit 2
fi
