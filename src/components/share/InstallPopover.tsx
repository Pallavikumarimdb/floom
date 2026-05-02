'use client';
// Original renders a popover with MCP / CLI / Skill tabs.
// R7.6 (2026-04-28): unified install affordance (replaces Install in workspace +
// Install as Skill separate buttons).

interface InstallPopoverProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  appName: string;
  isAuthenticated?: boolean;
  hasToken?: boolean;
  firstInputName?: string | null;
}

export function InstallPopover({ open, onClose, slug, appName }: InstallPopoverProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Install ${appName}`}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 8,
        zIndex: 40,
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: '16px 18px',
        width: 320,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>
        Install {appName}
      </h3>
      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11.5,
          background: 'var(--studio)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: '8px 10px',
          color: 'var(--ink)',
          marginBottom: 8,
        }}
      >
        {typeof window !== 'undefined' ? `${window.location.origin}/mcp/app/${slug}` : `/mcp/app/${slug}`}
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Close
      </button>
    </div>
  );
}
