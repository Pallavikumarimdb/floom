# v5 Port Stubs

This file lists all stubs created during the v5 literal-copy port from
`floomhq/floom@main` into `floom-minimal`. Each stub has a `// TODO(v5-port):`
comment in its source file.

## Stub List

| Stub file | Original source | What's stubbed | Why |
|---|---|---|---|
| `src/components/runner/RunSurface.tsx` | `apps/web/src/components/runner/RunSurface.tsx` (3605 lines) | Full input/output split layout, streaming terminal, job progress, action selector, output toolbar | RunSurface is the largest component in the codebase; ports as its own milestone |
| `src/components/share/ShareModal.tsx` | `apps/web/src/components/share/ShareModal.tsx` | Notion-style share dialog with copy link + visibility toggle + embed code | Depends on RunSurface result state |
| `src/components/share/SkillModal.tsx` | `apps/web/src/components/share/SkillModal.tsx` | Claude skill install one-liner + example agent prompt | Secondary install affordance; replaced by InstallPopover as primary |
| `src/components/share/InstallPopover.tsx` | `apps/web/src/components/share/InstallPopover.tsx` | Popover with MCP / CLI / Skill install tabs | Auth-gated token flow; needs floom-minimal token issuance |
| `src/components/AppIcon.tsx` | `apps/web/src/components/AppIcon.tsx` | Per-slug SVG icon lookup from `/public/app-icons/` | Icons not copied into floom-minimal yet |
| `src/components/AppReviews.tsx` | `apps/web/src/components/AppReviews.tsx` | Paginated user reviews with star ratings | No reviews data in floom-minimal yet |
| `src/components/DescriptionMarkdown.tsx` | `apps/web/src/components/DescriptionMarkdown.tsx` | Markdown with syntax highlighting and copyable code blocks | No markdown renderer dependency yet |
| `src/components/Confetti.tsx` | `apps/web/src/components/Confetti.tsx` | Canvas-based confetti burst animation | Cosmetic; deferred post-launch |
| `src/components/FeedbackButton.tsx` | `apps/web/src/components/FeedbackButton.tsx` | Feedback widget with search params + POST /api/feedback | No feedback API in floom-minimal yet |
| `src/lib/types.ts` | `apps/web/src/lib/types.ts` | `AppDetail`, `RunRecord`, `ReviewSummary`, `ActionSpec` interfaces | Minimal shapes sufficient for AppPermalinkPage |
| `src/lib/publicPermalinks.ts` | `apps/web/src/lib/publicPermalinks.ts` | Error classification, public run path builder | Minimal stubs sufficient for AppPermalinkPage |
| `src/lib/onboarding.ts` | `apps/web/src/lib/onboarding.ts` | localStorage-based first-run confetti/celebration state | Minimal stubs sufficient for AppPermalinkPage |
| `src/lib/app-examples.ts` | `apps/web/src/lib/app-examples.ts` | Per-slug prefill text for 3 launch demos | Hardcoded examples copied from original |
| `src/api/client.ts` | `apps/web/src/api/client.ts` | React Query + auth token injection API client | AppPermalinkPage v5 uses direct fetch() calls; only `ApiError` needed for instanceof checks |
| `src/components/public/AppGrid.tsx` | `apps/web/src/components/public/AppGrid.tsx` | Rich HubApp[] cards with thumbnail previews | Uses AppStripe fallback layout |
| `src/components/public/AppShowcaseRow.tsx` | `apps/web/src/components/public/AppShowcaseRow.tsx` | Rich banner-card thumbnails + editorial copy | Renders banner-line preview + name/desc/tags/CTA |

## Already Ported (Full)

| File | Original source | Notes |
|---|---|---|
| `src/app/globals.css` | `apps/web/src/wireframe.css` + `globals.css` | Full CSS variable system + HeroDemo keyframes |
| `src/app/page.tsx` | `apps/web/src/pages/LandingV17Page.tsx` | MVP variant only (`isMvp=true` code paths) |
| `src/components/home/HeroDemo.tsx` | `apps/web/src/components/home/HeroDemo.tsx` | Full port; internal `RunSurface` renamed to `RunSurfaceDemo` to avoid collision |
| `src/components/home/WorksWithBelt.tsx` | `apps/web/src/components/home/WorksWithBelt.tsx` | Verbatim copy |
| `src/components/home/SectionEyebrow.tsx` | `apps/web/src/components/home/SectionEyebrow.tsx` | Verbatim copy |
| `src/components/home/DiscordCta.tsx` | `apps/web/src/components/home/DiscordCta.tsx` | Verbatim copy; `focusable` prop fixed for React SVG |
| `src/components/SiteHeader.tsx` | `apps/web/src/components/TopBar.tsx` | Full port with Next.js navigation |
| `src/components/FloomFooter.tsx` | `apps/web/src/components/Footer.tsx` / `PublicFooter.tsx` | Full port |
| `src/components/public/AppStripe.tsx` | `apps/web/src/components/public/AppStripe.tsx` | Simplified (no AppIcon/categoryTint/DescriptionMarkdown deps) |
| `src/app/p/[slug]/page.tsx` | `apps/web/src/pages/AppPermalinkPage.tsx` | Full v17 design port; heavy sub-components stubbed |
