'use client';
// v6 (2026-05-01): functional RunSurface for floom-minimal v0.
// Replaces the placeholder stub. Renders the app's input fields from
// input_schema, sends a POST to /api/apps/<slug>/run, displays output.
// Not feature-parity with floom@main's 3605-line RunSurface (no streaming
// terminal, no output toolbar, no run history) — but it actually runs
// the app, which the stub did not.

import { useEffect, useMemo, useState } from 'react';
import type { AppDetail, RunRecord } from '@/lib/types';

export interface RunSurfaceResult {
  runId?: string;
  status?: string;
  output?: unknown;
}

interface RunSurfaceProps {
  app: AppDetail & { input_schema?: unknown; output_schema?: unknown; handler?: string };
  initialRun?: RunRecord | null;
  initialInputs?: Record<string, unknown>;
  onResetInitialRun?: () => void;
  onResult?: (result: RunSurfaceResult) => void;
  onShare?: () => void;
}

type SchemaProperty = {
  type?: string;
  title?: string;
  description?: string;
  format?: string;
  enum?: ReadonlyArray<string>;
  default?: unknown;
};

type InputSchema = {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: ReadonlyArray<string>;
};

type RunState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; output: unknown; ms: number }
  | { kind: 'error'; message: string };

function fieldsFromSchema(schema: InputSchema | undefined) {
  if (!schema?.properties) return [];
  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    title: prop.title ?? name,
    description: prop.description ?? '',
    type: prop.type ?? 'string',
    required: schema.required?.includes(name) ?? false,
    enum: prop.enum,
    defaultValue: prop.default,
  }));
}

export function RunSurface({ app, initialRun, initialInputs, onResult }: RunSurfaceProps) {
  const schema = (app.input_schema ?? null) as InputSchema | null;
  const fields = useMemo(() => fieldsFromSchema(schema ?? undefined), [schema]);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const f of fields) {
      const fromInitial = initialInputs?.[f.name];
      if (fromInitial !== undefined && fromInitial !== null) {
        seed[f.name] = String(fromInitial);
      } else if (f.defaultValue !== undefined) {
        seed[f.name] = String(f.defaultValue);
      } else {
        seed[f.name] = '';
      }
    }
    return seed;
  });

  const [state, setState] = useState<RunState>(() =>
    initialRun?.output
      ? { kind: 'ok', output: initialRun.output, ms: 0 }
      : { kind: 'idle' },
  );

  useEffect(() => {
    if (initialRun?.output) {
      setState({ kind: 'ok', output: initialRun.output, ms: 0 });
    }
  }, [initialRun]);

  const canRun = fields.every((f) => !f.required || (values[f.name] && values[f.name].trim() !== ''));

  async function run() {
    setState({ kind: 'running' });
    const t0 = performance.now();
    try {
      // Coerce to types the schema declares (numbers, booleans).
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        const raw = values[f.name];
        if (raw === '' || raw === undefined) continue;
        if (f.type === 'integer' || f.type === 'number') {
          const n = Number(raw);
          payload[f.name] = Number.isFinite(n) ? n : raw;
        } else if (f.type === 'boolean') {
          payload[f.name] = raw === 'true';
        } else {
          payload[f.name] = raw;
        }
      }
      const res = await fetch(`/api/apps/${app.slug}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inputs: payload }),
      });
      const data = (await res.json().catch(() => null)) as
        | { execution_id?: string; status?: string; output?: unknown; error?: string }
        | null;
      const ms = Math.round(performance.now() - t0);
      if (!res.ok || !data || data.error) {
        setState({
          kind: 'error',
          message: data?.error ?? `Run failed (HTTP ${res.status})`,
        });
        return;
      }
      setState({ kind: 'ok', output: data.output, ms });
      onResult?.({ runId: data.execution_id, status: data.status, output: data.output });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  function reset() {
    const seed: Record<string, string> = {};
    for (const f of fields) seed[f.name] = '';
    setValues(seed);
    setState({ kind: 'idle' });
  }

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          minHeight: 320,
        }}
      >
        {/* Inputs */}
        <div style={{ padding: 24, borderRight: '1px solid var(--line)' }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              marginBottom: 12,
            }}
          >
            Inputs · {fields.length} field{fields.length === 1 ? '' : 's'}
          </div>
          {fields.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              This app takes no inputs.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {fields.map((f) => (
                <label
                  key={f.name}
                  style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    {f.title}
                    {f.required && (
                      <span aria-hidden="true" style={{ color: 'var(--accent)', marginLeft: 4 }}>
                        *
                      </span>
                    )}
                  </span>
                  {f.description && (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{f.description}</span>
                  )}
                  {f.enum ? (
                    <select
                      value={values[f.name] ?? ''}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.name]: e.target.value }))
                      }
                      style={inputStyle}
                    >
                      <option value="">—</option>
                      {f.enum.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'string' && (f.title.toLowerCase().includes('pitch') || f.description.length > 40) ? (
                    <textarea
                      value={values[f.name] ?? ''}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.name]: e.target.value }))
                      }
                      rows={4}
                      style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  ) : (
                    <input
                      type={f.type === 'integer' || f.type === 'number' ? 'number' : 'text'}
                      value={values[f.name] ?? ''}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.name]: e.target.value }))
                      }
                      style={inputStyle}
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => void run()}
              disabled={state.kind === 'running' || !canRun}
              style={{
                padding: '9px 18px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: state.kind === 'running' || !canRun ? 'not-allowed' : 'pointer',
                opacity: state.kind === 'running' || !canRun ? 0.55 : 1,
                fontFamily: 'inherit',
              }}
            >
              {state.kind === 'running' ? 'Running…' : 'Run'}
            </button>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '9px 14px',
                background: 'var(--card)',
                color: 'var(--ink)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Output */}
        <div style={{ padding: 24, background: 'var(--bg)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
              }}
            >
              Output
            </span>
            {state.kind === 'ok' && (
              <span
                style={{
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 10.5,
                  color: 'var(--muted)',
                }}
              >
                {state.ms} ms
              </span>
            )}
          </div>

          {state.kind === 'idle' && (
            <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
              Press <span style={{ fontStyle: 'normal', fontFamily: 'monospace' }}>Run</span> to see the response.
            </p>
          )}
          {state.kind === 'running' && (
            <p style={{ fontSize: 13, color: '#b45309' }}>Talking to the sandbox…</p>
          )}
          {state.kind === 'ok' && (
            <pre
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 12.5,
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: 14,
                margin: 0,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'var(--ink)',
                maxHeight: 400,
                overflow: 'auto',
              }}
            >
              {typeof state.output === 'string'
                ? state.output
                : JSON.stringify(state.output, null, 2)}
            </pre>
          )}
          {state.kind === 'error' && (
            <p
              style={{
                fontSize: 13,
                color: '#b91c1c',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: 12,
                margin: 0,
              }}
            >
              {state.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  padding: '9px 12px',
  border: '1px solid var(--line)',
  borderRadius: 8,
  fontSize: 13.5,
  background: 'var(--card)',
  color: 'var(--ink)',
  outline: 'none',
  fontFamily: 'inherit',
} as const;

interface PastRunsDisclosureProps {
  appSlug: string;
  defaultOpen?: boolean;
}

export function PastRunsDisclosure({ appSlug }: PastRunsDisclosureProps) {
  return (
    <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>
      {/* TODO(v5-port): Wire PastRunsDisclosure — paginated run list. v0
          ships without per-user run history; this is fed by /api/apps/<slug>/runs
          which doesn't exist yet on floom-minimal. */}
      Run history for <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{appSlug}</code> coming in v0.1.
    </div>
  );
}
