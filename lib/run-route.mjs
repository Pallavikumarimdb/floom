import path from "node:path";

export function resolveRunBundleDir(slug, rootDir = process.cwd()) {
  const bundleDirs = {
    demo: path.resolve(rootDir, "fixtures/python-echo"),
  };

  return bundleDirs[slug] ?? null;
}

export function buildRunResponse({ executionId = null, result }) {
  if (result.ok) {
    return {
      execution_id: executionId,
      status: "succeeded",
      output: result.output,
    };
  }

  return {
    execution_id: executionId,
    status: "failed",
    output: {
      error: result.error,
      logs: result.logs,
      mode: result.mode,
    },
  };
}
