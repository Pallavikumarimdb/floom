'use client';
// TODO(v5-port): AppStripe — minimal port of floom@main/components/public/AppStripe.tsx
// Original uses AppIcon, DescriptionMarkdown, categoryTint. Stubbed with simple card layout.
// See docs/v5-port-stubs.md for full stub list.
import Link from 'next/link';
import type { CSSProperties } from 'react';

interface AppStripeProps {
  slug: string;
  name: string;
  description: string;
  meta?: string;
  variant?: 'landing' | 'apps';
  category?: string;
}

export function AppStripe({ slug, name, description, meta, variant = 'landing' }: AppStripeProps) {
  const LINK_STYLE: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 18,
    padding: variant === 'landing' ? '22px 24px' : '20px 22px',
    background: 'var(--card)',
    border: '1px solid var(--line)',
    borderRadius: 14,
    color: 'inherit',
    textDecoration: 'none',
    transition: 'border-color 140ms ease, transform 140ms ease',
  };

  return (
    <Link
      href={`/p/${slug}`}
      data-testid={`app-stripe-${slug}`}
      style={LINK_STYLE}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.borderColor = 'var(--ink)';
        el.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.borderColor = 'var(--line)';
        el.style.transform = 'translateY(0)';
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'var(--studio)',
          color: 'var(--accent)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        {name.slice(0, 2)}
      </span>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
          {name}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 3 }}>
          {description}
        </div>
      </div>

      {meta && (
        <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{meta}</span>
      )}

      <span style={{ color: 'var(--muted)', flexShrink: 0 }} aria-hidden="true">→</span>
    </Link>
  );
}
