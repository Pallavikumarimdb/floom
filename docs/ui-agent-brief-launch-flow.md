# UI Agent Brief - Launch Flow

## Goal

Make the launch-night builder path seamless without touching the app runner.

Verified backend scope already exists:

- Supabase Auth works through browser sessions.
- `POST /api/agent-tokens` creates an agent token for an authenticated user.
- `DELETE /api/agent-tokens/:id` revokes a token for its owner.
- `POST /api/apps` publishes a single-file Python app when called with a user JWT or Floom agent token.
- `POST /api/apps/:slug/run` executes the app on E2B and stores the execution.

## Required UI

1. `/login`
   - Email/password sign up.
   - Email/password sign in.
   - Clear session state.
   - Redirect signed-in users to `/tokens`.
   - Keep copy plain and operational.

2. `/tokens`
   - Require sign in.
   - Show current user email.
   - Create an agent token.
   - Show the raw token exactly once after creation.
   - Copy token button.
   - List existing tokens by name, prefix, scopes, created/expires/last-used/revoked state.
   - Revoke token button.
   - Show the publish commands:
     `npx @floomhq/cli@latest setup`
     `npx @floomhq/cli@latest deploy`

3. Homepage CTA
   - Primary: create token / sign in.
   - Secondary: run live demo app.

## Boundaries

Allowed:

- `src/app/login/**`
- `src/app/tokens/**`
- `src/components/**`
- `src/app/page.tsx`
- token-list API if needed

Avoid:

- E2B runner changes
- Supabase schema changes unless a verified API blocker exists
- App publish/run route changes unless a verified golden-path blocker exists
- Design-heavy refactors

## Verification

Run:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

Browser QA:

- Sign up or sign in.
- Land on `/tokens`.
- Create token.
- Copy button works.
- Token list refreshes.
- Revoke works.
- Publish command is visible and readable.

Do not print raw tokens in logs or final summaries.
