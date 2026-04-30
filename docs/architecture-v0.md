# Floom v0 Architecture

Production URL: `https://floom-60sec.vercel.app`

Current verified scope: single-file Python function apps with JSON Schema input/output, published with a Floom agent token.

```mermaid
flowchart TD
  User[User or agent] -->|sign up / sign in| Web[Floom web app on Vercel]
  User -->|FLOOM_TOKEN + app dir| CLI[Floom CLI / skill]
  Agent[MCP client] --> MCP[/mcp]

  Web --> Auth[Supabase Auth]
  Web --> Tokens[agent_tokens]
  CLI -->|floom.yaml + app.py + schemas| Publish[POST /api/apps]
  MCP -->|publish_app| Publish

  Publish --> Apps[apps table]
  Publish --> Versions[app_versions table]
  Publish --> Bundles[Supabase Storage app-bundles]
  CLI -->|metadata-only secret commands| SecretsAPI[GET/PUT/DELETE /api/apps/:slug/secrets]
  SecretsAPI --> Secrets[app_secrets encrypted values]

  Browser[/p/:slug] --> Run[POST /api/apps/:slug/run]
  API[REST caller] --> Run
  MCP -->|run_app| Run

  Run --> Access[auth + public/private + rate limit]
  Access --> Bundles
  Access --> Secrets
  Secrets -->|server decrypt + names only| Run
  Run --> E2B[E2B sandbox]
  E2B --> Handler[call run(inputs)]
  Handler --> Output[JSON output]
  Output --> Redaction[secret-field redaction]
  Redaction --> Executions[executions table]
  Redaction --> Browser
  Redaction --> API
  Redaction --> MCP
```

## Current v0 Contract

Required app files:

- `floom.yaml`
- one Python file, usually `app.py`
- `input.schema.json`
- `output.schema.json`

Current v0 accepts:

- `runtime: python`
- one handler function, usually `run(inputs: dict) -> dict`
- Python standard library only in v0, exact-pinned dependencies in v0.1
- public apps via `public: true`
- private apps when `public` is omitted or false
- manifest-declared secret names in v0.1

Current v0 rejects:

- raw secret values
- FastAPI/OpenAPI servers
- TypeScript/Node apps
- multi-file Python projects
- long-running processes
- multiple manifest actions

## v0 Launch Blockers

Public self-serve launch is blocked by Supabase email configuration:

- Production signup returns `email rate limit exceeded`.
- Email confirmation links are not verified end-to-end.
- Supabase Auth SMTP/Site URL config could not be updated with the current Supabase token; the Management API returned `403`.
- The provided Resend key is send-only. It cannot manage domains through the Resend API.
- `send.floom.dev` currently has SES/Amazon DNS records, not Resend DNS records.

Verified working:

- Agent token creation in authenticated browser sessions.
- CLI publish with `FLOOM_TOKEN`.
- Public app metadata and run.
- Private anonymous metadata/run blocked.
- Private owner token metadata/run.
- Browser, REST API, and MCP run surfaces.
- Supabase app/version/execution/storage evidence in virgin QA runs.
- E2B-backed execution for the current function runtime.

## Runtime Roadmap

### v0.1: Python Dependencies + Self-Serve Secret Storage

Goal: unlock useful `input -> API/AI call -> output` apps.

Separate branch scope:

- exact-pinned `requirements.txt` packages via `dependencies.python: ./requirements.txt`
- manifest-declared secret names
- owner-managed encrypted secret values in `app_secrets`
- server-only decryption and E2B env injection at run time
- no raw secret values in source, manifest, logs, MCP output, API responses, app versions, executions, bundle storage, or docs

`FLOOM_SECRET_ENCRYPTION_KEY` is a server-only base64-encoded 32-byte key. Secret list responses contain only `name`, `created_at`, and `updated_at` metadata.

Branch: `v0.1-deps-secrets`

### v0.2: Multi-File Bundles

Goal: allow small Python projects with helper modules.

Scope:

- safe bundle format
- path traversal protection
- file count and byte limits
- E2B extraction
- one entrypoint/handler remains the run model

Branch: `v0.2-multi-file-bundles`

### v0.3: OpenAPI / HTTP App Mode

Goal: support OpenBlog-style projects.

Scope:

- dependency install
- secret injection
- start command
- health/ready checks
- request relay or port proxy
- OpenAPI endpoint-to-UI/action mapping
- sandbox lifecycle and timeout policy

Branch: `v0.3-openapi-http-apps`

## OpenBlog Status

OpenBlog does not work with multi-file bundles alone.

It needs multiple roadmap items together:

- multi-file bundle support
- dependencies
- secret names and secure injection
- HTTP server/OpenAPI handling
- likely async/stateful pipeline behavior

The config file is not the bottleneck. `floom.yaml` can express more modes later. The bottleneck is runtime support: packaging, install, secrets, process lifecycle, endpoint mapping, and safe execution.
