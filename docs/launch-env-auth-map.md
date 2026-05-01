# Launch Environment And Auth Map

Purpose: remove ambiguity around Floom v0.1 production, OAuth, Supabase, Vercel, Cloudflare, and agent-token behavior.

## Canonical Origins

| Origin | Role |
| --- | --- |
| `https://floom.dev` | Public launch origin and user-facing product URL |
| `https://floom-60sec-mu.vercel.app` | Vercel deployment target behind `floom.dev` |
| `https://floom-60sec.vercel.app` | Older canonical demo deployment, not the current v0.1 launch target |
| `https://preview.floom.dev` | Legacy Floom production stack, separate from v0.1 launch |

The v0.1 launch path uses `https://floom.dev`. CLI, MCP, docs, and app URLs must use that origin unless a local development flow explicitly sets `FLOOM_API_URL=http://localhost:3000`.

## Routing

`floom.dev` is currently served through AX41 nginx and proxies to the verified Vercel deployment.

Direct Vercel domain attach is blocked because `floom.dev` is assigned to another Vercel project/scope. Until that ownership is moved, the AX41 nginx proxy is the production route.

## Supabase

Project id:

```text
bdlzxpgsmlmijopdhqdf
```

Required Auth settings:

- Site URL: `https://floom.dev`
- Redirect allowlist:
  - `https://floom.dev/auth/callback`
  - `https://floom.dev/auth/callback?next=/tokens`
  - `https://floom-60sec-mu.vercel.app/auth/callback`
  - `https://floom-60sec-mu.vercel.app/auth/callback?next=/tokens`

Email provider status:

- App-side redirect handling is fixed.
- Supabase provider email limits still need SMTP wiring before public self-serve signup can be repeatedly tested at launch volume.

## Google OAuth

Google OAuth must route through Supabase:

```text
https://bdlzxpgsmlmijopdhqdf.supabase.co/auth/v1/callback
```

Do not point Google OAuth directly at the app callback route. Supabase receives the provider callback, then redirects to the app redirect URL.

Known prior issue: AX41 nginx returned `502` during Google callback when Supabase auth cookies exceeded default proxy header buffers. Nginx buffers were increased. Fresh browser QA must still verify this path after every auth-related change.

## Vercel Runtime Env

Production env names used by v0.1:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AGENT_TOKEN_PEPPER`
- `E2B_API_KEY`
- `FLOOM_SECRET_ENCRYPTION_KEY`
- optional public origin / MCP origin variables, depending on deployment

Do not commit env files. Temporary Vercel pulls belong under `/tmp`, mode `0600`, and must be deleted after QA.

Vercel can store escaped newline values. Local live-gate scripts that compare production token hashes must decode escaped newlines in `AGENT_TOKEN_PEPPER` before using the value.

## Token Model

Supabase browser session:

- signs in users
- opens `/tokens`
- creates/revokes agent tokens through `/api/agent-tokens`

Agent token:

- authenticates CLI, MCP, and REST app operations
- has scopes such as read/run/publish
- cannot create more agent tokens
- is stored hashed server-side

Public app:

- anonymous metadata/page/run allowed
- app bundle remains private in storage
- anonymous runs are rate-limited

Private app:

- anonymous metadata/page/run blocked
- owner session or owner agent token required

## v0.1 App Contract

Supported at launch:

- single-file Python function apps
- exact-pinned, hash-locked `requirements.txt`
- encrypted app secrets at rest
- runtime-only secret injection
- browser, REST API, CLI, and MCP publish/run paths
- public/private app visibility

Not part of launch:

- TypeScript runtime
- Java runtime
- FastAPI/OpenAPI apps
- multi-file Python bundles
- multi-endpoint web apps
- teams, org sharing, per-user app ACLs

## Merge Order

1. Merge `launch/v0.1-deps-secrets` by itself.
2. Close the superseded PR #3 once main contains v0.1.
3. Rebase or merge-update PR #11 onto the new main.
4. Resolve PR #11 conflicts and rerun launch gates.

Do not batch PR #11 into the v0.1 merge. The combined queue has known conflicts in MCP and UI files.
