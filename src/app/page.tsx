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
import { FeedbackButton } from '@/components/FeedbackButton';

import { WorksWithBelt } from '@/components/home/WorksWithBelt';
import { HeroDemo } from '@/components/home/HeroDemo';
import { SectionEyebrow } from '@/components/home/SectionEyebrow';
import { DiscordCta } from '@/components/home/DiscordCta';

import { useSession } from '@/hooks/useSession';
import { createClient } from '@/lib/supabase/client';

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

function MvpHeroInstall({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [copied, setCopied] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleCopy() {
    await copyText(NPX_SETUP_COMMAND);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function signUpWithGoogle() {
    setGoogleLoading(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=/tokens`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) setGoogleLoading(false);
    // On success browser redirects — no cleanup needed.
  }

  // R7.6 (2026-04-28): MCP/CLI snippet popover removed from hero.
  // Design brief: cut hero to 4 elements. Advanced install paths
  // (MCP config, CLI snippet) live on /home and /docs — not in the
  // first viewport.

  return (
    <div style={{ maxWidth: 560, margin: '28px auto 0', textAlign: 'left' }}>
      {/* v12: demo-first hero. Auditor flagged auth-first as activation
          friction (the only primary CTA was "Create token"). New order:
          1) "Try the live demo" — solid primary, one click, no signup
          2) "Sign up with Google" — 2-click signup path for builders (anon only)
          3) install command card — secondary, for builders who want to publish
      */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: isAuthenticated ? 22 : 14 }}>
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

      {/* Sign up with Google — 2-click path. Hidden for authenticated users. */}
      {!isAuthenticated && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <button
            type="button"
            data-testid="hero-signup-google"
            onClick={() => void signUpWithGoogle()}
            disabled={googleLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '11px 24px',
              border: '1px solid var(--line)',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink)',
              background: 'var(--card)',
              cursor: googleLoading ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 1px 2px rgba(22,21,18,0.04)',
              opacity: googleLoading ? 0.6 : 1,
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            {/* Google G icon — original 4-colour mark */}
            <svg width={16} height={16} viewBox="0 0 18 18" aria-hidden="true">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.616z" fill="#4285F4" />
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
              <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" fill="#EA4335" />
            </svg>
            {googleLoading ? 'Redirecting…' : 'Sign up with Google'}
          </button>
        </div>
      )}

      <div
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          textAlign: 'center',
          marginBottom: 10,
        }}
      >
        or publish your own
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
            href="/settings/agent-tokens"
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
            Manage your tokens →
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
            <MvpHeroInstall isAuthenticated={isAuthenticated} />
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
              filler. Full variant kept its placement here. */}
          <HeroDemo />
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
      <FeedbackButton />
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
