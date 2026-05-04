# Floom

> Localhost to live in 60 seconds. Hosted runtime for AI-built apps —
> Python or TypeScript functions become shareable URLs with auth, secrets,
> integrations, and MCP support.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/@floomhq/cli.svg)](https://www.npmjs.com/package/@floomhq/cli)

This is the source code for [floom.dev](https://floom.dev).

- **[Quickstart](https://floom.dev/docs/quickstart)** — deploy your first app
- **[Examples](https://floom.dev/docs/examples)** — apps you can fork
- **[Skills reference](https://floom.dev/skills/floomit)** — for AI agents
- **[Contributing](./CONTRIBUTING.md)** — how to help

---

## What is Floom?

Floom is a hosted runtime for AI-generated apps. You write a Python or TypeScript function,
add a `floom.yaml` manifest, and deploy with the CLI. Floom handles sandboxing, auth,
secrets injection, and serving — no infrastructure to manage.

Every app gets three run paths out of the box: a browser UI, a REST endpoint, and an MCP
tool entry. Apps run in isolated E2B sandboxes per invocation.

---

## Quick start

```bash
npm install -g @floomhq/cli@latest
floom setup                        # opens browser, stores token locally
floom init --name "My App" --slug my-app --type custom
floom deploy
```

Your app is live at `https://floom.dev/p/my-app`.

---

## What you get

- **Per-run sandbox** — E2B isolation per invocation, up to 30 minutes
- **Three run paths** — browser UI at `/p/:slug`, REST at `/api/apps/:slug/run`, MCP at `/mcp`
- **Auth** — Google OAuth for users, scoped agent tokens for CI and AI agents
- **Secrets** — per-runner (each caller provides their own) or shared (creator subsidizes)
- **Integrations** — Gmail, Slack, GitHub, and other services via Composio; declared in `floom.yaml`
- **JSON Schema UI** — input/output schemas generate the browser form automatically
- **Async runtime** — long runs return `202` with an `execution_id`; callers poll or use SSE
- **Multi-file bundles** — ship `requirements.txt`, multiple source files, any E2B-supported runtime
- **Public and private apps** — access control per app

## App contract

`floom.yaml` (modern form):

```yaml
name: Meeting Action Items
slug: meeting-action-items
command: python app.py
input_schema:
  type: object
  required: [transcript]
  properties:
    transcript: { type: string }
output_schema:
  type: object
  required: [items]
  properties:
    items: { type: array, items: { type: string } }
```

Legacy form with explicit `runtime: python` + `entrypoint:` + `handler:` still works unchanged.

Handler (Python):

```python
def run(inputs: dict) -> dict:
    return {"items": ["Follow up on budget", "Schedule design review"]}
```

Secrets declared in the manifest:

```yaml
secrets:
  - OPENAI_API_KEY                   # per-runner: each caller provides their own
  - name: SHARED_KEY
    scope: shared                    # creator-subsidized: one value, all callers
```

---

## Stack

- Next.js 16 app shell
- Supabase — auth and database
- E2B — sandboxed execution
- Composio — third-party integrations
- QStash (Upstash) — async job queue
- Resend — transactional email
- Sentry — error tracking

---

## Local development

Use this path only when developing the Floom service itself.

```bash
cp .env.example .env.local   # fill in Supabase, E2B, QStash, Resend credentials
npm install
npm run dev
```

Without `E2B_API_KEY`, fake mode is available for local testing. Without Supabase env,
visit `/p/demo-app` to verify the UI locally. See [`CONTRIBUTING.md`](./CONTRIBUTING.md)
for the full setup guide, including the virgin-agent journey gate.

---

## Self-hosting

Point the environment variables in `.env.local` at your own Supabase project, E2B account,
and QStash queue. `FLOOM_ORIGIN` controls the base URL used in CLI auth and redirect flows.
Full self-hosting notes are in [`docs/`](./docs/).

---

## License

MIT
