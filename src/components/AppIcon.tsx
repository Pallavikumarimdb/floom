'use client';
// TODO(v5-port): AppIcon — stub of floom@main/components/AppIcon.tsx
// v11: improved stub — renders a tasteful icon glyph instead of a text monogram.
// For known slugs renders a relevant icon; fallback is a terminal prompt icon.

interface AppIconProps {
  slug: string;
  size?: number;
}

// Map slug keywords to simple SVG icon paths (Lucide-style).
function IconForSlug({ slug, size }: { slug: string; size: number }) {
  const s = size * 0.55;
  const sw = Math.max(1.4, size / 18);
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent)',
  };

  // Meeting / action-items / task / todo apps — clipboard-with-checkmark
  if (
    slug.includes('meeting') ||
    slug.includes('action') ||
    slug.includes('task') ||
    slug.includes('todo')
  ) {
    return (
      <span style={base}>
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {/* clipboard body */}
          <path d="M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1z" />
          <path d="M16 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
          {/* checkmark lines */}
          <polyline points="9 12 11 14 15 10" />
        </svg>
      </span>
    );
  }

  // Pitch / writing apps
  if (slug.includes('pitch') || slug.includes('coach') || slug.includes('writ')) {
    return (
      <span style={base}>
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </span>
    );
  }

  // Competitor / lens / analysis
  if (slug.includes('lens') || slug.includes('compet') || slug.includes('audit') || slug.includes('readiness')) {
    return (
      <span style={base}>
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
    );
  }

  // Demo app / generic
  return (
    <span style={base}>
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    </span>
  );
}

export function AppIcon({ slug, size = 24 }: AppIconProps) {
  return <IconForSlug slug={slug} size={size} />;
}
