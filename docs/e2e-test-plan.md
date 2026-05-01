# Full end-to-end test plan

Fire this as a sub-agent the moment auth is unblocked. Saved here so the prompt is ready to paste, not regenerated mid-blocker.

## Unblockers (one of these = ready to test)

- **A**: Codex configures custom SMTP for Supabase Auth (issue #6) — kills the 3/hr signup cap. Then sub-agent can sign up fresh on canonical.
- **B**: Federico drops a working agent token here (`floom_agent_...`) — sub-agent skips signup, goes straight to publish/run.
- **C**: Federico shares a confirmed test account (email + password) — sub-agent signs in, mints a token from that, runs the rest.

## What the agent does once unblocked

```
1. signup-or-signin
   if A: create test+<timestamp>@floom.dev, wait for confirmation email via Gmail MCP, click link, land on /tokens
   if B: skip; use provided token via floom auth login --token=<token>
   if C: sign in with provided creds at /login, land on /tokens

2. mint-token
   on /tokens, type "e2e-launch-readiness" + click Create
   verify raw token shown once, copy it
   verify token appears in the table with prefix
   save token to env: FLOOM_TOKEN=<token>

3. configure-cli
   FLOOM_TOKEN=$FLOOM_TOKEN FLOOM_API_URL=https://floom-60sec.vercel.app npx @floomhq/cli@latest auth login --token=$FLOOM_TOKEN
   verify: floom auth whoami returns the test user

4. publish-app
   cd templates/meeting-action-items
   FLOOM_API_URL=https://floom-60sec.vercel.app floom publish .
   verify: returns /p/meeting-action-items URL
   open the URL, verify Run tab loads with the notes textarea

5. run-via-browser
   click "Try with example" on /p/meeting-action-items
   click Run
   verify: real Gemini response with actions array, summary, count
   verify: Copy + .json (no .csv since output is single object) buttons work
   verify: timing label shows ms

6. run-via-rest
   curl -X POST https://floom-60sec.vercel.app/api/apps/meeting-action-items/run \
     -H "Authorization: Bearer $FLOOM_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"inputs":{"notes":"<sample meeting notes>"}}'
   verify: 200 with same shape

7. run-via-mcp
   POST https://floom-60sec.vercel.app/mcp with method tools/call, name run_app, args { slug: meeting-action-items, inputs: {...} }
   verify: success with output
   verify: list_app_templates returns 8 templates

8. revoke-token
   on /tokens, click Revoke on the e2e token
   confirm
   verify: token row shows Revoked status
   verify: subsequent curl with same token returns 401

9. cleanup
   if signed up fresh: delete the test user (manual via Supabase dashboard or document for cleanup)

10. report
    matrix of: signup pass/fail, token mint pass/fail, CLI auth pass/fail, publish pass/fail, browser-run pass/fail, REST-run pass/fail, MCP-run pass/fail, revoke pass/fail
    + 3 most surprising findings
    + any layout glitches or copy issues spotted along the way
    + per-step timing
```

## Invocation (paste this when ready)

```
Run the full E2E test plan documented at docs/e2e-test-plan.md.

Inputs:
- Auth path: <A | B | C>
- Token (if B): <floom_agent_...>
- Creds (if C): <email> / <password>

Save the report at docs/e2e-test-2026-MM-DD.md and post a top-level summary back here.

Cap: 90 minutes. Brutal honest reporting — no fake-greens.
```

## Ready when

- [ ] PR #11 merged + canonical redeployed (so v11 polish is what's tested)
- [ ] PR #15 merged: meeting-action-items handler bundle deployed (so /p/meeting-action-items returns real Gemini, not 404 / stub)
- [ ] One of A / B / C above is true
