'use client';
// v6 (2026-05-01): functional RunSurface for floom-minimal v0.
// Replaces the placeholder stub. Renders the app's input fields from
// input_schema, sends a POST to /api/apps/<slug>/run, displays output.
// terminal, no output toolbar, no run history) — but it actually runs
// the app, which the stub did not.

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import type { AppDetail, RunRecord } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { extractRows, unionKeys } from '@/lib/floom/output-rows';

export interface RunSurfaceResult {
  runId?: string;
  status?: string;
  output?: unknown;
}

interface RunSurfaceProps {
  // manifest comes through AppDetail; secrets_needed lives at
  // app.manifest.secrets_needed (string[]).
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
  multiline?: boolean;
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
  | {
      kind: 'active';
      executionId: string;
      status: ExecutionStatus;
      progress?: unknown | null;
      startedAt?: string | null;
      completedAt?: string | null;
      cancelRequested?: boolean;
      submittedAt: number;
    }
  | { kind: 'ok'; output: unknown; ms: number }
  | { kind: 'error'; message: string; phase?: string; detail?: string };

type ApiRunError = {
  phase?: string;
  stderr_tail?: string;
  exit_code?: number;
  elapsed_ms?: number;
  detail?: string;
};

type ExecutionStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled';

type ExecutionSnapshot = {
  execution_id: string;
  status: ExecutionStatus | 'success' | 'error' | 'timeout';
  output?: unknown | null;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  progress?: unknown | null;
};

function fieldsFromSchema(schema: InputSchema | undefined) {
  if (!schema?.properties) return [];
  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    title: prop.title ?? name,
    description: prop.description ?? '',
    type: prop.type ?? 'string',
    format: prop.format ?? '',
    multiline: prop.multiline ?? false,
    required: schema.required?.includes(name) ?? false,
    enum: prop.enum,
    defaultValue: prop.default,
  }));
}

function isMultilineField(f: ReturnType<typeof fieldsFromSchema>[number]): boolean {
  if (f.format === 'textarea') return true;
  if (f.multiline) return true;
  if (f.title.toLowerCase().includes('pitch')) return true;
  if (f.description.length > 40) return true;
  // Detect multiline intent from default value or field name
  if (typeof f.defaultValue === 'string' && f.defaultValue.includes('\n')) return true;
  const lname = f.name.toLowerCase();
  const ltitle = f.title.toLowerCase();
  if (lname.includes('transcript') || lname.includes('notes') || lname.includes('text') ||
      ltitle.includes('transcript') || ltitle.includes('notes') || ltitle.includes('paste')) return true;
  return false;
}

type RunField = ReturnType<typeof fieldsFromSchema>[number];

