'use client';
// Original renders rich banner-card thumbnails + editorial copy.
// This stub renders the same AppStripe layout for v0 compatibility.
import Link from 'next/link';
import type { CSSProperties } from 'react';

// Minimal HubApp type compatible with what LandingV17Page passes.
interface HubApp {
  slug: string;
  name: string;
  description: string;
  category?: string;
  runs_7d?: number;
}

export interface ShowcaseEntry {
  slug: string;
  name: string;
  description: string;
  category: string;
  bannerTitle: string;
  bannerLines: Array<{ text: string; dim?: boolean; accent?: boolean }>;
  installVia: string;
  tags: string[];
  topFeatured?: boolean;
}

export const SHOWCASE_ENTRIES: ShowcaseEntry[] = [
  {
    slug: 'meeting-action-items',
    name: 'Meeting Action Items',
    description:
      'Pull owned tasks out of meeting notes and return clean JSON for follow-up.',
    category: 'Operations',
    bannerTitle: 'meeting-action-items',
    bannerLines: [
      { text: 'transcript pasted' },
      { text: '3 owners found', accent: true },
      { text: 'Friday · tomorrow · launch', dim: true },
    ],
    installVia: 'via Floom or Claude',
    tags: ['operations', 'meetings'],
    topFeatured: true,
  },
];

interface ShowcaseCardProps {
  entry: ShowcaseEntry;
  app?: HubApp;
  isHero?: boolean;
}

const CARD_STYLE: CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--line)',
  borderRadius: 16,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  transition: 'box-shadow 140ms ease, transform 140ms ease',
};

const THUMB_STYLE: CSSProperties = {
  background: 'var(--studio)',
  padding: '20px 22px',
  borderBottom: '1px solid var(--line)',
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 12,
  color: 'var(--muted)',
};

const BODY_STYLE: CSSProperties = {
  padding: '20px 22px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  flex: 1,
};

export function ShowcaseCard({ entry, app }: ShowcaseCardProps) {
  const name = app?.name ?? entry.name;
  const description = app?.description ?? entry.description;

  return (
    <div
      style={CARD_STYLE}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = '0 8px 24px -12px rgba(14,14,12,0.18)';
        el.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = 'none';
        el.style.transform = 'translateY(0)';
      }}
    >
      {/* Banner thumb */}
      <div style={THUMB_STYLE}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>
          {entry.bannerTitle}
        </div>
        {entry.bannerLines.map((line, i) => (
          <div
            key={i}
            style={{
              color: line.accent ? 'var(--accent)' : line.dim ? 'var(--muted)' : 'var(--ink)',
              opacity: line.dim ? 0.7 : 1,
              lineHeight: 1.6,
            }}
          >
            {line.text}
          </div>
        ))}
      </div>

      {/* Card body */}
      <div style={BODY_STYLE}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>{name}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{description}</div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {entry.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10.5,
                color: 'var(--muted)',
                background: 'var(--studio)',
                border: '1px solid var(--line)',
                borderRadius: 6,
                padding: '2px 8px',
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        <Link
          href={`/p/${entry.slug}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 'auto',
            paddingTop: 8,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--accent)',
            textDecoration: 'none',
          }}
        >
          Open app <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
