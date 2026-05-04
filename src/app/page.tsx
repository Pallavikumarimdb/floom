'use client';
/**
 * LandingV17Page — marketing home `/` — MVP variant.
 *
 * (variant="mvp" code paths only — `!isMvp` blocks dropped).
 * Mechanical fixes applied:
 *   1. 'use client' added (uses hooks)
 *   2. react-router-dom → next/link + next/navigation
 *   3. <Link to={x}> → <Link href={x}>
 *   4. useDeployEnabled, readDeployEnabled, waitlistHref stubs below
 *   5. api.getHub() → fetch('/api/hub').then(r=>r.json())
 *   6. HubApp type defined inline
 *   7. publicHubApps → inline no-op (all apps treated as public)
 */
import { useState } from 'react';
import Link from 'next/link';
import { Code2, Rocket, Share2 } from 'lucide-react';

import { SiteHeader } from '@/components/SiteHeader';
import { FloomFooter } from '@/components/FloomFooter';

import { WorksWithBelt } from '@/components/home/WorksWithBelt';
import { HeroDemo } from '@/components/home/HeroDemo';
import { SectionEyebrow } from '@/components/home/SectionEyebrow';
import { DiscordCta } from '@/components/home/DiscordCta';

import { useSession } from '@/hooks/useSession';

// MVP hero install — R7.6 (2026-04-28): hero composition cut to 4 elements
// (eyebrow, H1, sub, npx command). Caption + MCP/CLI popover removed —
// Design "the landing page hero header still looks a bit overwhelming".
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

