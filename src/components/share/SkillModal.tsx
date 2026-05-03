'use client';
// SkillModal: shows CLI and MCP install snippets for adding a Floom app.
// Upgraded from placeholder to real install modal.

import { useState } from 'react';

interface SkillModalProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  appName: string;
  firstInputName?: string | null;
}

function CopySnippet({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    try {
      void navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    } catch { /* ignore */ }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--studio, #f5f4f0)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', marginTop: 6 }}>
      <span style={{ flex: 1, fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 11.5, color: 'var(--ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          background: 'var(--card)',
          color: copied ? 'var(--muted)' : 'var(--accent)',
          border: `1px solid ${copied ? 'var(--line)' : 'rgba(4,120,87,0.35)'}`,
          borderRadius: 6,
          padding: '4px 9px',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
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
          maxWidth: 460,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
            Install {appName}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ fontSize: 18, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1, padding: 0, marginLeft: 12 }}>
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: '0 0 2px' }}>Claude Code</p>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 0' }}>Add Floom as an MCP server in Claude Code.</p>
            <CopySnippet value="claude mcp add floom https://floom.dev/mcp" />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: '0 0 2px' }}>Cursor / ChatGPT / any MCP client</p>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 0' }}>Add the MCP endpoint to your client config.</p>
            <CopySnippet value="https://floom.dev/mcp" />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: '0 0 2px' }}>CLI setup</p>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 0' }}>Run and publish apps from your terminal.</p>
            <CopySnippet value="npx @floomhq/cli@latest setup" />
          </div>
        </div>
      </div>
    </div>
  );
}
