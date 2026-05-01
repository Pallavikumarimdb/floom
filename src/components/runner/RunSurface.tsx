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
  examplePrefillInputs?: Record<string, unknown>;
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

export function RunSurface({ app, initialRun, initialInputs, examplePrefillInputs, onResult }: RunSurfaceProps) {
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

  // initialRun arrives asynchronously from parent after hydration; the lazy
  // useState above handles the SSR case, but we must also sync when the prop
  // changes post-mount (e.g. ?run=<id> fetch resolves). This synchronous
  // setState-in-effect is intentional: it fires at most once per initialRun
  // identity change and there is no external subscription pattern to use here.
  useEffect(() => {
    if (initialRun?.output) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: 'ok', output: initialRun.output, ms: 0 });
    }
  }, [initialRun]);

  const canRun = fields.every((f) => !f.required || (values[f.name] && values[f.name].trim() !== ''));

  const allEmpty = fields.length > 0 && fields.every((f) => !values[f.name] || values[f.name].trim() === '');
  const hasExample = !!examplePrefillInputs && Object.keys(examplePrefillInputs).length > 0;
  const showExampleHint = hasExample && allEmpty && state.kind === 'idle';

  function applyExample() {
    if (!examplePrefillInputs) return;
    setValues((v) => {
      const next = { ...v };
      for (const f of fields) {
        const ex = examplePrefillInputs[f.name];
        if (ex !== undefined && ex !== null) next[f.name] = String(ex);
      }
      return next;
    });
  }

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
        className="run-surface-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          minHeight: 320,
        }}
      >
        {/* Inputs */}
        <div style={{ padding: 24, borderRight: '1px solid var(--line)' }}>
          {/* v11: lighter Inputs header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              marginBottom: 14,
            }}
          >
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.01em' }}>
              Inputs
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--muted)',
              opacity: 0.65,
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: 20,
              padding: '1px 7px',
            }}>
              {fields.length}
            </span>
          </div>
          {/* v11: example prefill hint chip — appears above first field when idle+empty */}
          {showExampleHint && examplePrefillInputs && (
            <button
              type="button"
              onClick={applyExample}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 12,
                padding: '6px 12px',
                background: 'rgba(4,120,87,0.06)',
                border: '1px dashed rgba(4,120,87,0.3)',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--accent)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 13, opacity: 0.7 }}>⚡</span>
              Try with example
              <span style={{ opacity: 0.6, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {' '}— {String(Object.values(examplePrefillInputs)[0] ?? '').slice(0, 40)}{String(Object.values(examplePrefillInputs)[0] ?? '').length > 40 ? '…' : ''}
              </span>
            </button>
          )}
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

          <div style={{ marginTop: 18, display: 'flex', gap: 8, alignItems: 'center' }}>
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
            {/* v11: "Try with example" is now a chip ABOVE the first field — removed here */}
          </div>
        </div>

        {/* Output — aria-live so screen readers announce when results arrive */}
        <div className="run-surface-output" aria-live="polite" aria-atomic="false" style={{ padding: 24, background: 'var(--bg)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
              gap: 12,
            }}
          >
            {/* v11: lighter Output label — matches Inputs */}
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.01em' }}>
              Output
            </span>
            {state.kind === 'ok' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <OutputActions output={state.output} slug={app.slug} />
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 10.5,
                    color: 'var(--muted)',
                  }}
                >
                  {state.ms} ms
                </span>
              </div>
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
            <div
              style={{
                borderRadius: 8,
                border: '1px solid #fecaca',
                background: '#fef2f2',
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <p
                  style={{
                    fontSize: 13,
                    color: '#b91c1c',
                    margin: 0,
                    flex: 1,
                    minWidth: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {state.message}
                </p>
                <button
                  type="button"
                  onClick={() => void run()}
                  style={{
                    flexShrink: 0,
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#b91c1c',
                    background: '#fff',
                    border: '1px solid #fecaca',
                    borderRadius: 6,
                    padding: '4px 12px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Try again
                </button>
              </div>
              <p style={{ fontSize: 11.5, color: '#9b1c1c', marginTop: 8, marginBottom: 0, opacity: 0.8 }}>
                {/timeout|timed out|too long|slow/i.test(state.message)
                  ? 'Sandbox can be slow on first run — give it a moment.'
                  : /^(4\d\d|bad request|invalid|missing|required)/i.test(state.message) || state.message.includes('400')
                  ? 'Check your inputs and try again.'
                  : 'Floom is having a moment — try again or DM us in Discord.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Output actions: copy + download .json + download .csv (when applicable) ──

function OutputActions({ output, slug }: { output: unknown; slug: string }) {
  const [copied, setCopied] = useState(false);
  const json = useMemo(
    () => (typeof output === 'string' ? output : JSON.stringify(output, null, 2)),
    [output],
  );
  // CSV is offered only when output is array-of-objects with string-y keys.
  // Anything more complex is downgraded to JSON-only.
  const csv = useMemo(() => toCsv(output), [output]);

  async function copyJson() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(json);
      } else {
        const ta = document.createElement('textarea');
        ta.value = json;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function download(filename: string, mime: string, body: string) {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button type="button" onClick={() => void copyJson()} style={iconBtnStyle} aria-label="Copy output as JSON">
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        type="button"
        onClick={() => download(`${slug}-output.json`, 'application/json', json)}
        style={iconBtnStyle}
        aria-label="Download output as JSON"
      >
        .json
      </button>
      {csv && (
        <button
          type="button"
          onClick={() => download(`${slug}-output.csv`, 'text/csv', csv)}
          style={iconBtnStyle}
          aria-label="Download output as CSV"
        >
          .csv
        </button>
      )}
    </>
  );
}

const iconBtnStyle = {
  padding: '4px 9px',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  letterSpacing: '0.04em',
  background: 'var(--card)',
  color: 'var(--ink)',
  border: '1px solid var(--line)',
  borderRadius: 5,
  cursor: 'pointer',
} as const;

// CSV-only when output is Array<{<string,string>:scalar}> with consistent
// keys across rows. Falls back to null otherwise → button hides.
function toCsv(output: unknown): string | null {
  if (!Array.isArray(output) || output.length === 0) return null;
  const rows = output.filter(
    (r) => r && typeof r === 'object' && !Array.isArray(r),
  ) as Array<Record<string, unknown>>;
  if (rows.length !== output.length) return null;
  const keys = Object.keys(rows[0] ?? {});
  if (keys.length === 0) return null;
  const allConsistent = rows.every(
    (r) => Object.keys(r).length === keys.length && keys.every((k) => k in r),
  );
  if (!allConsistent) return null;
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = keys.map(escape).join(',');
  const body = rows.map((r) => keys.map((k) => escape(r[k])).join(',')).join('\n');
  return `${head}\n${body}\n`;
}

const inputStyle = {
  // width: 100% + box-sizing: border-box stop the default textarea size
  // (cols=20 ~= 200px) from blowing past the parent on narrow viewports.
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '9px 12px',
  border: '1px solid var(--line)',
  borderRadius: 8,
  fontSize: 13.5,
  background: 'var(--card)',
  color: 'var(--ink)',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s, box-shadow 0.15s',
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