function MvpHeroInstall() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyText(NPX_SETUP_COMMAND);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ maxWidth: 560, margin: '28px auto 0', textAlign: 'left' }}>
      {/* Demo-first hero. Primary CTA = one click, no signup required. */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
        <Link
          href="/p/meeting-action-items"
          data-testid="hero-try-live-app"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 28px',
            border: '1.5px solid var(--accent)',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            color: '#fff',
            background: 'var(--accent)',
            textDecoration: 'none',
            boxShadow: '0 2px 4px rgba(4,120,87,.18), 0 8px 22px rgba(4,120,87,.14)',
            letterSpacing: '-0.005em',
          }}
        >
          Try the live demo
          <span aria-hidden="true" style={{ opacity: 0.9 }}>→</span>
        </Link>
      </div>

      {/* CLI card — developer path. Shown to all visitors (anon + authed). */}
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          textAlign: 'center',
          marginBottom: 6,
        }}
      >
        Build your own
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--muted)',
          textAlign: 'center',
          marginBottom: 10,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        CLI for developers, free &amp; open-source, ~30s setup
      </div>
      {/* Install card: secondary — for builders who want to ship */}
      <div
        className="hero-install-card"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          padding: '8px 8px 8px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          boxShadow: '0 1px 2px rgba(22,21,18,.03)',
        }}
      >
        <pre
          data-testid="hero-npx-command"
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 12.5,
            color: 'var(--ink)',
            overflowX: 'auto',
            whiteSpace: 'pre',
            lineHeight: 1.5,
            margin: 0,
            background: 'transparent',
            border: 'none',
            padding: 0,
            flex: 1,
            minWidth: 0,
          }}
        >
          <span style={{ color: 'var(--muted)', userSelect: 'none', marginRight: 8 }}>$</span>
          {NPX_SETUP_COMMAND}
        </pre>
        <button
          type="button"
          data-testid="hero-npx-copy-btn"
          onClick={() => void handleCopy()}
          style={{
            flexShrink: 0,
            fontSize: 12.5,
            fontWeight: 600,
            color: copied ? '#fff' : 'var(--ink)',
            background: copied ? 'var(--accent)' : 'var(--bg)',
            border: `1px solid ${copied ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: 7,
            padding: '7px 14px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 0.15s, color 0.15s',
          }}
          aria-label={copied ? 'Copied' : 'Copy command'}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      {/* Trust strip removed — '1 app live' was hardcoded text (no GET
          /api/apps list endpoint exists in v0). Stats that aren't real are
          worse than no stats; bring this back when there's a real count. */}
    </div>
  );
}

export default function LandingV17PageMvp() {
  const { data: session, isAuthenticated } = useSession();

  return (
    <div
      className="page-root landing-v17"
      data-testid="landing-v17"
      style={{ minHeight: '100vh', background: 'var(--bg)' }}
    >
      <SiteHeader />

      {/* v26 §3 option C: resume banner for authenticated users.
          G1 (2026-04-28): slimmed to a 1-line stripe so it doesn't
          compete with the hero. Design: "the composition still is
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
            href="/docs/quickstart"
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
            Open the quickstart →
          </Link>
        </div>
      )}

      <main id="main" style={{ display: 'block' }}>
        {/* HERO — wireframe: .hero-shell > .hero
            Cursor-style layout (v0.1 — "the visual demo
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
            {/* G1 (2026-04-28): hero composition. Design call: the hero
                still felt overwhelming. Solution:
                - Lift "Backed by Founders Inc" ABOVE H1 as a quiet eyebrow
                  (positions the product, doesn't compete with the H1)
                - Add vertical breathing room around H1 + sub
                - Demote WorksWithBelt to a soft caption under the snippet
                - Resume banner slimmed to a 1-line stripe (above) */}
            {/* MVP eyebrow: WorksWithBelt above H1 — agent-agnostic
                positioning ("Works with any MCP client" + 3 logos) is
                more useful than a Founders Inc credential here. Founders
                Inc cohort credit stays in footer + WhosBehind.
                Design call (v0.1): hero eyebrow should be product
                positioning, not investor proof. */}
            <div data-testid="hero-eyebrow-belt" style={{ marginBottom: 32 }}>
              <WorksWithBelt />
            </div>

            {/* H1 — locked copy. Wireframe ships 64px desktop, balance wrap.
                F10 (2026-04-28): "fast" coloured with brand green for emphasis.
                v11: hero-accent-word class adds underline-draw animation. */}
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
              Localhost to{' '}
              <span className="hero-accent-word" style={{ color: 'var(--accent)' }}>live</span>{' '}
              in 60 seconds.
            </h1>

            <p
              data-testid="hero-qualifier"
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 16,
                lineHeight: 1.5,
                fontWeight: 400,
                color: 'var(--muted)',
                margin: '-4px 0 20px',
              }}
            >
              Your AI wrote your code. Floom puts it online. Anyone can use it. Agents can call it.
            </p>

            {/* CTA — demo-first button + secondary install card. */}
            <MvpHeroInstall />
            {/* WorksWithBelt moved to the eyebrow above H1 (
                2026-04-28). No longer rendered under the snippet — it
                was a second hero element competing with H1+snippet. */}
          </div>

          {/* R7.6 followup (2026-04-28): HeroDemo lives directly under
              the hero install snippet (above "From idea to shipped app
              in 3 steps"). Earlier R7.6 pushed it BELOW that section
              to calm the hero, but Flagged: it as "too low" —
              hero box stays clean (no demo INSIDE it) but the demo
              should still anchor near hero so it reads as proof, not
              filler. Full variant kept its placement here.
              Mobile (<md): hidden — 580px fixed canvas overflows 375px
              viewport. Hero H1 + CTAs are the primary mobile experience. */}
          <div className="hidden md:block">
            <HeroDemo />
          </div>
        </section>

        {/* HOW IT WORKS — 3 steps */}
        <section
          data-testid="how-it-works"
          style={{ padding: '72px 28px', maxWidth: 1240, margin: '0 auto' }}
        >
          <SectionEyebrow>How it works</SectionEyebrow>
          {/* v6 (2026-05-01): "How it works" H2 changed per design — was
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
                {/* v11: action line is the visual anchor — accent colour + stronger weight */}
                <div
                  style={{
                    marginTop: 14,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--accent)',
                    background: 'rgba(4,120,87,0.06)',
                    border: '1px solid rgba(4,120,87,0.15)',
                    borderRadius: 6,
                    padding: '5px 10px',
                    display: 'inline-block',
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
            Flagged: floom-minimal originally only had demo-app, and
            the showcase + directory cards link to floom.dev/p/<slug>
            which violates the self-contained rule. The cards return
            once floom-minimal has its own apps table populated. */}

        {/* DISCORD CTA — quiet chip above the footer. Not a second hero, just
            a visible path for visitors who want to talk to the team or other
            builders. */}
        <DiscordCta />
      </main>

      <FloomFooter />
    </div>
  );
}


const STEPS = [
  {
    num: '01',
    kicker: 'WRITE',
    title: "A Python function. Yours or your AI's.",
    body: 'A floom.yaml + app.py + JSON Schema for inputs. Or copy a template from MCP.',
    mono: 'floom init',
  },
  {
    num: '02',
    kicker: 'PUBLISH',
    title: 'One CLI command.',
    body: 'Floom hosts the UI, the REST endpoint, and an MCP tool agents can call.',
    mono: 'floom deploy',
  },
  {
    num: '03',
    kicker: 'SHARE',
    title: 'Send the link.',
    body: 'People run it from a browser. Agents run it via MCP. Anyone runs it via curl.',
    mono: 'one link, every tool',
  },
];
