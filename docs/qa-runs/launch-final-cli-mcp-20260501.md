# Virgin QA Run D - CLI/MCP Publish/Run

Run timestamp: 2026-05-01T07:56:04Z
Agent: Codex QA run D
Repo/worktree: `/tmp/floom-main-post-analytics`
Commit: `41db43bc9c597b1b484c328ef45d40c9e45341bb`
Production target: `https://floom.dev`
Temp evidence dir: `/tmp/floom-virgin-qa/final-cli-mcp`

## Scope

Read before testing:

- `docs/launch-readiness-checklist.md`
- `docs/agent-browser-qa-runbook.md`
- `docs/launch-env-auth-map.md`
- `docs/virgin-agent-qa.md`

Source edits: none.

Allowed writes used:

- this report
- temp files and redacted logs under `/tmp/floom-virgin-qa/final-cli-mcp`

Secret handling:

- Used `/tmp/floom-v01-agent-token` as secret input.
- Did not print raw token/JWT/cookie values.
- Redacted logs are under `/tmp/floom-virgin-qa/final-cli-mcp/logs`.

## CLI Results

| Check | Result | Evidence |
| --- | --- | --- |
| Published CLI version | Pass | `npx @floomhq/cli@latest --version` returned `0.2.16`. |
| Isolated HOME | Pass | CLI config path was `/tmp/floom-virgin-qa/final-cli-mcp/home/.floom/config.json`; removed after QA. |
| `auth login --api-url https://floom.dev` | Pass | Logged in as identity `d3afb56b-a933-4ab5-b49a-4c4a38f785fa`. |
| `auth whoami` | Pass | Returned `api_url: https://floom.dev` and same identity. |
| Fresh app from scratch | Pass | `floom init` created `qa-cli-mcp-20260501-094948` with `floom.yaml`, `app.py`, and JSON schemas. |
| `deploy --dry-run` | Pass | Validated manifest, bundle, input schema, and output schema; no publish sent. |
| `deploy` | Pass | Published app `qa-cli-mcp-20260501-094948`. |
| CLI publish URL | Pass | Publish response returned `https://floom.dev/p/qa-cli-mcp-20260501-094948`; no Vercel alias or preview URL appeared. |
| `run --json` | Pass | Execution `5a1fc099-c336-48e5-8efa-fa3cb0f9dc8d`, status `success`, output `summary: "alpha beta gamma from cli qa"`, `word_count: 6`. |
| Public REST metadata | Pass | `GET /api/apps/qa-cli-mcp-20260501-094948` returned HTTP 200 and `public: true`. |
| Public REST run | Pass | Execution `1260f7b8-326a-45e9-bb77-47e8c5891f91`, status `success`, output `summary: "delta epsilon via public rest"`, `word_count: 5`. |

CLI redacted logs:

- `/tmp/floom-virgin-qa/final-cli-mcp/logs/cli-auth-deploy.redacted.log`
- `/tmp/floom-virgin-qa/final-cli-mcp/logs/cli-run-rest.redacted.log`
- `/tmp/floom-virgin-qa/final-cli-mcp/logs/cli-negative.redacted.log`

## MCP Results

