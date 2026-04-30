# Floom Skill Flow Test Plan

Use this file for repeated "virgin agent" tests. Each run starts from no prior Floom context except the public URL, the repo path, and a fresh Floom agent token supplied through the environment. Testers must not print tokens, JWTs, Supabase keys, or E2B keys.

Current v0 claim:

> Local single-file Python function to secure live Floom app in about 60 seconds after Floom account and agent-token setup.

Current v0 host:

```bash
export FLOOM_API_URL="https://floom-60sec.vercel.app"
export FLOOM_TOKEN="<agent-token>"
```

## Supported App Contract

Agents can ask the Floom MCP tool `get_app_contract` for the current v0 contract
and `list_app_templates` / `get_app_template` for useful copy-paste app bundles
before generating an app.

MCP cannot create or return raw agent tokens. Create tokens only from the signed-in `/tokens` page, where the raw token is shown once.

Accept:

- Single-file Python.
- v0: Python standard library only.
- v0.1 branch: exact-pinned `requirements.txt` when `floom.yaml` declares `dependencies.python: ./requirements.txt`.
- One handler function, usually `run(inputs: dict) -> dict`.
- `floom.yaml`, `input.schema.json`, and `output.schema.json`.
- `public: true` for public apps; omitted or `false` for private apps.
- Secret names only, never raw secret values, via `secrets: ["OPENAI_API_KEY"]`.

Reject:

- Undeclared `requirements.txt`, `pyproject.toml`, `package.json`, or `openapi.json`.
- FastAPI, OpenAPI, TypeScript, Node, multi-file Python, raw secret values, long-running servers, CLIs, workers, queues, cron, browser automation, OAuth callbacks, and local databases.
- `floom.yaml` field named `actions`.

## v0.1 Boundary

v0.1 is exact-pinned dependencies plus secret names with operator-provisioned
runtime environment injection. It is not generic web hosting, and it is not part
of the v0 60-second launch claim until separately verified end to end.

Add in v0.1:

- An exact-pinned `requirements.txt` install path for Python packages.
- `floom.yaml` secret names only, never raw secret values.
- Owner-scoped server-side secret env lookup and E2B runtime injection.

Blocker for self-serve secrets: encrypted user-managed secret value storage is
not implemented. Operators provision values as server environment variables
named from the app owner and manifest secret name.

Still reject until later: FastAPI/OpenAPI apps, arbitrary HTTP servers,
TypeScript/Node apps, background workers, multi-service repos, and long-running
processes.

## Virgin Agent Test Matrix

Run every item from a fresh shell/session.

1. Candidate discovery
   - Inspect a repo or fixture directory.
   - Call MCP `get_app_contract` and confirm it returns the v0 manifest, `app.py`, input schema, output schema, and unsupported cases.
   - Call MCP `list_app_templates` and confirm it lists `invoice_calculator`, `utm_url_builder`, `csv_stats`, and `meeting_action_items`.
   - Call MCP `get_app_template` for at least one template and confirm it returns `floom.yaml`, `app.py`, `input.schema.json`, and `output.schema.json`.
   - Identify one valid single-file Python function candidate.
   - Identify at least one unsupported candidate and record the exact rejection reason.

2. Token setup
   - Confirm `/login` renders.
   - Confirm `/tokens` requires auth when signed out.
   - Sign in or use a provided test account.
   - Create an agent token.
   - Confirm the raw token is visible only once.
   - Confirm revoke works.

3. Public publish flow
   - Create or copy a minimal app with `public: true`.
   - Publish with:

```bash
npx tsx /Users/federicodeponte/floom-60sec/cli/deploy.ts <app-dir>
```

   - Record elapsed time from command start to printed `/p/:slug`.
   - Confirm anonymous `GET /api/apps/:slug` returns 200.
   - Confirm anonymous `POST /api/apps/:slug/run` returns `status: "success"`.
   - Open `/p/:slug`, submit the form, and capture a screenshot showing output.

4. Private publish flow
   - Create or copy a minimal app with `public: false` or no `public` field.
   - Publish with the same token.
   - Confirm anonymous `GET /api/apps/:slug` returns 404.
   - Confirm anonymous `POST /api/apps/:slug/run` returns 403.
   - Confirm owner token `GET /api/apps/:slug` returns 200.
   - Confirm owner token `POST /api/apps/:slug/run` returns `status: "success"`.

5. API and MCP run flow
   - Run the public app through REST.
   - Run the private app through REST with the owner token.
   - Query `GET /mcp`.
   - Run the public app through MCP `run_app` when the tester has an MCP client.
   - Run the private app through MCP with owner auth when available.

6. Security checks
   - Publish or run a fixture with an output field marked `secret: true`.
   - Confirm the browser/API output redacts that field.
   - Run inputs with fields named like `token`, `secret`, `password`, `api_key`, `private_key`, `credential`, or `authorization`; confirm persisted execution input is redacted.
   - Confirm public runs consume both a caller-derived and per-app rate-limit key before E2B execution.
   - Confirm MCP does not offer token creation; create tokens through `/tokens`.
   - Confirm test logs do not include raw Floom tokens, JWTs, Supabase keys, or E2B keys.
   - Confirm revoked tokens fail for publish and private run.

7. Supabase proof
   - Confirm an execution row exists for each successful run when DB access is available.
   - Confirm app ownership and `public` values match the manifest.

8. Unsupported app proof
   - Try one app with undeclared `requirements.txt`; expect CLI rejection.
   - Try one v0.1 app with `dependencies.python: ./requirements.txt` and exact `package==version` pins; expect candidate validation to pass.
   - Try one app with two top-level `.py` files; expect CLI rejection.
   - Try one manifest with `actions`, malformed `dependencies`, or raw/malformed `secrets`; expect CLI rejection.

## Result Log Template

Append one section per test run.

```text
Date:
Tester:
Repo/fixture:
Commit tested:
Production URL:
Token source: provided env / created in UI

Candidate discovery:
Public publish:
Public browser run:
Public API run:
Private publish:
Private anonymous blocked:
Private owner run:
MCP run:
Secret redaction:
Supabase execution rows:
Unsupported app rejection:
Elapsed publish time:
Screenshots:
Console errors:
Raw secret/token leakage:

Score 0-100:
Blockers:
Notes:
```
