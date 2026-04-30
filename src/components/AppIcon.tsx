'use client';
// TODO(v5-port): AppIcon — stub of floom@main/components/AppIcon.tsx
// Original loads per-slug SVG icons from /public/app-icons/ with fallback
// to a monogram tile. This stub renders the monogram fallback always.
// See docs/v5-port-stubs.md for full stub list.

interface AppIconProps {
  slug: string;
  size?: number;
}

export function AppIcon({ slug, size = 24 }: AppIconProps) {
  const initials = slug.replace(/-/g, '').slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: Math.round(size * 0.45),
        fontWeight: 700,
        color: 'var(--accent)',
        textTransform: 'uppercase',
      }}
    >
      {initials}
    </span>
  );
}
