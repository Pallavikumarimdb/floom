'use client';
// Original renders a Notion-style share dialog with copy link, visibility toggle,

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  appName: string;
  visibility?: string;
  shareUrl: string;
  isOwner?: boolean;
}

export function ShareModal({ open, onClose, appName, shareUrl }: ShareModalProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${appName}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: '24px',
          width: '100%',
          maxWidth: 420,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 12px' }}>
          Share {appName}
        </h2>
        <div
          style={{
            display: 'flex',
            gap: 8,
            background: 'var(--studio)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '8px 10px',
          }}
        >
          <span style={{ flex: 1, fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {shareUrl}
          </span>
          <button
            type="button"
            onClick={() => { try { navigator.clipboard.writeText(shareUrl); } catch { /* ignore */ } }}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
          >
            Copy
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
