# Rename: `floom-minimal` → `floom` (preserve stars)

Codex executes. This doc is the briefing — what to do, in what order, what to verify.

## Current state

| Repo | Stars (estimate) | Role |
|---|---|---|
| `floomhq/floom` | high (years of work) | Original floom monorepo, the v0.x runtime + cli + docs + skills. Active branches, many PRs. **Source of truth for the CLI and the legacy runtime.** |
| `floomhq/floom-minimal` | low (new) | The v0 launch site. The repo this PR #11 lives on. Will become the public-facing floom on launch. |

## Goal

After the rename:
- `floomhq/floom` (URL) = the launch site (currently `floom-minimal`'s code)
- `floomhq/floom-legacy` (or similar) = the old floom monorepo, archived but preserved, stars intact

## Path (preserves stars on the old repo)

1. **Rename the old `floomhq/floom` → `floomhq/floom-legacy`** (or `floom-runtime`, your call)
   - GitHub keeps stars + watchers + forks intact
   - Old URLs auto-redirect (GitHub adds the redirect on rename)
   - All in-flight PRs / branches stay
   - Optionally archive after the rename to mark it read-only — but only do this AFTER all CLI / runtime work has migrated

2. **Rename `floomhq/floom-minimal` → `floomhq/floom`**
   - Now the launch site sits at `floomhq/floom` — the canonical, easy-to-find URL
   - Stars on `floom-minimal` (small count) move with the rename — no loss
   - Existing PRs (PR #11, #3, etc) stay on the renamed repo

3. **Update string references**:
   - `package.json` repository field, README badges, every `floomhq/floom-minimal` link in docs / SECURITY.md / sitemap
   - The `@floomhq/cli` npm package's `floomhq/floom-minimal` reference (in `cli-npm/`) — but the CLI lives in the **old repo** which is now `floom-legacy`. Either move the CLI source to the new `floom` repo OR keep it in `floom-legacy` and update the package.json `repository` field
   - `https://github.com/floomhq/floom-minimal` → `https://github.com/floomhq/floom` everywhere in floom-minimal source

## CLI migration question

The CLI source (`cli-npm/`) lives in the **OLD** floom monorepo. After the rename, it's at `floomhq/floom-legacy/cli-npm/`. Two options:

| Option | Pros | Cons |
|---|---|---|
| Keep CLI in `floom-legacy` | Minimal disruption. CI keeps working. | "Where's the CLI source?" answer is "in the legacy repo" — confusing for new contributors. |
| Move CLI to new `floom` (the launch site) | Single source of truth at the canonical name. | Repo-history extraction + replay is non-trivial; npm `repository` URL changes. |

Recommend: **keep CLI in `floom-legacy` for v0 launch** (minimal change, low risk), then plan the migration in v0.1. Update `@floomhq/cli` `repository` field in its package.json to point at the renamed legacy URL.

## Pre-rename checklist (run before pulling the trigger)

- [ ] PR #11 merged on the current `floom-minimal`
- [ ] PR #3 merged on the legacy `floom` (so the v0.1 deps + secrets work is in main before the legacy gets archived)
- [ ] All open PRs on `floom-minimal` either merged or rebased
- [ ] All open PRs on the old `floom` repo either merged, closed with note, or moved to `floom-legacy`
- [ ] Vercel project's GitHub integration repo URL updated (Vercel → Settings → Git → connect to renamed repo)
- [ ] Supabase Auth Site URL stays the same (`https://floom-60sec.vercel.app` is independent)
- [ ] Discord invite + GitHub badge URLs in:
   - `src/app/legal/page.tsx`
   - `src/components/FloomFooter.tsx`
   - `SECURITY.md`
   - `docs/architecture-v0.md`
   - `README.md`
   - `package.json` (`repository`, `bugs.url`, `homepage`)

## Post-rename verification

- [ ] `git remote get-url origin` resolves to `https://github.com/floomhq/floom.git` after a fresh clone
- [ ] `https://github.com/floomhq/floom-minimal` redirects to `https://github.com/floomhq/floom`
- [ ] `https://github.com/floomhq/floom-legacy` exists (the old `floom`'s rename target) and the original `floom` URL redirects there too — wait, this is the conflict: BOTH repos can't redirect to the new locations from `floom`. The order matters:
  1. Rename old `floom` first (frees the slug)
  2. Then rename `floom-minimal` to take the slug
- [ ] CLI npm package install still works: `npx @floomhq/cli@latest --help`
- [ ] OG card on canonical landing still renders (its `og:image` URL is path-relative, not repo-relative — should be fine)

## What I (Claude) can prep before the rename

Already prepped — when the rename happens, I'll do a single sweep PR replacing every `floom-minimal` reference in source. Until then, I'm leaving the references as-is to avoid breaking links.

## What this does NOT include

- Renaming the **deployed Vercel project** (`fedes-projects-5891bd50/floom-60sec` is a separate concern; URL `floom-60sec.vercel.app` stays)
- Renaming the **Supabase project** (`bdlzxpgsmlmijopdhqdf` keeps that ID; only the human-readable name in Supabase dashboard might change)
- Domain changes (`floom.dev` already points where you want)
