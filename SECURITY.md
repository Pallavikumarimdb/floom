# Security policy

## Reporting a vulnerability

Email **security@floom.dev** with details. We acknowledge security reports within
24 hours and triage them within 72 hours.

If the issue is sensitive, do not file a public GitHub issue. Use the email
address above.

## Scope

- `floom.dev`
- `@floomhq/cli` on npm
- Floom API endpoints under `/api/*`
- the Floom MCP endpoint at `/mcp`
- public app pages at `/p/<slug>`

Out of scope: third-party services Floom depends on, including Supabase, E2B,
Vercel, Sentry, Resend, and Cloudflare.

## Include

Please include:

- affected URL or package version
- reproduction steps
- expected and actual impact
- whether any token, secret, or private app data was exposed

## Do not include

Do not include raw secrets in GitHub issues, pull requests, screenshots, or
public logs.

## Security primitives

- app runs execute in isolated E2B sandboxes
- HTTPS, CSP, HSTS, X-Frame-Options, and Permissions-Policy headers are active
- public runs are rate-limited by caller and app
- agent tokens are stored only as HMAC-SHA256 hashes with `AGENT_TOKEN_PEPPER`
- encrypted app secrets are stored at rest and injected only at runtime
- schema-marked secret outputs and secret-like fields are redacted before
  persistence and API/MCP responses
- private apps require owner session or owner agent-token auth

See `/docs` for the public launch contract and security summary.
