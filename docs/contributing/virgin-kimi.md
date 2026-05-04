# Kimi virgin walk gate

A second-tier gate alongside the [deterministic virgin-journey](virgin-journey.md).
Where the curl-based gate catches HTTP-level regressions, the Kimi walk catches
DX issues: doc confusion, broken onboarding flows, missing CLI commands,
undocumented manifest fields — things a real new user hits but curl can't.

## Why Kimi (not Sonnet)

Per Federico's memory rule (`feedback_kimi_for_audits_too`):

- Kimi is the default reviewer for audits + version review
- It's cheaper than Sonnet/Opus
- It's "more stupid" — which means it **catches issues smarter models pattern-match past**
- Federico 2026-05-04: "for virgin agents use kimi, not sonnet"

## How it works

`scripts/virgin-kimi-walk.sh` invokes `kimi-agent` with a virgin-user prompt.
Kimi is told it has never used Floom before and must walk through 10 steps:
find docs, install CLI, scaffold, deploy, run, set secrets, use Composio.

Kimi's narrative is parsed for pass/fail signals. Exit codes:

| Code | Verdict | Meaning |
|------|---------|---------|
| 0 | PASS | Kimi completed the journey end-to-end |
| 1 | FAIL | Kimi hit blockers / could not complete |
| 2 | AMBIGUOUS | Neither clear signal — manual review needed |

Full Kimi output saved to `/tmp/virgin-kimi-<timestamp>.txt` for triage.

## Running locally

```bash
# Against prod
bash scripts/virgin-kimi-walk.sh https://floom.dev

# Against a preview deploy
bash scripts/virgin-kimi-walk.sh https://floom-git-my-branch-floomhq.vercel.app

# Against localhost
bash scripts/virgin-kimi-walk.sh http://localhost:3000
```

Review output in `/tmp/virgin-kimi-<timestamp>.txt`.

## GitHub Actions

**`virgin-kimi.yml`** runs:
- Daily at 06:00 UTC against `https://floom.dev` (scheduled)
- On demand via `workflow_dispatch` (with optional `base_url` override)

On FAIL it opens a P1 issue tagged `docs,ux` and pings `@federicodeponte`.

### Required secrets

| Secret | Value |
|--------|-------|
| `AX41_SSH_KEY` | Private SSH key for AX41 (kimi-agent lives there) |
| `AX41_HOST` | AX41 hostname or IP |

The workflow SSHes into AX41 and runs the script there. `kimi-agent` does not
need to be installed on the CI runner.

Add secrets:
```bash
gh secret set AX41_SSH_KEY --repo floomhq/floom
gh secret set AX41_HOST --repo floomhq/floom
```

## Interpreting results

### PASS

Kimi wrote "I could complete the full journey end-to-end" in its summary.
No action needed. Findings are still worth reading if there are minor rough
edges — triage as low-priority DX improvements.

### FAIL

Kimi wrote "I could not complete" or hit explicit blockers. Read the full
output in the workflow log. The top findings section lists the specific
doc/CLI/UX gaps. Dispatch a fix and re-run.

### AMBIGUOUS

Neither clear signal. Open the output file and read Kimi's SUMMARY section
manually. Happens when Kimi partially completed the journey but hedged.
Treat as FAIL until confirmed otherwise.

## Two gates, two layers

| Gate | Script | What it catches |
|------|--------|----------------|
| Deterministic journey | `virgin-agent-journey.sh` | HTTP regressions, API shape, auth, error codes |
| Kimi walk | `virgin-kimi-walk.sh` | Doc confusion, broken onboarding DX, missing commands |

Both gates run independently. A prod deploy can pass the curl gate but fail the
Kimi walk (e.g. quickstart is 404 but API is fine). Both must be green.
