'use client';
// Original shows the Claude skill install one-liner + example agent prompt.
// R7.6 (2026-04-28): SkillModal retained for backwards-compat with deep links;
// primary install affordance moved to InstallPopover.

interface SkillModalProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  appName: string;
  firstInputName?: string | null;
}

export function SkillModal({ open, onClose, appName }: SkillModalProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Install ${appName} as Skill`}
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
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>
          Install {appName} as Skill
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
          Full skill install modal coming in RunSurface v5 port.
        </p>
        <button type="button" onClick={onClose} style={{ fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          Close
        </button>
      </div>
    </div>
  );
}
