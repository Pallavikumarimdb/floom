'use client';
/**
 * LandingV17Page — marketing home `/` — MVP variant.
 *
 * TODO(v5-port): Literal port of floom@main/pages/LandingV17Page.tsx
 * (variant="mvp" code paths only — `!isMvp` blocks dropped).
 * Mechanical fixes applied:
 *   1. 'use client' added (uses hooks)
 *   2. react-router-dom → next/link + next/navigation
 *   3. <Link to={x}> → <Link href={x}>
 *   4. useDeployEnabled, readDeployEnabled, waitlistHref stubs below
 *   5. api.getHub() → fetch('/api/hub').then(r=>r.json())
 *   6. HubApp type defined inline
 *   7. publicHubApps → inline no-op (all apps treated as public)
 * See docs/v5-port-stubs.md for full stub list.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Code2, Rocket, Share2 } from 'lucide-react';

import { SiteHeader } from '@/components/SiteHeader';
import { FloomFooter } from '@/components/FloomFooter';
import { AppStripe } from '@/components/public/AppStripe';
import { AppGrid } from '@/components/public/AppGrid';
import { ShowcaseCard, SHOWCASE_ENTRIES } from '@/components/public/AppShowcaseRow';
import { FeedbackButton } from '@/components/FeedbackButton';

import { WorksWithBelt } from '@/components/home/WorksWithBelt';
import { HeroDemo } from '@/components/home/HeroDemo';
import { SectionEyebrow } from '@/components/home/SectionEyebrow';
import { DiscordCta } from '@/components/home/DiscordCta';

import { useSession } from '@/hooks/useSession';

// TODO(v5-port): HubApp type from floom@main/lib/types.ts.
// Stubbed with the fields LandingV17Page actually uses.
interface HubApp {
  slug: string;
  name: string;
  description: string;
  category?: string;
  runs_7d?: number;
}

// TODO(v5-port): publicHubApps from floom@main/lib/hub-filter.ts.
// In floom@main this filters out unlisted/private apps.
// In floom-minimal v0, treat all apps as public.
function publicHubApps(apps: HubApp[]): HubApp[] {
  return apps;
}

// MVP hero install — R7.6 (2026-04-28): hero composition cut to 4 elements
// (eyebrow, H1, sub, npx command). Caption + MCP/CLI popover removed —
// Federico's "the landing page hero header still looks a bit overwhelming".
// Advanced install paths (MCP config, CLI snippet) live on /home and /docs.
const NPX_SETUP_COMMAND = 'npx @floomhq/cli@latest setup';

async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

interface MvpHeroInstallProps {
  /**
   * R15 UI-6 (2026-04-28): hero trust signals. Total live apps + sum of
   * runs_7d across visible apps. Both can be 0 on cold launch — when
   * apps>0 we render "<N> apps live"; when runs_7d sum > 0 we append
   * "<N> runs this week". Stars come from GitHubStarsBadge which fetches
   * its own data. When all 3 stats are 0/missing, the strip hides
   * entirely (no empty placeholder).
   */
  appsCount: number;
  runs7dSum: number;
}

function MvpHeroInstall({ appsCount, runs7dSum }: MvpHeroInstallProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyText(NPX_SETUP_COMMAND);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  // R7.6 (2026-04-28): MCP/CLI snippet popover removed from hero.
  // Federico's brief: cut hero to 4 elements. Advanced install paths
  // (MCP config, CLI snippet) live on /home and /docs — not in the
  // first viewport.

  return (
    <div style={{ maxWidth: 540, margin: '20px auto 0', textAlign: 'left' }}>
      {/* v8 (2026-05-01): collapsed dense hero per Federico's feedback.
          Removed: "PASTE IN YOUR TERMINAL — OR ANY AI AGENT" label
          (redundant with the $ prefix), outcome line "→ Mints your agent
          token..." (visual noise). Result: 7 stacked elements → 4. */}
      <div style={{ position: 'relative' }}>
        <pre
          data-testid="hero-npx-command"
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 14,
            background: 'var(--studio, #f5f4f0)',
            color: 'var(--ink)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: '14px 90px 14px 18px',
            overflowX: 'auto',
            whiteSpace: 'pre',
            lineHeight: 1.5,
            margin: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span style={{ color: 'var(--muted)', userSelect: 'none', marginRight: 10 }}>$</span>
          {NPX_SETUP_COMMAND}
        </pre>
        <button
          type="button"
          data-testid="hero-npx-copy-btn"
          onClick={() => void handleCopy()}
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            right: 10,
            fontSize: 12,
            fontWeight: 600,
            color: copied ? '#fff' : 'var(--accent)',
            background: copied ? 'var(--accent)' : 'var(--card)',
            border: `1px solid ${copied ? 'var(--accent)' : 'rgba(4,120,87,0.35)'}`,
            borderRadius: 6,
            padding: '6px 14px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '0.03em',
          }}
          aria-label={copied ? 'Copied' : 'Copy command'}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {/* R10 (2026-04-28): complementary "Try a live app" CTA. Gemini
          baseline scored landing 6/10 partly because the only first-
          step action was "copy this command and paste in your terminal".
          Adding a 1-click path to a live app gives non-CLI visitors a
          way to feel the product without installing anything. */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: 'var(--muted)',
        }}
      >
        <span>or</span>
        <Link
          href="/p/demo-app"
          data-testid="hero-try-live-app"
          style={{
            color: 'var(--accent)',
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          try a live app in your browser
          <span aria-hidden="true">→</span>
        </Link>
      </div>
      {/* R15 UI-6 (2026-04-28): hero trust-signals strip. Real numbers
          sourced from /api/hub (apps count + runs_7d sum) and
          GitHubStarsBadge's /api/gh-stars cache. Renders as one quiet
          gray line below the npx + "try live app" CTAs. Each stat hides
          when it's zero/missing so a cold launch never shows "0 runs". */}
      <HeroTrustSignals appsCount={appsCount} runs7dSum={runs7dSum} />
    </div>
  );
}

