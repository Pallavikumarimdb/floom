---
name: floomit
description: How to use Floom v0.4 (hosted runtime for Python/TS apps). Thin pointer — fetch canonical docs from floom.dev/docs/<topic> for current truth; don't trust hardcoded knowledge.
version: 0.4.2
last_synced: 2026-05-04
canonical_source: https://floom.dev/skills/floomit
canonical_raw: https://floom.dev/skills/floomit?raw=1
auto_refresh_threshold_days: 7
---

# Floom v0.4 — Quick Orientation

Floom turns Python or TypeScript code into shareable, authenticated app URLs.
You deploy a bundle; Floom runs it in an E2B sandbox on demand. Every app gets:
- A browser permalink: `https://floom.dev/p/<slug>`
- A REST endpoint: `https://floom.dev/api/apps/<slug>/run`
- An MCP tool entry: `https://floom.dev/mcp`

**Production host:** `https://floom.dev` (not any `.vercel.app` URL — those are legacy/orphan)

**Install the CLI once:**
```bash
npm install -g @floomhq/cli@latest
```

**Auth:**
```bash
floom setup   # opens browser, stores token locally
```

**Deploy:**
```bash
floom deploy ./my-app-dir
```

---

## When you need to...

### Deploy an app end-to-end
**Read:** https://floom.dev/docs/quickstart
Install CLI, scaffold, deploy, run — the full flow.

### Write or fix the manifest (floom.yaml)
**Read:** https://floom.dev/docs/manifest
All fields: slug, command, runtime, entrypoint, public, input_schema, output_schema, dependencies, secrets, integrations, bundle_exclude. Both legacy and modern forms. (The old `composio:` field is deprecated but still accepted.)

**Single-file default:** input_schema and output_schema can be inline YAML objects — no separate .json files needed. Example:

```yaml
input_schema:
  type: object
  required: [text]
  properties:
    text: { type: string }
output_schema:
  type: object
  required: [result]
  properties:
    result: { type: string }
```

Path-reference form (`input_schema: ./input.schema.json`) still works as an escape hatch.

### Configure secrets (shared vs per-runner)
**Read:** https://floom.dev/docs/secrets
Creator-subsidized shared keys vs per-runner user-provided keys. Manifest schema and CLI commands.

### Use Gmail, Slack, or other integrations
**Read:** https://floom.dev/docs/integrations
Manifest field (integrations: gmail), runtime auto-injection of COMPOSIO_CONNECTION_ID, missing-connection HTTP 412 handling.

### Call the REST API directly
**Read:** https://floom.dev/docs/api
Endpoints, auth headers, sync vs async run patterns, poll pattern.

### Use the MCP server
**Read:** https://floom.dev/docs/mcp
Available tools, auth, integration with Claude Desktop / Cursor / Codex.

### Mint or revoke agent tokens
**Read:** https://floom.dev/docs/auth
Token format, scopes (read/run/publish), no expiry (revoke manually), CI usage.

### Debug a failed run
**Read:** https://floom.dev/docs/troubleshooting
Error codes (404/400/401/412/429/502/500) and fixes.

### See working real-world examples
**Read:** https://floom.dev/docs/examples
Deployable app slugs to use as starting points.

### Run deploys from CI / GitHub Actions
**Read:** https://floom.dev/docs/ci
FLOOM_API_KEY usage, GitHub Actions example.

---

## Refresh this skill

If this file is older than 7 days or you suspect it's stale:
```bash
curl -s "https://floom.dev/skills/floomit?raw=1"
```
That always returns the version live in production.

## CI gate: doc freshness

PRs are blocked by the `doc-freshness` CI check if they introduce stale strings
into public-facing files. If your PR is blocked, run:

```bash
npm run check-doc-freshness
```

It will print which file and line triggered, and why. Common fixes:
- Remove `Floom v0.1/v0.2/v0.3` used as current branding (current version is v0.4).
- Replace `floomhq/floom-minimal` with `floomhq/floom`.
- Remove personal emails or internal filesystem paths.
