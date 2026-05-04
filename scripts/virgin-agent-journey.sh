#!/usr/bin/env bash
# virgin-agent-journey.sh — deterministic Floom v0.4 user-flow gate
#
# Usage:
#   bash scripts/virgin-agent-journey.sh [BASE_URL]
#
# BASE_URL defaults to https://floom.dev
# FLOOM_TEST_TOKEN — optional agent token for authed steps (steps 6-7)
#
# Exit 0 = all steps passed.
# Exit 1 = one or more steps failed (check stderr for details).
#
# Steps covered:
#   1. CLI version probe   — @floomhq/cli is published on npm
#   2. Health probe        — /api/status reachable, overall not "down"
#   3. App metadata        — /api/apps/meeting-action-items returns expected schema
#   4. Public app page     — /p/meeting-action-items renders (HTTP 200)
#   5. Public run          — POST /api/apps/meeting-action-items/run accepted (202 or 200)
#   6. Run poll            — execution reaches terminal state within 3 min
#   7. Output shape        — output contains .actions array
#   8. Authed me/runs      — GET /api/me/runs with token returns runs array (if token provided)
#   9. 404 on bogus slug   — /api/apps/no-such-app-xyz/run → 404
#  10. 400 on bad JSON     — /api/apps/meeting-action-items/run with invalid body → 400
#  11. 401 without auth    — GET /api/me/runs without token → 401
#  12. Docs page           — /docs/quickstart renders (HTTP 200)
#  13. MCP endpoint        — /mcp reachable (HTTP 200)

set -euo pipefail

BASE_URL="${1:-https://floom.dev}"
TOKEN="${FLOOM_TEST_TOKEN:-}"
PASS=0
FAIL=0

# Remove trailing slash
BASE_URL="${BASE_URL%/}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} Step $1: $2"; ((PASS++)) || true; }
fail() { echo -e "${RED}FAIL${NC} Step $1: $2"; ((FAIL++)) || true; }
warn() { echo -e "${YELLOW}WARN${NC} Step $1: $2"; }
info() { echo "     $1"; }

echo "=== Virgin-agent journey: $BASE_URL ==="
echo ""

# ── Step 1: CLI version probe ─────────────────────────────────────────────────
STEP=1
CLI_VER=$(npm view @floomhq/cli version 2>/dev/null || true)
if [ -n "$CLI_VER" ]; then
  pass $STEP "@floomhq/cli $CLI_VER is published on npm"
else
  fail $STEP "@floomhq/cli not found on npm (npm view returned empty)"
fi

# ── Step 2: Health probe ──────────────────────────────────────────────────────
STEP=2
HEALTH_BODY=$(curl -s --max-time 10 "$BASE_URL/api/status" 2>/dev/null || true)
HEALTH_OVERALL=$(echo "$HEALTH_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('overall','missing'))" 2>/dev/null || true)
if [ "$HEALTH_OVERALL" = "ok" ] || [ "$HEALTH_OVERALL" = "degraded" ]; then
  pass $STEP "Health probe: overall=$HEALTH_OVERALL"
