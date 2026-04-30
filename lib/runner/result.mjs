export function okRunResult({ output, logs = "", durationMs, mode }) {
  return {
    ok: true,
    mode,
    output,
    logs,
    durationMs,
  };
}

export function failedRunResult({ error, logs = "", durationMs, mode }) {
  return {
    ok: false,
    mode,
    error,
    logs,
    durationMs,
  };
}
