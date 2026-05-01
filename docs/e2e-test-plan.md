# Floom v0.1 End-to-End Test Plan

Purpose: repeat the real launch flow for the claim:

> localhost to live and secure in 60sec

Production URL: `https://floom.dev`

Scope: v0.1 Python function apps with JSON Schema input/output, optional exact-pinned hash-locked `requirements.txt`, encrypted app secrets, agent tokens, browser/API/CLI/MCP run paths, public/private access, Supabase, and E2B.

Raw evidence, screenshots, and one-off run logs belong outside the public repo:

```text
/root/floom-internal/launch-evidence/floom-minimal/YYYY-MM-DD/
```

## Required Inputs

Use one of these auth paths:

- Fresh signup path: real email account, Supabase SMTP unblocked, confirmation lands on `https://floom.dev/auth/callback?next=/tokens`.
- Existing account path: sign in at `https://floom.dev/login`, then create a token at `/tokens`.
- Provided token path: use a short-lived owner token created from `/tokens`.

Never print raw tokens, JWTs, Supabase keys, E2B keys, Vercel tokens, or secret values in logs.

## Browser Auth And Token Flow

1. Open `https://floom.dev/login`.
2. Verify email/password sign-in renders.
3. Verify Google sign-in hands off to Google and returns to `/tokens` when completed.
4. For fresh signup, verify the email confirmation link returns to `https://floom.dev`, not localhost or a Vercel alias.
5. Open `/tokens`.
6. Create an agent token.
7. Verify the raw token appears once.
8. Refresh and verify only token prefix/metadata remains.
9. Revoke one test token and verify it fails publish and private run.

## CLI Flow

Use an isolated home directory for at least one run:

```bash
export HOME="$(mktemp -d)"
export FLOOM_API_URL="https://floom.dev"
export FLOOM_TOKEN="<redacted-agent-token>"
npx @floomhq/cli@latest setup
npx @floomhq/cli@latest auth whoami
```

Publish the canonical template:

```bash
cp -R templates/meeting-action-items "/tmp/floom-e2e-meeting-$RANDOM"
cd "/tmp/floom-e2e-meeting-$RANDOM"
# edit floom.yaml slug to a unique value
npx @floomhq/cli@latest deploy --dry-run
npx @floomhq/cli@latest deploy
npx @floomhq/cli@latest run "<unique-slug>" '{"transcript":"Action: Sarah sends launch notes by Friday"}' --json
```

Record the elapsed time from `deploy` start to returned `/p/:slug`. The 60-second timer starts after account and token setup.

## API Flow

Public app:

```bash
curl -sS -X POST "https://floom.dev/api/apps/<public-slug>/run" \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"transcript":"Action: Sarah sends launch notes by Friday"}}'
```

Private app:

```bash
curl -sS -X POST "https://floom.dev/api/apps/<private-slug>/run" \
  -H "Authorization: Bearer <redacted-agent-token>" \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"transcript":"Send this from n8n or any HTTP client"}}'
```

Verify:

- public metadata and run succeed without auth,
- private metadata and run fail without auth,
- private metadata and run succeed with owner token,
- invalid bearer token returns auth failure instead of anonymous downgrade,
- revoked token fails.

## MCP Flow

Descriptor and tools:

```bash
curl -sS https://floom.dev/mcp
curl -sS https://floom.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Contract:

```bash
curl -sS https://floom.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_app_contract","arguments":{}}}'
```

Run:

```bash
curl -sS https://floom.dev/mcp \
  -H "Authorization: Bearer <redacted-agent-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"run_app","arguments":{"slug":"<slug>","inputs":{"transcript":"Action: Sarah sends launch notes by Friday"}}}}'
```

Verify:

- tool list contains `auth_status`, `get_app_contract`, `list_app_templates`, `get_app_template`, `validate_manifest`, `publish_app`, `find_candidate_apps`, `get_app`, and `run_app`,
- tool list does not contain token creation,
- `get_app_contract` documents v0.1 limits and the `run_app` envelope,
- MCP publish succeeds with bearer token,
- MCP run returns `{ execution_id, status, output, error }`.

## Dependencies And Secrets Flow

Publish a private app with:

```yaml
dependencies:
  python: ./requirements.txt
secrets:
  - OPENAI_API_KEY
```

Use an exact-pinned hash-locked requirements line:

```text
humanize==4.9.0 --hash=sha256:ce284a76d5b1377fd8836733b983bfb0b76f1aa1c090de2566fcf008d7f6ab16
```

Set secrets with stdin only:

```bash
printf '%s' "$VALUE" | FLOOM_TOKEN="$FLOOM_TOKEN" FLOOM_API_URL=https://floom.dev npx @floomhq/cli@latest secrets set "<private-slug>" OPENAI_API_KEY --value-stdin
```

Verify:

- secret values never appear in API, MCP, execution rows, logs, screenshots, app versions, or storage bundles,
- secret metadata list shows names/timestamps only,
- missing required secret fails before user code runs,
- public secret-backed app publish is rejected,
- E2B output proves dependency import or secret environment access,
- dependency install runs before secret injection.

## Unsupported App Flow

Each run tests rejection copy for:

- TypeScript/Node app,
- Java app,
- FastAPI/OpenAPI app,
- multiple top-level Python files,
- undeclared `requirements.txt`,
- unhashed or unpinned requirements line,
- manifest `actions`,
- raw secret value in `secrets`.

## Report Template

Write the report outside the public repo:

```text
Date:
Tester:
Commit:
Production URL:
Auth path:
Slugs:
Execution ids:
Screenshots:

Browser auth/token:
CLI setup/deploy/run:
API public/private:
MCP publish/run:
Dependencies:
Secrets:
Unsupported app rejection:
Access control:
Cleanup:
Secret scan:

Score 0-100:
Blockers:
Most confusing user moment:
```

## Cleanup

- Revoke test tokens.
- Delete or mark temporary apps with their test slug prefix.
- Delete test secrets.
- Remove temporary token files and isolated `HOME`.
- Scan evidence for raw token/JWT/Supabase/E2B/Vercel secret patterns before sharing.
