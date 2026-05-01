# Security policy

## Reporting a vulnerability

Email **security@floom.dev** with details. We aim to acknowledge within 24 hours and to triage within 72 hours.

If the issue is sensitive (RCE, auth bypass, data exposure), please do not file a public GitHub issue. Use the email above.

## Scope

- `floom-60sec.vercel.app` (the canonical launch site)
- `@floomhq/cli` on npm
- Floom API endpoints under `/api/*`
- The Floom MCP endpoint at `/mcp`
- Public app pages at `/p/<slug>`

Out of scope: third-party services Floom depends on (Supabase, E2B, Vercel) — report those to their respective vendors.

## What you can expect

- Acknowledgement within 24 hours
- A clear status update within 72 hours
- Coordinated disclosure: we will not publish a fix advisory before patching, and we will credit reporters who want credit
- No bug bounty in v0; we may add one in v0.1+

## Floom v0 security primitives

- Each app run executes in an **isolated E2B sandbox** — no shared filesystem or process state across runs
- All traffic over **HTTPS** with strict CSP, HSTS, X-Frame-Options, and Permissions-Policy headers
- **Public-run rate limiting** by IP (currently 20 requests / 30s rolling window)
- **Agent tokens** are stored only as **bcrypt hashes**; the raw token is shown once at creation and never persisted
- Output fields marked `secret` in the app's output schema are **redacted** in API and MCP responses (`[REDACTED]`)
- Single-file Python apps with **stdlib only** in v0 — no arbitrary package install yet (closes a class of supply-chain risks; encrypted-at-rest secrets land in v0.1)

See `/docs#what-secure-means-in-v0` for the public-facing version of this list.