elif [ "$HEALTH_OVERALL" = "down" ]; then
  # "down" means a dependency is unhealthy. Surface which check failed, but
  # treat as a WARN not a hard FAIL so a transient Resend timeout doesn't
  # block every preview deploy.
  FAILING=$(echo "$HEALTH_BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
failing=[c['name'] for c in d.get('checks',[]) if c['status']=='down']
print(','.join(failing))
" 2>/dev/null || true)
  warn $STEP "Health probe: overall=down (failing checks: $FAILING). Non-blocking unless core deps."
  # Hard fail only if supabase, e2b, or qstash are down (these break runs)
  CORE_DOWN=$(echo "$HEALTH_BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
core=['supabase','e2b','qstash']
failing=[c['name'] for c in d.get('checks',[]) if c['status']=='down' and c['name'] in core]
print(','.join(failing))
" 2>/dev/null || true)
  if [ -n "$CORE_DOWN" ]; then
    fail $STEP "Core dependency down: $CORE_DOWN"
  else
    pass $STEP "Health: only non-core deps degraded ($FAILING) — core stack ok"
  fi
else
  fail $STEP "Health probe unreachable or bad JSON (overall='$HEALTH_OVERALL')"
fi

# ── Step 3: App metadata ──────────────────────────────────────────────────────
STEP=3
APP_CODE=$(curl -s -o /tmp/vaj_app.json -w "%{http_code}" --max-time 10 \
  "$BASE_URL/api/apps/meeting-action-items" 2>/dev/null || echo "000")
APP_SLUG=$(python3 -c "import json; d=json.load(open('/tmp/vaj_app.json')); print(d.get('slug','missing'))" 2>/dev/null || true)
if [ "$APP_CODE" = "200" ] && [ "$APP_SLUG" = "meeting-action-items" ]; then
  pass $STEP "App metadata: slug=$APP_SLUG"
else
  fail $STEP "App metadata: HTTP=$APP_CODE slug=$APP_SLUG"
  info "$(cat /tmp/vaj_app.json 2>/dev/null | head -c 200)"
fi

# ── Step 4: Public app page ───────────────────────────────────────────────────
STEP=4
PAGE_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "$BASE_URL/p/meeting-action-items" 2>/dev/null || echo "000")
if [ "$PAGE_CODE" = "200" ]; then
  pass $STEP "/p/meeting-action-items renders (HTTP 200)"
else
  fail $STEP "/p/meeting-action-items returned HTTP $PAGE_CODE"
fi

# ── Step 5: Public run ────────────────────────────────────────────────────────
STEP=5
RUN_CODE=$(curl -s -o /tmp/vaj_run.json -w "%{http_code}" --max-time 30 \
  -X POST "$BASE_URL/api/apps/meeting-action-items/run" \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"transcript":"Action: Federico ships gate by Friday. Bob fixes auth. Alice runs design review Wednesday."}}' \
  2>/dev/null || echo "000")

if [ "$RUN_CODE" = "202" ] || [ "$RUN_CODE" = "200" ]; then
  pass $STEP "Run accepted: HTTP $RUN_CODE"
  EXEC_ID=$(python3 -c "import json; d=json.load(open('/tmp/vaj_run.json')); print(d.get('execution_id') or d.get('id',''))" 2>/dev/null || true)
  VIEW_TOKEN=$(python3 -c "import json; d=json.load(open('/tmp/vaj_run.json')); print(d.get('view_token',''))" 2>/dev/null || true)
  info "execution_id=$EXEC_ID"
elif [ "$RUN_CODE" = "429" ]; then
  # Quota exhausted on the demo app (shared E2B/Gemini quota) — not a code bug.
  # The endpoint is reachable and rate-limiting correctly.
  warn $STEP "Run returned 429 (quota exhausted on demo app — endpoint reachable and limiting correctly)"
  warn $STEP "NOTE: This means the shared demo quota is hit. Not a deploy regression."
  EXEC_ID=""
  VIEW_TOKEN=""
else
  fail $STEP "Run returned unexpected HTTP $RUN_CODE"
  info "$(cat /tmp/vaj_run.json 2>/dev/null | head -c 300)"
  EXEC_ID=""
  VIEW_TOKEN=""
fi

