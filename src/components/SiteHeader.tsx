'use client';
import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, clearSession } from '@/hooks/useSession';

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function useGitHubStars(repo: string): number | null {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.github.com/repos/${repo}`, {
      headers: { 'Accept': 'application/vnd.github+json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setStars(data.stargazers_count as number); })
      .catch(() => {/* silently hide badge on error */});
    return () => { cancelled = true; };
  }, [repo]);
  return stars;
}

function IconGitHubNav() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

// v17 palette
const INK = '#0e0e0c';
const MUTED = '#585550';
const BG = '#fafaf8';

const WORDMARK_SIZE = 17;
const MARK_SIZE_DEFAULT = 17;
const MARK_SIZE_COMPACT = 15;

const signInStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '7px 14px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1,
  textDecoration: 'none',
  color: INK,
  border: '1px solid rgba(14,14,12,0.18)',
  background: BG,
  transition: 'border-color 0.12s',
};

const signUpStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '7px 14px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1,
  textDecoration: 'none',
  color: '#fff',
  background: INK,
  border: '1px solid ' + INK,
  transition: 'opacity 0.12s',
};

const menuItemStyle: CSSProperties = {
  display: 'block',
  padding: '8px 12px',
  fontSize: 13,
  color: INK,
  textDecoration: 'none',
  borderRadius: 6,
};

const navLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '7px 8px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1,
  textDecoration: 'none',
  color: MUTED,
};

interface Props {
  onSignIn?: () => void;
  compact?: boolean;
  onStudioMenuOpen?: () => void;
}

function FloomLogoMark({ size }: { size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/floom-mark-glow.svg"
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, display: 'inline-block' }}
      draggable={false}
    />
  );
}

export function SiteHeader({ compact = false, onStudioMenuOpen }: Props = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const githubStars = useGitHubStars('floomhq/floom');
  const pathname = usePathname();
  const router = useRouter();
  const { data, isAuthenticated, refresh } = useSession();
  const dropRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // In floom-minimal there is no deploy-enabled flag — always treat as deploy-enabled
  const deployEnabled = true;
  const showAuthedChrome = isAuthenticated && deployEnabled;

  const isLoginPage = pathname === '/login' || pathname === '/signup';
  const isSignInRoute = pathname === '/login';
  const isSignUpRoute = pathname === '/signup';
  const isAppPermalinkRoute = pathname?.startsWith('/p/') ?? false;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Close the mobile menu on every route change. This is a layout side-effect
  // (resetting UI state driven by the router) — not a data-fetch or external
  // system sync, but it genuinely needs to run after the pathname flips.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        hamburgerRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  async function handleLogout() {
    try {
      // TODO: floom-minimal uses Supabase sign out, not api.signOut()
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    clearSession();
    await refresh();
    setDropOpen(false);
    router.push('/');
  }

  const user = data?.user;
  const userLabel = user?.name || user?.email?.split('@')[0] || 'user';
  const userInitial = userLabel.charAt(0).toUpperCase();
  const ACCENT = '#047857';

  return (
    <>
      <header
        className="topbar"
        data-context="store"
        data-compact={compact ? 'true' : 'false'}
        style={compact ? { height: 40, top: 0 } : undefined}
      >
        <div
          className="topbar-inner"
          data-edge-aligned={pathname === '/' ? 'false' : 'true'}
          style={{
            gap: compact ? 10 : 16,
            padding: compact ? '0 20px' : undefined,
          }}
        >
          {/* Logo lockup */}
          <Link
            href="/"
            className="brand"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              color: INK,
              flexShrink: 0,
            }}
            aria-label="floom home"
          >
            <FloomLogoMark size={compact ? MARK_SIZE_COMPACT : MARK_SIZE_DEFAULT} />
            <span
              style={{
                fontSize: compact ? 15 : WORDMARK_SIZE,
                fontWeight: 900,
                letterSpacing: '-0.02em',
                lineHeight: 1,
                color: INK,
              }}
            >
              floom<span aria-hidden="true" style={{ color: '#10b981' }}>.</span>
            </span>
            <span
              aria-label="Beta"
              style={{
                display: 'inline-block',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.06em',
                lineHeight: 1,
                color: MUTED,
                border: '1px solid rgba(88,85,80,0.35)',
                borderRadius: 3,
                padding: '2px 4px',
                textTransform: 'uppercase',
                marginLeft: 2,
                verticalAlign: 'middle',
                position: 'relative',
                top: -1,
              }}
            >
              Beta
            </span>
          </Link>

          {/* Studio-only mobile sidebar toggle */}
          {onStudioMenuOpen && (
            <button
              type="button"
              className="topbar-studio-toggle"
              data-testid="studio-mobile-toggle"
              aria-label="Open Studio menu"
              onClick={onStudioMenuOpen}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}

          <nav
            aria-label="Site navigation"
            className="topbar-links topbar-links-desktop"
            style={{
              gap: 8,
              marginLeft: 'auto',
              paddingLeft: 24,
              alignItems: 'center',
            }}
          >
            {/* Docs link */}
            <Link href="/docs" style={{ ...navLinkStyle, color: pathname === '/docs' ? INK : MUTED }}>
              Docs
            </Link>

            {/* GitHub stars badge */}
            <a
              href="https://github.com/floomhq/floom"
              target="_blank"
              rel="noreferrer"
              aria-label="Floom on GitHub"
              data-testid="topbar-github"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 12.5,
                fontWeight: 500,
                color: MUTED,
                textDecoration: 'none',
                border: '1px solid rgba(14,14,12,0.14)',
                background: BG,
                lineHeight: 1,
              }}
            >
              <IconGitHubNav />
              {githubStars !== null && (
                <span style={{ fontWeight: 600, color: INK }}>
                  ★ {formatStars(githubStars)}
                </span>
              )}
            </a>

            {/* Sign in / Sign up for unauthenticated */}
            {!isAuthenticated && deployEnabled && (
              <>
                <Link
                  href="/login"
                  data-testid="topbar-signin"
                  style={isSignInRoute ? signInStyle : isSignUpRoute ? signUpStyle : signInStyle}
                >
                  Sign in
                </Link>
                <Link
                  href="/login?mode=signup"
                  data-testid="topbar-signup"
                  style={isSignUpRoute ? signInStyle : signUpStyle}
                >
                  Sign up
                </Link>
              </>
            )}

            {/* Avatar dropdown for authenticated */}
            {isAuthenticated && data && (
              <div ref={dropRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setDropOpen((v) => !v)}
                  data-testid="topbar-user-trigger"
                  aria-label="Account menu"
                  aria-haspopup="menu"
                  aria-expanded={dropOpen}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px 4px 4px',
                    border: '1px solid rgba(14,14,12,0.14)',
                    borderRadius: 999,
                    background: BG,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {user?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.image}
                      alt=""
                      width={24}
                      height={24}
                      style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: ACCENT,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                      data-testid="topbar-user-avatar-initial"
                    >
                      {userInitial}
                    </span>
                  )}
                  <span style={{ fontSize: 13, color: INK }} className="topbar-user-label">
                    {userLabel}
                  </span>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke={MUTED} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true"
                    data-testid="topbar-user-chevron"
                    style={{
                      flexShrink: 0,
                      transition: 'transform 0.12s ease',
                      transform: dropOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {dropOpen && (
                  <div
                    role="menu"
                    data-testid="topbar-user-menu"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      background: BG,
                      border: '1px solid rgba(14,14,12,0.12)',
                      borderRadius: 8,
                      minWidth: 240,
                      boxShadow: '0 4px 16px rgba(14,14,12,0.08)',
                      padding: 4,
                      zIndex: 50,
                    }}
                  >
                    <DropdownItem
                      href="/tokens"
                      label="API tokens"
                      testId="topbar-user-tokens"
                      onSelect={() => setDropOpen(false)}
                      active={pathname === '/tokens'}
                    />
                    <button
                      type="button"
                      onClick={handleLogout}
                      role="menuitem"
                      data-testid="topbar-logout"
                      style={{
                        ...menuItemStyle,
                        background: 'transparent',
                        border: 'none',
                        width: '100%',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: INK,
                        fontFamily: 'inherit',
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Mobile hamburger */}
          {!onStudioMenuOpen && (
            <button
              ref={hamburgerRef}
              type="button"
              className="hamburger topbar-hamburger"
              data-testid="hamburger"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>
          )}
        </div>

      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          data-testid="mobile-menu"
          style={{
            position: 'fixed',
            top: compact ? 40 : 56,
            left: 0,
            right: 0,
            bottom: 0,
            background: BG,
            zIndex: 1000,
            padding: '16px 24px 32px',
            borderTop: '1px solid var(--line)',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
            <Link href="/docs" onClick={() => setMenuOpen(false)} style={menuItemStyle}>
              Docs
            </Link>
          </div>
          {!isAuthenticated && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                style={{ ...signInStyle, justifyContent: 'center', width: '100%' }}
              >
                Sign in
              </Link>
              <Link
                href="/login?mode=signup"
                onClick={() => setMenuOpen(false)}
                style={{ ...signUpStyle, justifyContent: 'center', width: '100%' }}
              >
                Sign up
              </Link>
            </div>
          )}
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => { void handleLogout(); setMenuOpen(false); }}
              style={{ ...signInStyle, justifyContent: 'center', width: '100%', cursor: 'pointer' }}
            >
              Sign out
            </button>
          )}
        </div>
      )}

      {/* Mobile MCP pill — hidden on app permalink routes */}
      {!isLoginPage && !showAuthedChrome && !isAppPermalinkRoute && (
        <div className="topbar-mcp-mobile" data-testid="topbar-mcp-mobile">
          {/* TODO: CopyForClaudeButton not ported — placeholder */}
        </div>
      )}
    </>
  );
}

function DropdownItem({
  href,
  label,
  testId,
  onSelect,
  active,
}: {
  href: string;
  label: string;
  testId: string;
  onSelect: () => void;
  active?: boolean;
}) {
  const INK = '#0e0e0c';
  return (
    <Link
      href={href}
      onClick={onSelect}
      role="menuitem"
      data-testid={testId}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        fontSize: 13,
        color: INK,
        textDecoration: 'none',
        borderRadius: 6,
        gap: 12,
      }}
    >
      <span>{label}</span>
    </Link>
  );
}
