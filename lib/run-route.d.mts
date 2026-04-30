export type RunAppBundleResult =
  | {
      ok: true;
      mode: string;
      output: unknown;
      logs: string;
      durationMs: number;
    }
  | {
      ok: false;
      mode: string;
      error: string;
      logs: string;
      durationMs: number;
    };

export function resolveRunBundleDir(slug: string, rootDir?: string): string | null;

export function buildRunResponse(input: {
  executionId?: string | null;
  result: RunAppBundleResult;
}): {
  execution_id: string | null;
  status: "succeeded" | "failed";
  output: unknown;
};
