# Security policy

## Reporting a vulnerability

Email **security@floom.dev** with details. We aim to acknowledge within 24 hours and to triage within 72 hours.

If the issue is sensitive (RCE, auth bypass, data exposure), please do not file a public GitHub issue. Use the email above.

## Scope

- `floom.dev` (the canonical launch site)
- `@floomhq/cli` on npm
- Floom API endpoints under `/api/*`
- The Floom MCP endpoint at `/mcp`
- Public app pages at `/p/<slug>`

Out of scope: third-party services Floom depends on (Supabase, E2B, Vercel) — report those to their respective vendors.

## What you can expect

- Acknowledgement within 24 hours
- A clear status update within 72 hours
- Coordinated disclosure: we will not publish a fix advisory before patching, and we will credit reporters who want credit
- No bug bounty in v0.1; we may add one later

## Floom v0.1 security primitives

- Each app run executes in an **isolated E2B sandbox** — no shared filesystem or process state across runs
- All traffic over **HTTPS** with strict CSP, HSTS, X-Frame-Options, and Permissions-Policy headers
- **Public-run rate limiting** by caller and app (defaults: 20 caller runs / 60s and 100 app runs / 60s)
- **Agent tokens** are stored only as HMAC-SHA256 hashes with `AGENT_TOKEN_PEPPER`; the raw token is shown once at creation and never persisted
- Output fields marked `secret` in the app's output schema are **redacted** in API and MCP responses (`[REDACTED]`)
- Single-file Python apps with **hash-locked dependencies** declared in `requirements.txt` (v0.1) — the install layer pins exact versions + hashes
- **Encrypted-at-rest secrets** (v0.1): secret names declared in `floom.yaml`, raw values encrypted in Supabase, runtime-decrypted and injected into the E2B sandbox at execution time. Never written to source, manifest, logs, MCP output, API responses, app versions, or bundle storage

See `/docs` for the public-facing launch contract and security summary.
