# Virgin-agent journey gate

Every Floom preview and prod deploy runs a deterministic user-flow test called
the "virgin-agent journey". It proves the full path a new user would walk —
from hitting the app to getting a run result — works end-to-end on the
deployed URL before anyone can merge to prod.

## Why it exists

On 2026-05-04 a missing database migration broke `/api/apps/<slug>/run` on prod
for several hours. Nobody caught it because no one re-tested the user flow after
the deploy. The canary closes that gap permanently.

## How it works

`scripts/virgin-agent-journey.sh` runs 13 deterministic checks using only
`curl`, `npm view`, and `python3`. No LLM. No browser. Exits 0 on full pass,
non-zero on any failure.

### Steps

| # | What | Expected |
|---|------|----------|
| 1 | `npm view @floomhq/cli version` | version string returned |
| 2 | `GET /api/status` | `overall` is `ok` or `degraded` (not `down` on core deps) |
| 3 | `GET /api/apps/meeting-action-items` | slug matches, 200 |
| 4 | `GET /p/meeting-action-items` | 200 |
| 5 | `POST /api/apps/meeting-action-items/run` | 202 or 200 |
| 6 | Poll `GET /api/runs/<id>` | status reaches `succeeded` within 3 min |
| 7 | Inspect run output | `output.actions` array present |
| 8 | `GET /api/me/runs` with `Bearer <token>` | 200, `runs` array (only if token set) |
| 9 | `POST /api/apps/no-such-app-virgin-test-xyz/run` | 404 |
| 10 | `POST /api/apps/meeting-action-items/run` with invalid JSON | 400 |
| 11 | `GET /api/me/runs` without auth | 401 |
| 12 | `GET /docs/quickstart` | 200 |
| 13 | `GET /mcp` | 200 |

## GitHub Actions integration

Two workflows use the script:

- **`virgin-journey.yml`** — triggers on every Vercel `deployment_status`
  success event. Runs against the preview URL on PRs, and the prod URL on
  main deploys. A prod failure opens a P0 issue automatically.

- **`virgin-canary.yml`** — cron every 15 minutes against `https://floom.dev`.
  Opens a P0 issue on first failure, closes it automatically when prod recovers.
  Can also be triggered manually via `workflow_dispatch`.

## Required GitHub secret: `FLOOM_TEST_TOKEN`

Steps 8 (authed me/runs) requires an agent token for a dedicated test workspace.

### How to create the token

1. Go to `https://floom.dev` and sign in as a test account (not your personal
   account — create a dedicated `floom-test@floom.dev` workspace).
2. Navigate to **Settings → Agent tokens**.
3. Click **New token**, name it `virgin-journey-ci`, grant `run` scope.
4. Copy the token value (it is shown only once).

### Add it to GitHub

```bash
gh secret set FLOOM_TEST_TOKEN --repo floomhq/floom-minimal
# Paste the token value when prompted
```

Or via the GitHub UI: **Settings → Secrets and variables → Actions → New secret**.

Without this secret, step 8 is skipped (warning only, not a failure). All
anonymous checks (steps 1-7, 9-13) still run.

## Running locally

```bash
# Against prod
bash scripts/virgin-agent-journey.sh https://floom.dev

# Against a Vercel preview
bash scripts/virgin-agent-journey.sh https://floom-minimal-git-my-branch-floomhq.vercel.app

# Against localhost
FLOOM_TEST_TOKEN=your-local-token \
  bash scripts/virgin-agent-journey.sh http://localhost:3000
```

## Interpreting results

- **PASS** — step passed
- **WARN** — step skipped or degraded but non-blocking (e.g. token not set,
  or Resend health check down — not a core dependency)
- **FAIL** — step failed; gate exits non-zero

A 429 on step 5 (run quota exhausted) is surfaced as a WARN, not a FAIL.
It means the shared demo app quota is hit — the endpoint is reachable and
rate-limiting correctly. This is not a deploy regression.