/**
 * R15 UI-6 (2026-04-28): trust-signal strip for the MVP hero. Reads the
 * apps + runs_7d totals as props (LandingV17Page already fetches /api/hub
 * for the showcase, so we pass the data down rather than re-fetching).
 * GitHub stars come from `/api/gh-stars` via the same cache key the
 * GitHubStarsBadge uses — we read the cache synchronously and refresh
 * it in the background.
 */
function HeroTrustSignals({
  appsCount,
  runs7dSum,
}: {
  appsCount: number;
  runs7dSum: number;
}) {
  const [stars, setStars] = useState<number | null>(() => {
    // Cheap synchronous read of the GitHubStarsBadge cache. Same key.
    try {
      const raw = window.localStorage?.getItem('floom:gh-stars');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { count?: number; ts?: number };
      if (typeof parsed.count === 'number') return parsed.count;
    } catch {
      /* ignore */
    }
    return null;
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/gh-stars', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count?: number } | null) => {
        if (cancelled || !d || typeof d.count !== 'number') return;
        setStars(d.count);
      })
      .catch(() => {
        /* keep cached/null fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the visible parts. Each stat hides when its value isn't
  // meaningful so a cold launch reads as "10 apps live · ★ 6 stars"
  // rather than "10 apps live · 0 runs this week · ★ 6 stars".
  const parts: string[] = [];
  if (appsCount > 0) {
    parts.push(`${appsCount} app${appsCount === 1 ? '' : 's'} live`);
  }
  if (runs7dSum > 0) {
    parts.push(`${runs7dSum} run${runs7dSum === 1 ? '' : 's'} this week`);
  }
  if (stars && stars > 0) {
    parts.push(`★ ${stars} star${stars === 1 ? '' : 's'}`);
  }

  // Hide entirely when nothing meaningful to show (would render as
  // empty whitespace otherwise).
  if (parts.length === 0) return null;

  return (
    <div
      data-testid="hero-trust-signals"
      style={{
        marginTop: 14,
        fontSize: 12.5,
        color: 'var(--muted)',
        lineHeight: 1.5,
      }}
    >
      {parts.join(' · ')}
    </div>
  );
}

interface Stripe {
  slug: string;
  name: string;
  description: string;
  category?: string;
}

// Same showcase roster as CreatorHeroPage (P0 launch curation #253).
// 2026-04-25 roster swap: bounded <5s demos replaced the heavy originals.
const PREFERRED_SLUGS = ['competitor-lens', 'ai-readiness-audit', 'pitch-coach'] as const;

// Fallback descriptions rendered if /api/hub is slow or empty on cold
// visits. Match the 2026-04-25 launch roster. Keep tight + benefit-led.
const FALLBACK_STRIPES: Stripe[] = [
  {
    slug: 'competitor-lens',
    name: 'Competitor Lens',
    description: 'Paste 2 URLs (yours + a competitor). Get a positioning, pricing, and angle diff in under 5 seconds.',
    category: 'research',
  },
  {
    slug: 'ai-readiness-audit',
    name: 'AI Readiness Audit',
    description: 'Paste one URL. Get a readiness score 0-10, three risks, three opportunities, and one concrete next step.',
    category: 'research',
  },
  {
    slug: 'pitch-coach',
    name: 'Pitch Coach',
    description: 'Paste a startup pitch. Get three direct critiques, three angle-specific rewrites, and a one-line TL;DR.',
    category: 'writing',
  },
];

function pickStripes(apps: HubApp[]): Stripe[] {
  if (apps.length === 0) return FALLBACK_STRIPES;
  const bySlug = new Map(apps.map((app) => [app.slug, app]));
  const picked: Stripe[] = [];
  for (const slug of PREFERRED_SLUGS) {
    const hit = bySlug.get(slug);
    if (hit) picked.push({ slug: hit.slug, name: hit.name, description: hit.description, category: hit.category ?? undefined });
  }
  if (picked.length === PREFERRED_SLUGS.length) return picked;
  return picked.length >= 3 ? picked : FALLBACK_STRIPES;
}

export default function LandingV17PageMvp() {
  const [, setStripes] = useState<Stripe[]>(FALLBACK_STRIPES);
  // R8 #25 (2026-04-28): full HubApp[] for the AppGrid card variant.
  // AppShowcaseCard didn't render the sample-output preview chip;
  // AppGrid does (matches floom.dev's richer card style).
  const [showcaseHubApps, setShowcaseHubApps] = useState<HubApp[]>([]);
  // G9 (2026-04-28): inline directory grid on MVP landing. Next 6 apps
  // after the 3 curated showcase slugs, plus a "Browse all <N> apps" CTA.
  // Federico: "we should still, on the MVP Floom, have the app store
  // visible, right?"
  const [directoryApps, setDirectoryApps] = useState<Stripe[]>([]);
  const [directoryHubApps, setDirectoryHubApps] = useState<HubApp[]>([]);
  const [totalAppsCount, setTotalAppsCount] = useState<number>(0);
  // R15 UI-6 (2026-04-28): sum of runs_7d across all visible apps.
  // Renders into the hero trust-signals strip ("47 runs this week").
  // Drops to 0 on cold launch — HeroTrustSignals hides the stat then.
  const [runs7dSum, setRuns7dSum] = useState<number>(0);
  // v26 §3 option C: logged-in-aware landing.
  // When authenticated user hits "/", show a "Resume in {workspaceName} →" banner.
  const { data: session, isAuthenticated } = useSession();
  // r39 (2026-04-29): "Run in your AI tool" CTA removed per Federico's comment —
  // non-technical visitors don't understand it. Dominant CTA is now "Browse live
  // apps" → /apps. The /install-in-claude route is still live for developer
  // visitors who find it via docs or TopBar; it's just not promoted in the hero.

  useEffect(() => {
    document.title = 'Ship AI apps fast · Floom';
    // TODO(v5-port): api.getHub() replaced with fetch('/api/hub').
    // floom-minimal's /api/hub returns apps from Supabase.
    fetch('/api/hub', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rawApps: unknown) => {
        const apps = Array.isArray(rawApps) ? (rawApps as HubApp[]) : [];
        const visible = publicHubApps(apps);
        if (visible.length > 0) {
          setStripes(pickStripes(visible));
          setTotalAppsCount(visible.length);
          // R15 UI-6: sum runs_7d across visible apps for hero trust strip.
          // HubApp.runs_7d is optional; missing/undefined coerces to 0.
          const totalRuns7d = visible.reduce(
            (acc, app) => acc + (typeof app.runs_7d === 'number' ? app.runs_7d : 0),
            0,
          );
          setRuns7dSum(totalRuns7d);
          // R8 #25: keep full HubApp shape for AppGrid (sample-output
          // preview chip needs thumbnail + manifest + sample data).
          const curatedSlugs = new Set<string>(PREFERRED_SLUGS as readonly string[]);
          const showcaseFull = visible.filter((a) => curatedSlugs.has(a.slug));
          setShowcaseHubApps(
            // Order to match PREFERRED_SLUGS so the editorial pick stays stable.
            PREFERRED_SLUGS.map((slug) => showcaseFull.find((a) => a.slug === slug)).filter(
              (a): a is HubApp => Boolean(a),
            ),
          );
          // Pick the next 6 apps that aren't already in the curated showcase.
          const rest = visible
            .filter((app) => !curatedSlugs.has(app.slug))
            .slice(0, 6)
            .map((app) => ({
              slug: app.slug,
              name: app.name,
              description: app.description,
              category: app.category ?? undefined,
            }));
          setDirectoryApps(rest);
          setDirectoryHubApps(
            visible.filter((app) => !curatedSlugs.has(app.slug)).slice(0, 6),
          );
        }
      })
      .catch(() => {
        // Keep static roster on failure.
      });
  }, []);

  return (
    <div
      className="page-root landing-v17"
      data-testid="landing-v17"
      style={{ minHeight: '100vh', background: 'var(--bg)' }}
    >
      <SiteHeader />

      {/* v26 §3 option C: resume banner for authenticated users.
          G1 (2026-04-28): slimmed to a 1-line stripe so it doesn't
          compete with the hero. Federico: "the composition still is
          a bit overwhelming". */}
      {isAuthenticated && session && (
        <div
          data-testid="landing-resume-banner"
          style={{
            background: 'var(--studio, #f5f4f0)',
            borderBottom: '1px solid var(--line)',
            padding: '6px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 12.5,
            lineHeight: 1.4,
          }}
        >
          <span style={{ color: 'var(--muted)' }}>
            You&apos;re signed in.
          </span>
          <Link
            href="/tokens"
            data-testid="landing-resume-cta"
            style={{
              fontWeight: 600,
              color: 'var(--accent)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {/* TODO(v5-port): session.active_workspace not available in floom-minimal.
                Using generic label. Original: session.active_workspace?.name */}
            Resume in your workspace →
          </Link>
        </div>
      )}

      <main id="main" style={{ display: 'block' }}>
        {/* HERO — wireframe: .hero-shell > .hero
            Cursor-style layout (Federico 2026-04-23 — "the visual demo
            doesn't have to fit on the hero in full"). Above the fold at
            1440x900: eyebrow + H1 + sub + CTA + top ~120-150px of the
            HeroDemo canvas. The rest of the demo extends below the fold and
            reveals on scroll — no min-height:100vh forcing fit, no squished
            demo. Top padding trimmed (40 -> 24) to give the canvas more room
            inside the first viewport. */}
        <section
          data-testid="hero"
          style={{
            position: 'relative',
            padding: '64px 24px 56px',
            borderBottom: '1px solid var(--line)',
            background:
              'linear-gradient(180deg, var(--card) 0%, var(--bg) 100%)',
          }}
        >
          <div
            style={{
              maxWidth: 980,
              margin: '0 auto',
              textAlign: 'center',
            }}
          >
            {/* G1 (2026-04-28): hero composition. Federico said the hero
                still felt overwhelming. Solution:
                - Lift "Backed by Founders Inc" ABOVE H1 as a quiet eyebrow
                  (positions the product, doesn't compete with the H1)
                - Add vertical breathing room around H1 + sub
                - Demote WorksWithBelt to a soft caption under the snippet
                - Resume banner slimmed to a 1-line stripe (above) */}
            {/* MVP eyebrow: WorksWithBelt above H1 — agent-agnostic
                positioning ("Works with any MCP client" + 3 logos) is
                more useful than a Founders Inc credential here. Founders
                Inc cohort credit stays in footer + WhosBehind. Federico
                2026-04-28: hero eyebrow should be product positioning,
                not investor proof. */}
            <div data-testid="hero-eyebrow-belt" style={{ marginBottom: 32 }}>
              <WorksWithBelt />
            </div>

            {/* H1 — locked copy. Wireframe ships 64px desktop, balance wrap.
                F10 (2026-04-28): "fast" coloured with brand green for emphasis. */}
            <h1
              className="hero-headline"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 64,
                lineHeight: 1.02,
                letterSpacing: '-0.025em',
                color: 'var(--ink)',
                margin: '0 0 20px',
                textWrap: 'balance' as unknown as 'balance',
              }}
            >
              Ship AI apps <span style={{ color: 'var(--accent)' }}>fast</span>.
            </h1>

            {/* R38 (2026-04-29): quiet honest qualifier under the H1.
                Surfaces "Localhost to live in 60 seconds" claim from
                the LinkedIn/HN launch post, plus the waitlist context
                so visitors landing via the post know what to expect.
                Both variants (mvp + full) get this line. */}
            {/* v8: dropped "Beta access via waitlist." — floom-minimal is a
                real product, not a waitlist. Subhead is now a single calm
                tagline; sign-up CTA already covered by the Sign up button
                in the SiteHeader. */}
            <p
              data-testid="hero-waitlist-qualifier"
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 16,
                lineHeight: 1.5,
                fontWeight: 400,
                color: 'var(--muted)',
                margin: '-4px 0 20px',
              }}
            >
              Localhost to live in 60 seconds.
            </p>

            {/* CTA — MVP variant: inline MCP setup snippet. */}
            <MvpHeroInstall
              appsCount={totalAppsCount}
              runs7dSum={runs7dSum}
            />
            {/* WorksWithBelt moved to the eyebrow above H1 (Federico
                2026-04-28). No longer rendered under the snippet — it
                was a second hero element competing with H1+snippet. */}
          </div>

          {/* R7.6 followup (2026-04-28): HeroDemo lives directly under
              the hero install snippet (above "From idea to shipped app
              in 3 steps"). Earlier R7.6 pushed it BELOW that section
              to calm the hero, but Federico flagged it as "too low" —
              hero box stays clean (no demo INSIDE it) but the demo
              should still anchor near hero so it reads as proof, not
              filler. Full variant kept its placement here. */}
          <HeroDemo />
        </section>

        {/* HOW IT WORKS — 3 steps */}
        <section
          data-testid="how-it-works"
          style={{ padding: '72px 28px', maxWidth: 1240, margin: '0 auto' }}
        >
          <SectionEyebrow>How it works</SectionEyebrow>
          {/* v6 (2026-05-01): "How it works" H2 changed per Federico — was
              Inter display 800/34. Now lighter sans 600/28 with neutral tracking
              so the section feels narrative, not marketing-loud. */}
          <h2
            style={{
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              fontWeight: 600,
              fontSize: 28,
              lineHeight: 1.2,
              letterSpacing: '-0.015em',
              textAlign: 'center',
              margin: '0 auto 28px',
              maxWidth: 760,
              color: 'var(--ink)',
            }}
          >
            From idea to shipped app in 3 steps.
          </h2>
          <div
            className="steps"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 18,
              maxWidth: 1180,
              margin: '0 auto',
            }}
          >
            {STEPS.map((s, idx) => {
              const Icon = idx === 0 ? Code2 : idx === 1 ? Rocket : Share2;
              return (
              <div
                key={s.num}
                className="step"
                style={{
                  // R11 (2026-04-28): Gemini audit — the card-shaped
                  // border + bg made these read as text inputs. Drop the
                  // card chrome and lean on the explicit "STEP 0X" label
                  // and accent number to make narrative obvious.
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 0,
                  padding: '6px 4px 0',
                  position: 'relative',
                }}
              >
                {/* R11: explicit "STEP 0X" eyebrow tells the visitor this
                    is a narrative step, not an input field. */}
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--accent, #047857)',
                    marginBottom: 10,
                  }}
                >
                  Step {s.num}
                </div>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: 'rgba(4,120,87,0.08)',
                    border: '1px solid rgba(4,120,87,0.18)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#047857',
                    marginBottom: 16,
                  }}
                >
                  <Icon size={22} strokeWidth={1.6} />
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 11,
                    color: 'var(--muted)',
                    letterSpacing: '0.08em',
                    fontWeight: 600,
                    marginBottom: 12,
                  }}
                >
                  {s.kicker}
                </div>
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    margin: '0 0 8px',
                    lineHeight: 1.3,
                  }}
                >
                  {s.title}
                </h3>
                <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
                  {s.body}
                </p>
                <div
                  style={{
                    marginTop: 14,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 11.5,
                    color: 'var(--muted)',
                  }}
                >
                  {s.mono}
                </div>
              </div>
            );
            })}
          </div>
        </section>

        {/* v7 (2026-05-01): showcase + directory sections REMOVED.
            Federico flagged: floom-minimal v0 only has demo-app, and
            the showcase + directory cards link to floom.dev/p/<slug>
            which violates the self-contained rule. The cards return
            in v0.1 once floom-minimal has its own apps table populated. */}

        {/* DISCORD CTA — quiet chip above the footer (#613,
            Federico 2026-04-23). Invite lives in MEMORY
            (project_floom_discord): https://discord.gg/8fXGXjxcRz. Not
            a second hero, just a visible path for visitors who want
            to talk to the team or other builders. */}
        <DiscordCta />
      </main>

      <FloomFooter />
      <FeedbackButton />
    </div>
  );
}


const STEPS = [
  {
    num: '01',
    kicker: 'BRING YOUR APP',
    title: 'Got an idea or a GitHub link?',
    body: 'Paste it. Floom takes care of the rest.',
    mono: 'paste anything',
  },
  {
    num: '02',
    kicker: 'PUBLISH FROM CLI',
    title: 'Sign up, mint a token, ship.',
    body: 'One npx command sets up MCP and mints your agent token. Floom hosts the UI, the REST endpoint, and the MCP tool.',
    mono: 'floom publish ./my-app',
  },
  {
    num: '03',
    kicker: 'SHARE ANYWHERE',
    title: 'Send the link.',
    body: 'People run your app from any MCP client, browser, or with curl.',
    mono: 'one link, every tool',
  },
];