export function RunSurface({ app, initialRun, initialInputs, examplePrefillInputs, onResult }: RunSurfaceProps) {
  const schema = (app.input_schema ?? null) as InputSchema | null;
  const fields = useMemo(() => fieldsFromSchema(schema ?? undefined), [schema]);
  const requiredFields = useMemo(() => fields.filter((f) => f.required), [fields]);
  const optionalFields = useMemo(() => fields.filter((f) => !f.required), [fields]);
  const [showOptional, setShowOptional] = useState(false);

  // #76: secret-typed inputs render as masked password fields. A field is
  // treated as a secret when its name appears in manifest.secrets_needed OR
  // when its JSON Schema declares format: "password". Names match
  // case-insensitively to tolerate both `GEMINI_API_KEY` (manifest convention)
  // and `gemini_api_key` (input_schema convention).
  //
  // Pragmatic name heuristic for the common case where the API doesn't
  // surface manifest.secrets_needed and the schema doesn't set
  // format:password (e.g. gemini-chat-fede with `api_key`). Without this,
  // the most common credential field on Floom — an API key — renders in the
  // clear. The pattern is intentionally narrow to avoid false positives on
  // benign fields.
  const SECRET_NAME_PATTERN = /(?:^|_)(?:api[_-]?key|secret|token|password|access[_-]?key|private[_-]?key)(?:$|_)/i;
  const secretNames = useMemo(() => {
    const declared = (app.manifest?.secrets_needed ?? []) as ReadonlyArray<string>;
    return new Set(declared.map((s) => s.toLowerCase()));
  }, [app.manifest?.secrets_needed]);
  const isSecretField = useCallback(
    (f: RunField) =>
      f.format === 'password' ||
      secretNames.has(f.name.toLowerCase()) ||
      SECRET_NAME_PATTERN.test(f.name),
    [secretNames],
  );
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const toggleReveal = useCallback((name: string) => {
    setRevealedSecrets((v) => ({ ...v, [name]: !v[name] }));
  }, []);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const f of fields) {
      const fromInitial = initialInputs?.[f.name];
      if (fromInitial !== undefined && fromInitial !== null) {
        seed[f.name] = typeof fromInitial === 'object'
          ? JSON.stringify(fromInitial, null, 2)
          : String(fromInitial);
      } else if (f.defaultValue !== undefined) {
        seed[f.name] = typeof f.defaultValue === 'object'
          ? JSON.stringify(f.defaultValue, null, 2)
          : String(f.defaultValue);
      } else {
        seed[f.name] = f.type === 'array' ? '[]' : '';
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
    } else if (initialRun?.id && ['queued', 'running'].includes(normalizeClientStatus(initialRun.status))) {
      setState({
        kind: 'active',
        executionId: initialRun.id,
        status: normalizeClientStatus(initialRun.status),
        progress: initialRun.progress,
        startedAt: initialRun.started_at,
        completedAt: initialRun.completed_at,
        submittedAt: performance.now(),
      });
    } else if (initialRun?.error) {
      setState({ kind: 'error', message: initialRun.error });
    }
  }, [initialRun]);

  // #79: queued→running transition was repainting the output panel because
  // the synchronous setState forced React to flush in the middle of the
  // user looking at it. Wrap non-terminal status updates in startTransition
  // so React schedules them as low-priority and keeps the previous frame
  // visible until the new one is ready. Terminal updates (succeeded /
  // failed) stay urgent — those are the ones the user is waiting for.
  const [, startTransition] = useTransition();
  const applyExecutionSnapshot = useCallback((data: ExecutionSnapshot, ms: number) => {
    const status = normalizeClientStatus(data.status);
    if (status === 'succeeded') {
      setState({ kind: 'ok', output: data.output, ms });
      onResult?.({ runId: data.execution_id, status, output: data.output });
      return;
    }
    if (status === 'failed' || status === 'timed_out' || status === 'cancelled') {
      setState({ kind: 'error', message: data.error ?? terminalMessage(status) });
      onResult?.({ runId: data.execution_id, status, output: data.output });
      return;
    }
    startTransition(() => {
      setState((prev) => ({
        kind: 'active',
        executionId: data.execution_id,
        status,
        progress: data.progress,
        startedAt: data.started_at,
        completedAt: data.completed_at,
        // Preserve the original submittedAt so elapsed-time math stays
        // monotonic across polls. Falls back to now() if we're starting fresh.
        submittedAt:
          prev.kind === 'active' && prev.executionId === data.execution_id
            ? prev.submittedAt
            : performance.now() - ms,
      }));
    });
    onResult?.({ runId: data.execution_id, status, output: data.output });
  }, [onResult]);

  useEffect(() => {
    if (state.kind !== 'active') return;
    if (!state.executionId) return;
    if (isTerminalStatus(state.status)) return;
    let cancelled = false;
    const elapsed = performance.now() - state.submittedAt;
    const delay = elapsed < 30_000 ? 1000 : 3000;
    const timer = window.setTimeout(async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/executions/${state.executionId}`, { headers });
        const data = (await res.json().catch(() => null)) as ExecutionSnapshot | null;
        if (cancelled || !res.ok || !data) return;
        applyExecutionSnapshot(data, Math.round(performance.now() - state.submittedAt));
      } catch {
        // Keep the current status visible; the next poll will retry.
      }
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [applyExecutionSnapshot, state]);

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
    setState({ kind: 'active', executionId: '', status: 'queued', submittedAt: performance.now() });
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
        } else if (f.type === 'array' || f.type === 'object') {
          try {
            payload[f.name] = JSON.parse(raw);
          } catch {
            payload[f.name] = raw;
          }
        } else {
          payload[f.name] = raw;
        }
      }
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...(await authHeaders()),
      };

      const res = await fetch(`/api/apps/${app.slug}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ inputs: payload }),
      });
      const data = (await res.json().catch(() => null)) as
        | ExecutionSnapshot
        | null;
      const ms = Math.round(performance.now() - t0);
      const structuredError =
        data && typeof data.error === 'object' && data.error !== null ? data.error as ApiRunError : null;
      if (!res.ok || !data) {
        setState({
          kind: 'error',
          message:
            structuredError?.detail ||
            (typeof data?.error === 'string' ? data.error : null) ||
            `Run failed (HTTP ${res.status})`,
          phase: structuredError?.phase,
          detail:
            structuredError?.stderr_tail ||
            (structuredError?.exit_code !== undefined
              ? `exit code ${structuredError.exit_code}`
              : undefined),
        });
        return;
      }
      applyExecutionSnapshot(data, ms);
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Network error',
        detail: undefined,
      });
    }
  }

  async function cancelRun() {
    if (state.kind !== 'active' || !state.executionId || isTerminalStatus(state.status)) return;
    setState({ ...state, cancelRequested: true });
    try {
      const headers = await authHeaders();
      await fetch(`/api/executions/${state.executionId}`, { method: 'DELETE', headers });
    } catch {
      setState({ ...state, cancelRequested: false });
    }
  }

  function reset() {
    const seed: Record<string, string> = {};
    for (const f of fields) seed[f.name] = '';
    setValues(seed);
    setState({ kind: 'idle' });
  }

  function renderField(f: RunField) {
    return (
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
        ) : f.type === 'array' || f.type === 'object' ? (
          <>
            <textarea
              value={values[f.name] ?? (f.type === 'array' ? '[]' : '{}')}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.name]: e.target.value }))
              }
              rows={5}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }}
              placeholder={f.type === 'array' ? '[\n  ...\n]' : '{\n  ...\n}'}
            />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>JSON {f.type}</span>
          </>
        ) : f.type === 'string' && isMultilineField(f) ? (
          <textarea
            value={values[f.name] ?? ''}
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.name]: e.target.value }))
            }
            rows={5}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        ) : isSecretField(f) ? (
          // #76: secrets render masked. Eye toggle reveals; on-screen hint
          // explains the storage model so users know what they're entrusting.
          <>
            <div style={{ position: 'relative' }}>
              <input
                type={revealedSecrets[f.name] ? 'text' : 'password'}
                value={values[f.name] ?? ''}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.name]: e.target.value }))
                }
                style={{ ...inputStyle, paddingRight: 64, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12.5 }}
              />
              <button
                type="button"
                onClick={() => toggleReveal(f.name)}
                aria-label={revealedSecrets[f.name] ? `Hide ${f.title}` : `Show ${f.title}`}
                aria-pressed={!!revealedSecrets[f.name]}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--muted)',
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  letterSpacing: '0.02em',
                }}
              >
                {revealedSecrets[f.name] ? 'Hide' : 'Show'}
              </button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Encrypted at rest, injected as env var at run time.
            </span>
          </>
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
    );
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
                {' '}: {String(Object.values(examplePrefillInputs)[0] ?? '').slice(0, 40)}{String(Object.values(examplePrefillInputs)[0] ?? '').length > 40 ? '…' : ''}
              </span>
            </button>
          )}
          {fields.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              This app takes no inputs.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Required fields shown by default. Optional fields collapsed
                  behind a 'Show optional fields' toggle so the form reads
                  short on first glance — Design note: a multi-input
                  meeting-action-items form had a 'default owner' field
                  cluttering the surface. */}
              {requiredFields.map((f) => renderField(f))}
              {optionalFields.length > 0 && (
                <>
                  {showOptional &&
                    optionalFields.map((f) => renderField(f))}
                  <button
                    type="button"
                    onClick={() => setShowOptional((v) => !v)}
                    style={{
                      alignSelf: 'flex-start',
                      marginTop: showOptional ? 0 : 4,
                      padding: '4px 0',
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: 'var(--muted)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {showOptional
                      ? '− Hide optional fields'
                      : `+ Show ${optionalFields.length} optional ${
                          optionalFields.length === 1 ? 'field' : 'fields'
                        }`}
                  </button>
                </>
              )}
            </div>
          )}

          <div style={{ marginTop: 18, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => void run()}
              disabled={state.kind === 'active' || !canRun}
              style={{
                padding: '9px 18px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: state.kind === 'active' || !canRun ? 'not-allowed' : 'pointer',
                opacity: state.kind === 'active' || !canRun ? 0.55 : 1,
                fontFamily: 'inherit',
              }}
            >
              {state.kind === 'active' ? 'Running...' : 'Run'}
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
            {state.kind === 'active' && state.executionId && !isTerminalStatus(state.status) && (
              <button
                type="button"
                onClick={() => void cancelRun()}
                disabled={state.cancelRequested}
                style={{
                  padding: '9px 14px',
                  background: '#fff',
                  color: '#6b7280',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: state.cancelRequested ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {state.cancelRequested ? 'Cancelling...' : 'Cancel run'}
              </button>
            )}
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
          {state.kind === 'active' && (
            // #79: stable key on the active panel keeps React reconciling
            // the SAME elements when status flips queued→running, instead
            // of tearing down + recreating the subtree (which caused the
            // black-flash repaint).
            <div
              key="active-panel"
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <StatusPill status={state.status} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {state.executionId ? `Execution ${state.executionId.slice(0, 8)}` : 'Submitting'}
                </span>
              </div>
              <ProgressView progress={state.progress} />
            </div>
          )}
          {state.kind === 'ok' && (
            <OutputDisplay output={state.output} />
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
              {state.phase && (
                <p style={{ fontSize: 11.5, color: '#7f1d1d', marginTop: 8, marginBottom: 0, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                  phase: {state.phase}
                </p>
              )}
              {state.detail && (
                <pre
                  style={{
                    marginTop: 8,
                    marginBottom: 0,
                    maxHeight: 220,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 11.5,
                    lineHeight: 1.5,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    color: '#7f1d1d',
                    background: '#fff7f7',
                    border: '1px solid #fecaca',
                    borderRadius: 6,
                    padding: 10,
                  }}
                >
                  {state.detail}
                </pre>
              )}
              <p style={{ fontSize: 11.5, color: '#9b1c1c', marginTop: 8, marginBottom: 0, opacity: 0.8 }}>
                {/timeout|timed out|too long|slow/i.test(state.message)
                  ? 'Sandbox can be slow on first run, give it a moment.'
                  : /^(4\d\d|bad request|invalid|missing|required)/i.test(state.message) || state.message.includes('400')
                  ? 'Check your inputs and try again.'
                  : 'Floom is having a moment; try again or DM us in Discord.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

async function authHeaders() {
  const headers: Record<string, string> = {};
  try {
    const { data } = await createClient().auth.getSession();
    if (data.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
  } catch {
    // Public app runs still work without a browser session.
  }
  return headers;
}

function normalizeClientStatus(status: string): ExecutionStatus {
  if (status === 'success') return 'succeeded';
  if (status === 'error') return 'failed';
  if (status === 'timeout') return 'timed_out';
  if (['queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled'].includes(status)) {
    return status as ExecutionStatus;
  }
  return 'failed';
}

function isTerminalStatus(status: string) {
  return ['succeeded', 'failed', 'timed_out', 'cancelled', 'success', 'error', 'timeout'].includes(status);
}

function terminalMessage(status: ExecutionStatus) {
  if (status === 'timed_out') return 'This run took too long. Try a shorter input.';
  if (status === 'cancelled') return 'Execution was cancelled';
  return 'App execution failed';
}

function StatusPill({ status }: { status: ExecutionStatus }) {
  const color = statusColor(status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '3px 9px',
        fontSize: 11,
        fontWeight: 700,
        color: color.text,
        background: color.bg,
        border: `1px solid ${color.border}`,
        textTransform: 'capitalize',
      }}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function statusColor(status: ExecutionStatus) {
  if (status === 'succeeded') return { text: '#047857', bg: '#ecfdf5', border: '#a7f3d0' };
  if (status === 'running') return { text: '#b45309', bg: '#fffbeb', border: '#fde68a' };
  if (status === 'failed' || status === 'timed_out') return { text: '#b91c1c', bg: '#fef2f2', border: '#fecaca' };
  if (status === 'cancelled') return { text: '#4b5563', bg: '#f9fafb', border: '#d1d5db' };
  return { text: '#475569', bg: '#f8fafc', border: '#cbd5e1' };
}

function ProgressView({ progress }: { progress: unknown }) {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) {
    return <p style={{ fontSize: 13, color: '#b45309', margin: 0 }}>Working on it…</p>;
  }
  const p = progress as {
    kind?: string;
    percent?: number;
    label?: string;
    stages?: Array<{ key?: string; label?: string; status?: string }>;
  };
  if (p.kind === 'percent') {
    const percent = typeof p.percent === 'number' ? Math.max(0, Math.min(100, p.percent)) : 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, color: 'var(--ink)' }}>{p.label ?? 'Running'}</span>
        <div style={{ height: 8, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{percent}%</span>
      </div>
    );
  }
  if (p.kind === 'stages' && Array.isArray(p.stages)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, color: 'var(--ink)' }}>{p.label ?? 'Running'}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {p.stages.map((stage, index) => (
            <span
              key={stage.key ?? index}
              style={{
                fontSize: 11,
                borderRadius: 999,
                padding: '2px 7px',
                background: stage.status === 'running' ? '#fffbeb' : '#f8fafc',
                color: stage.status === 'done' ? '#047857' : 'var(--muted)',
                border: '1px solid var(--line)',
              }}
            >
              {stage.label ?? stage.key ?? `Stage ${index + 1}`}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return <p style={{ fontSize: 13, color: '#b45309', margin: 0 }}>Running...</p>;
}

// ── Output display: table for known shapes, pre for everything else ──
// extractRows, unionKeys, TableRow imported from @/lib/floom/output-rows

function OutputDisplay({ output }: { output: unknown }) {
  const rows = useMemo(() => extractRows(output), [output]);

  if (rows && rows.length > 0) {
    // Union of all keys across every row so heterogeneous shapes don't drop columns.
    const keys = unionKeys(rows);
    if (keys.length > 0) {
      return (
        <div style={{ overflowX: 'auto', maxHeight: 400, overflow: 'auto', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                {keys.map((k) => (
                  <th
                    key={k}
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      fontWeight: 700,
                      color: 'var(--ink)',
                      borderBottom: '1px solid var(--line)',
                      whiteSpace: 'nowrap',
                      background: 'var(--bg)',
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 11,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                  {keys.map((k) => (
                    <td
                      key={k}
                      style={{
                        padding: '8px 12px',
                        color: 'var(--ink)',
                        verticalAlign: 'top',
                        lineHeight: 1.45,
                      }}
                    >
                      {row[k] === null || row[k] === undefined
                        ? ''
                        : typeof row[k] === 'object'
                        ? JSON.stringify(row[k])
                        : String(row[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }

  return (
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
      {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
    </pre>
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
  const [runs, setRuns] = useState<Array<{
    id: string;
    status: ExecutionStatus;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadRuns() {
      setLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/apps/${appSlug}/runs`, { headers });
        const data = await res.json().catch(() => null) as { runs?: typeof runs } | null;
        if (!cancelled && res.ok) {
          setRuns(data?.runs ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadRuns();
    const interval = window.setInterval(() => void loadRuns(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [appSlug]);

  if (loading && runs.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>Loading runs...</div>;
  }

  if (runs.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>No runs yet.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
      {runs.map((run) => (
        <a
          key={run.id}
          href={`/p/${appSlug}?tab=run&run=${run.id}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 12px',
            border: '1px solid var(--line)',
            borderRadius: 8,
            color: 'inherit',
            textDecoration: 'none',
            background: 'var(--card)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <StatusPill status={run.status} />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--muted)' }}>
              {run.id.slice(0, 8)}
            </span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            {new Date(run.created_at).toLocaleString()}
          </span>
        </a>
      ))}
    </div>
  );
}
