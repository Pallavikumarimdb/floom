'use client';
// TODO(v5-port): RunSurface — stub of floom@main/components/runner/RunSurface.tsx
// Original is 3605 lines: full input/output split layout, streaming terminal,
// job progress, action selector, output toolbar (copy/download/expand/share).
// This stub renders the existing AppRunSurface for functional compatibility.
// See docs/v5-port-stubs.md for full stub list.

import type { AppDetail, RunRecord } from '@/lib/types';

export interface RunSurfaceResult {
  runId?: string;
  status?: string;
  output?: unknown;
}

interface RunSurfaceProps {
  app: AppDetail;
  initialRun?: RunRecord | null;
  initialInputs?: Record<string, unknown>;
  onResetInitialRun?: () => void;
  onResult?: (result: RunSurfaceResult) => void;
  onShare?: () => void;
}

export function RunSurface({ app, initialRun, initialInputs }: RunSurfaceProps) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: '24px',
        minHeight: 240,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* TODO(v5-port): Wire full RunSurface (inputs + run button + output panel) */}
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
        Run surface for <strong style={{ color: 'var(--ink)' }}>{app.name}</strong>
        {initialRun && (
          <span> · shared run <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{initialRun.id}</code></span>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)' }}>
        Full run surface (inputs + streaming output) ships with RunSurface v5 port.
      </p>
    </div>
  );
}

interface PastRunsDisclosureProps {
  appSlug: string;
  defaultOpen?: boolean;
}

export function PastRunsDisclosure({ appSlug }: PastRunsDisclosureProps) {
  return (
    <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>
      {/* TODO(v5-port): Wire PastRunsDisclosure — paginated run list */}
      Past runs for <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{appSlug}</code> will appear here.
    </div>
  );
}
