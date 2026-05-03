'use client';
import Link from 'next/link';
import type { CSSProperties } from 'react';

function IconGitHubFooter() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function IconDiscordFooter() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.001.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

const ICON_LINK: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  color: 'var(--muted)',
  textDecoration: 'none',
  fontSize: 12.5,
  fontWeight: 500,
  transition: 'color 0.15s',
};

export function FloomFooter() {
  return (
    <footer
      data-testid="public-footer"
      className="public-footer"
      style={{
        padding: '24px 28px',
        background: 'var(--card)',
        borderTop: '1px solid var(--line)',
        boxSizing: 'border-box',
        overflowX: 'clip',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          maxWidth: 1180,
          margin: '0 auto',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Link
            href="/"
            style={{
              fontFamily: 'var(--font-display, Inter), system-ui, sans-serif',
              fontWeight: 900,
              fontSize: 16,
              color: 'var(--ink)',
              textDecoration: 'none',
              letterSpacing: '-0.02em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/floom-mark-glow.svg"
              alt=""
              aria-hidden="true"
              width={20}
              height={20}
              style={{ display: 'inline-block' }}
            />
            <span>
              floom<span aria-hidden="true" style={{ color: '#10b981' }}>.</span>
            </span>
          </Link>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Localhost to live in 60 seconds.
          </span>
        </div>

        <div style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <a href="/docs" style={ICON_LINK}>
            Docs
          </a>
          <a href="/status" style={ICON_LINK}>
            Status
          </a>
          <a href="/impressum" style={ICON_LINK}>
            Impressum
          </a>
          <a href="/datenschutz" style={ICON_LINK}>
            Datenschutz
          </a>
          <a href="/privacy" style={ICON_LINK}>
            Privacy
          </a>
          <a
            href="https://github.com/floomhq/floom"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            style={ICON_LINK}
          >
            <IconGitHubFooter />
            GitHub
          </a>
          <a
            href="https://discord.gg/8fXGXjxcRz"
            target="_blank"
            rel="noreferrer"
            aria-label="Discord"
            style={ICON_LINK}
          >
            <IconDiscordFooter />
            Discord
          </a>
          {/* contrast: was opacity 0.7 (3.54:1 on card), raised to 0.80 (4.52:1) — WCAG AA 4.5:1 */}
          <span style={{ fontSize: 12.5, color: 'var(--muted)', opacity: 0.80 }}>© 2026 Floom</span>
        </div>
      </div>
    </footer>
  );
}
