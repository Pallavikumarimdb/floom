'use client';
import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, clearSession } from '@/hooks/useSession';

// v17 palette
const INK = '#0e0e0c';
const MUTED = '#585550';
const BG = '#fafaf8';

const WORDMARK_SIZE = 17;
const MARK_SIZE_DEFAULT = 22;
const MARK_SIZE_COMPACT = 18;

const navLinkBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '7px 10px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1,
  textDecoration: 'none',
  color: MUTED,
  transition: 'color 0.12s',
};

function navLinkStyle(active: boolean): CSSProperties {
  return { ...navLinkBase, color: active ? INK : MUTED, fontWeight: active ? 600 : 500 };
}

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

interface Props {
  onSignIn?: () => void;
  compact?: boolean;
  onStudioMenuOpen?: () => void;
}

// TODO(v5-port): Logo component — using inline img from public assets
function FloomLogoMark({ size }: { size: number }) {
  return (
    <img
      // TODO(v5-port): floom-mark-glow.svg for 'glow' variant; using plain here
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

  const isApps = pathname === '/apps' || pathname?.startsWith('/apps/') || pathname?.startsWith('/p/');
  const isDocs = pathname?.startsWith('/protocol') || pathname?.startsWith('/docs');
  const isStudio = pathname?.startsWith('/studio');

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
      // TODO(v5-port): floom-minimal uses Supabase sign out, not api.signOut()
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
        data-context={isStudio ? 'studio' : 'store'}
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
            href={showAuthedChrome ? '/run/apps' : '/'}
            className="brand"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              color: INK,
              flexShrink: 0,
            }}
            aria-label="floom — home"
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

          {/* Centre nav — floom-minimal v0 strips dead links until pages exist.
              floom.dev's Apps/Docs/Pricing/Changelog routes don't exist here. */}

          {/* Right side */}
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
              zIndex: 200,
              padding: '16px 24px 32px',
              borderTop: '1px solid var(--line)',
              overflowY: 'auto',
            }}
          >
            {/* v7: floom-minimal v0 mobile menu has no Apps/Docs/Pricing/
                Changelog routes — strip to prevent dead links. */}
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
      </header>

      {/* Mobile MCP pill — hidden on app permalink routes */}
      {!isLoginPage && !showAuthedChrome && !isAppPermalinkRoute && (
        <div className="topbar-mcp-mobile" data-testid="topbar-mcp-mobile">
          {/* TODO(v5-port): CopyForClaudeButton not ported — placeholder */}
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
  const MUTED = '#585550';
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
