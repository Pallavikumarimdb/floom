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

export function runAppBundle(input: {
  bundleDir: string;
  input: Record<string, unknown>;
  mode?: "fake" | "local" | "e2b";
  runnerOptions?: Record<string, unknown>;
}): Promise<RunAppBundleResult>;
