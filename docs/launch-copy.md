# Launch copy — drafts (edit, then ship)

Four platforms, four shapes. All claim only what v0.1 actually delivers. No "AI hosting" hype — we say "Python function → live URL + REST + MCP tool."

---

## Hacker News — Show HN

**Title** (≤ 80 chars):

```
Show HN: Floom – publish a Python function as a URL + REST + MCP tool in 60s
```

**Body** (paste verbatim, edit `<placeholders>`):

```
Hi HN — Floom turns a single Python function into a public URL, a REST endpoint, and an MCP tool, in about 60 seconds.

The wedge is the trio. Modal lands you at an HTTP endpoint. HF Spaces lands you at a UI (Gradio/Streamlit you write). Floom auto-renders the UI from your input/output JSON Schema and exposes the same handler as an MCP tool agents can call.

How it works:
- write app.py + floom.yaml + input/output JSON Schemas
- floom publish .
- get /p/<slug>, POST /api/apps/<slug>/run, and an MCP tool at /mcp

v0.1 ships:
- Python with hash-locked requirements.txt
- Encrypted-at-rest secrets, runtime-injected into the E2B sandbox
- HTTPS + CSP + rate limiting + agent-token auth for private apps
- Free public apps, no card needed during alpha

Built on E2B (sandbox), Supabase (auth + Postgres), Vercel. Source at https://github.com/floomhq/floom-minimal.

Try it: https://floom-60sec.vercel.app

Honest current limits:
- single-file Python only (multi-file + TypeScript on the roadmap)
- one demo app today (meeting → action items)
- signup is gated by Supabase free-tier email cap during alpha

Happy to answer questions and take feedback.
```

**Notes**
- Post Tuesday or Wednesday morning Pacific.
- Keep replies fast in the first 90 minutes.
- Don't fight detractors; address their best point.

---

## Twitter / X

**Thread** (5 tweets):

1️⃣
```
Floom is live.

A Python function → a public URL, a REST API, and an MCP tool any agent can call.

In 60 seconds.

→ https://floom-60sec.vercel.app
```

2️⃣
```
The trio is the wedge.

Modal: you get an API.
HF Spaces: you get a UI you wrote.
Val.town: you get a JS URL.

Floom: write a Python function, get all three (UI + REST + MCP) auto-generated from your JSON schemas.
```

3️⃣
```
v0.1 ships today:

· Python with hash-locked requirements.txt
· Encrypted-at-rest secrets
· E2B sandbox isolation per run
· Free public apps during alpha

No card. No pricing page. Open source: https://github.com/floomhq/floom-minimal
```

4️⃣ (visual: short demo GIF or screenshot of /p/meeting-action-items)
```
Demo: drop meeting notes in, get a structured list of action items with task / owner / due back.

One handler.py. Same code is the page, the API, and the MCP tool your agent calls.
```

5️⃣
```
Built on @e2b_dev (sandbox), @supabase (auth + DB), @vercel.

Honest about limits: single-file Python only in v0.1. Multi-file + TypeScript next.

Try it free → https://floom-60sec.vercel.app
```

**Notes**
- Pin tweet 1.
- Reply with examples / templates in additional tweets.

---

## Product Hunt

**Tagline** (≤ 60 chars):
```
Python function → URL + API + MCP tool, in 60 seconds.
```

**Product description**:
```
Floom takes one Python function and gives you back three things from a single source: a hosted browser UI (auto-rendered from your JSON Schema), a REST endpoint at /api/apps/<slug>/run, and an MCP tool your agents can discover and call.

Use cases that work today:
· Action-item extraction from meeting notes
· PDF → structured JSON
· Slugifier, password strength, regex tester (all stdlib templates)
· Anything that fits a single handler.py + requirements.txt

What you don't deal with:
· Hosting (Floom hosts on E2B sandboxes)
· Auth (public/private flag in floom.yaml; agent tokens for private apps)
· UI (auto-rendered from JSON Schema — no React/Streamlit/Gradio)
· MCP server (one /mcp endpoint serves every published app)
· Secrets (declare names in floom.yaml; values encrypted at rest, runtime-injected)

Free during alpha. Open source.
```

**First comment** (the maker's voice):
```
Hi PH — I built Floom because shipping a Python script to teammates or to my agents always felt heavier than the script itself. Hosting + UI + a tool definition for MCP was the boring part that took 80% of the time.

Floom collapses that to: write your function, run `floom publish`, get a URL.

Honest about scope: single-file Python today, multi-file + TypeScript next. Free for public apps, no card. The whole launch site is open source: https://github.com/floomhq/floom-minimal

Looking for feedback on the developer experience and on which v0.x features land first.
```

---

## LinkedIn

**Headline post**:
```
Today I'm shipping Floom — a Python function becomes a hosted URL, a REST endpoint, and an MCP tool for AI agents in about a minute.

Why this exists: every AI-native builder I know prompts an agent to write Python, gets working code, and then loses an hour on Vercel/Supabase/UI/auth/MCP-server boilerplate before anyone else can use it.

Floom collapses that into one command:
> floom publish .

What you get:
1) A public page anyone can click
2) A REST endpoint integrations can hit  
3) An MCP tool your agents can discover

What's behind it: E2B sandbox isolation, Supabase auth, Vercel hosting, hash-locked Python deps, encrypted-at-rest secrets injected into the sandbox at run time.

Free for public apps during alpha. Open source. Built in the open.

→ https://floom-60sec.vercel.app
→ https://github.com/floomhq/floom-minimal

Curious to hear what you'd publish first.
```

**Notes**
- Post Tuesday morning, your timezone.
- Tag relevant collaborators / E2B / Supabase only if they've signaled they're OK with it.

---

## What to NOT say in any of these

- "AI app hosting" — we host Python functions, not arbitrary LLM apps
- "End-to-end encrypted" — secrets are encrypted at rest, not E2EE
- "Multi-tenant" — single workspace per account in v0.1
- "TypeScript support" — Python only today
- "SOC 2" or any compliance acronym — alpha service, no audits yet
- Anything about valuation, fundraising, headcount

## Day-of-launch checklist

- [ ] PR #11 merged, canonical redeployed, all UI changes live
- [ ] meeting-action-items handler bundle published (replaces echo stub)
- [ ] Custom Supabase SMTP working (so signup spike isn't capped at 3/hr)
- [ ] OG card validates in Twitter card validator + LinkedIn post inspector
- [ ] /status returns "operational" before clicking publish on any of the above posts
- [ ] Discord welcome channel has a pinned "what is Floom" message
- [ ] First 5 replies on each platform pre-drafted (ready to paste)
- [ ] Whoever's launching has a working agent token in their env (`FLOOM_TOKEN`) so they can demo live