| Check | Result | Evidence |
| --- | --- | --- |
| `GET /mcp` | Pass | HTTP 200, descriptor returned `{"name":"floom","endpoint":"https://floom.dev/mcp","transport":"json-rpc-over-http"}`. |
| JSON-RPC initialize | Pass | HTTP 200, protocol `2024-11-05`, server `floom` version `0.1.0`. |
| `tools/list` | Pass | HTTP 200, listed `auth_status`, `get_app_contract`, `list_app_templates`, `get_app_template`, `validate_manifest`, `publish_app`, `find_candidate_apps`, `get_app`, `run_app`. |
| No MCP token minting | Pass | `create_agent_token` was not listed. |
| `auth_status` | Pass | HTTP 200. |
| `get_app_contract` | Pass | HTTP 200. |
| `list_app_templates` | Pass | HTTP 200; first template key used for retrieval was `invoice_calculator`. |
| `get_app_template` | Pass | HTTP 200 for `invoice_calculator`. |
| `validate_manifest` | Pass | HTTP 200, returned `valid: true` for unique app `qa-mcp-20260501-20260501075451`. |
| `publish_app` | Pass | Published `qa-mcp-20260501-20260501075451`. |
| MCP publish URL | Pass | Publish response returned `https://floom.dev/p/qa-mcp-20260501-20260501075451`; no Vercel alias or preview URL appeared. |
| `get_app` | Pass | HTTP 200 for published MCP app. |
| `run_app` | Pass | Execution `954e72ff-c69c-4cac-b5a7-1e505f95cc73`, status `success`, output `upper: "MCP LAUNCH QA"`, `length: 13`. |

MCP redacted logs:

- `/tmp/floom-virgin-qa/final-cli-mcp/logs/mcp-descriptor.redacted.log`
- `/tmp/floom-virgin-qa/final-cli-mcp/logs/mcp-init-tools.redacted.log`
- `/tmp/floom-virgin-qa/final-cli-mcp/logs/mcp-tools-summary.redacted.log`
- `/tmp/floom-virgin-qa/final-cli-mcp/logs/mcp-tools.redacted.json`

## Unsupported App Rejection

| Case | Surface | Result | Evidence |
| --- | --- | --- | --- |
| FastAPI/OpenAPI manifest field | MCP `validate_manifest` | Pass | Returned MCP error: `v0.1 does not support floom.yaml field: openapi_spec_url`. |
| FastAPI/OpenAPI repository candidate | MCP `find_candidate_apps` | Pass | Returned invalid candidate with `FastAPI/OpenAPI apps require the post-v0 HTTP app runner`. |
| Unpinned dependency | MCP `publish_app` | Pass | Returned MCP error requiring exact package pins with sha256 hashes. |
| FastAPI/OpenAPI manifest field | CLI `validate` | Pass | Rejected `openapi_spec_url`. |
| FastAPI/OpenAPI deploy dry run | CLI `deploy --dry-run` | Pass | Rejected `openapi_spec_url`. |
| Unpinned dependency | CLI `deploy --dry-run` | Pass | Rejected `requirements.txt` without exact pin and sha256 hash. |

## Cleanup

Published app slugs left for coordinator cleanup:

- `qa-cli-mcp-20260501-094948`
- `qa-mcp-20260501-20260501075451`

Local cleanup performed:

- Removed isolated CLI HOME at `/tmp/floom-virgin-qa/final-cli-mcp/home` after verification.

Local temp evidence remaining:

- `/tmp/floom-virgin-qa/final-cli-mcp/cli-app`
- `/tmp/floom-virgin-qa/final-cli-mcp/unsupported-fastapi`
- `/tmp/floom-virgin-qa/final-cli-mcp/unsupported-deps`
- `/tmp/floom-virgin-qa/final-cli-mcp/logs`
- `/tmp/floom-virgin-qa/final-cli-mcp/mcp-qa.mjs`

## Self-Audit

Verification performed:

- Ran CLI version/help probes with isolated HOME.
- Ran CLI auth, whoami, dry run, publish, CLI run, public metadata, and public REST run against `https://floom.dev`.
- Ran MCP descriptor, initialize, tool list, contract/template/validate/publish/get/run checks against `https://floom.dev/mcp`.
- Asserted MCP publish response used `https://floom.dev/p/:slug` and did not include `vercel.app` or `preview.floom.dev`.
- Ran CLI and MCP unsupported-shape rejection checks.
- Grepped redacted log files and this report for the raw token from `/tmp/floom-v01-agent-token`; no matches found.

Result: QA run D passes for the requested CLI/MCP production path. Remaining cleanup is deletion of the two published production QA app slugs listed above.