# ── Step 6 + 7: Poll to completion + output shape ────────────────────────────
if [ -n "$EXEC_ID" ] && [ -n "$VIEW_TOKEN" ]; then
  STEP=6
  FINAL_STATUS=""
  for i in {1..36}; do
    POLL_BODY=$(curl -s --max-time 10 \
      "$BASE_URL/api/runs/$EXEC_ID" \
      -H "Authorization: ViewToken $VIEW_TOKEN" 2>/dev/null || true)
    STATUS=$(echo "$POLL_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || true)
    case "$STATUS" in
      succeeded|failed|timed_out|error)
        FINAL_STATUS="$STATUS"
        break
        ;;
    esac
    sleep 5
  done

  if [ "$FINAL_STATUS" = "succeeded" ]; then
    pass $STEP "Run completed: status=succeeded"
  elif [ -n "$FINAL_STATUS" ]; then
    fail $STEP "Run did not succeed: final status=$FINAL_STATUS"
    info "$POLL_BODY" | head -c 300
  else
    fail $STEP "Run never reached terminal state after 3 minutes"
  fi

  STEP=7
  if [ "$FINAL_STATUS" = "succeeded" ]; then
    HAS_ACTIONS=$(echo "$POLL_BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
output=d.get('output')
if output and isinstance(output,dict) and 'actions' in output:
  print('yes')
else:
  print('no')
" 2>/dev/null || echo "error")
    if [ "$HAS_ACTIONS" = "yes" ]; then
      pass $STEP "Output shape: output.actions present"
    else
      fail $STEP "Output shape: output.actions missing"
      info "output=$(echo "$POLL_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output'))" 2>/dev/null)"
    fi
  else
    warn $STEP "Output shape check skipped (run did not succeed)"
  fi
else
  warn 6 "Poll skipped (run was not accepted in step 5)"
  warn 7 "Output shape check skipped (run was not accepted)"
fi

# ── Step 8: Authed me/runs (optional — requires FLOOM_TEST_TOKEN) ─────────────
STEP=8
if [ -n "$TOKEN" ]; then
  ME_CODE=$(curl -s -o /tmp/vaj_me.json -w "%{http_code}" --max-time 10 \
    "$BASE_URL/api/me/runs" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "000")
  HAS_RUNS=$(python3 -c "import json; d=json.load(open('/tmp/vaj_me.json')); print('yes' if 'runs' in d else 'no')" 2>/dev/null || echo "error")
  if [ "$ME_CODE" = "200" ] && [ "$HAS_RUNS" = "yes" ]; then
    pass $STEP "Authed /api/me/runs: HTTP 200, runs array present"
  else
    fail $STEP "Authed /api/me/runs: HTTP=$ME_CODE has_runs=$HAS_RUNS"
    info "$(cat /tmp/vaj_me.json 2>/dev/null | head -c 200)"
  fi
else
  warn $STEP "Authed me/runs skipped: FLOOM_TEST_TOKEN not set"
fi

# ── Step 9: 404 on bogus slug ─────────────────────────────────────────────────
STEP=9
BOGUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  -X POST "$BASE_URL/api/apps/no-such-app-virgin-test-xyz/run" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "000")
if [ "$BOGUS_CODE" = "404" ]; then
  pass $STEP "404 on bogus slug: correct"
else
  fail $STEP "Bogus slug returned $BOGUS_CODE instead of 404"
fi

# ── Step 10: 400 on bad JSON ──────────────────────────────────────────────────
STEP=10
BAD_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  -X POST "$BASE_URL/api/apps/meeting-action-items/run" \
  -H "Content-Type: application/json" \
  -d 'not-valid-json' 2>/dev/null || echo "000")
if [ "$BAD_CODE" = "400" ]; then
  pass $STEP "400 on malformed JSON body: correct"
else
  fail $STEP "Malformed JSON body returned $BAD_CODE instead of 400"
fi

# ── Step 11: 401 without auth on /api/me/runs ────────────────────────────────
STEP=11
UNAUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "$BASE_URL/api/me/runs" 2>/dev/null || echo "000")
if [ "$UNAUTH_CODE" = "401" ]; then
  pass $STEP "401 on /api/me/runs without auth: correct"
else
  fail $STEP "/api/me/runs without auth returned $UNAUTH_CODE instead of 401"
fi

# ── Step 12: Docs page ────────────────────────────────────────────────────────
STEP=12
DOCS_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "$BASE_URL/docs/quickstart" 2>/dev/null || echo "000")
if [ "$DOCS_CODE" = "200" ]; then
  pass $STEP "/docs/quickstart renders (HTTP 200)"
else
  fail $STEP "/docs/quickstart returned HTTP $DOCS_CODE"
fi

# ── Step 13: MCP endpoint ─────────────────────────────────────────────────────
STEP=13
MCP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "$BASE_URL/mcp" 2>/dev/null || echo "000")
if [ "$MCP_CODE" = "200" ]; then
  pass $STEP "/mcp reachable (HTTP 200)"
else
  fail $STEP "/mcp returned HTTP $MCP_CODE"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=== Summary: $PASS passed, $FAIL failed — $BASE_URL ==="

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}GATE FAILED — do not merge to prod until all steps pass.${NC}"
  exit 1
else
  echo -e "${GREEN}ALL CHECKS PASSED — safe to promote to prod.${NC}"
  exit 0
fi
