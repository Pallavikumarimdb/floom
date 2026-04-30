import { NextResponse } from "next/server";
import { runAppBundle } from "../../../../../lib/runner/index.mjs";
import { getAppBySlug, createExecution } from "../../../../../lib/supabase/app-registry";
import { buildRunResponse, resolveRunBundleDir } from "../../../../../lib/run-route.mjs";
import type { RunAppInput } from "@/lib/types";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type RunnerMode = "fake" | "local" | "e2b";

function hasSupabaseEnv() {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function readRunnerMode(value: string | undefined): RunnerMode {
  if (value === "fake" || value === "local" || value === "e2b") {
    return value;
  }

  return "local";
}

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const input = (await request.json().catch(() => ({}))) as RunAppInput;
  const bundleDir = resolveRunBundleDir(slug);

  if (!bundleDir) {
    return NextResponse.json(
      { error: `No runnable bundle mapped for slug "${slug}"` },
      { status: 404 },
    );
  }

  let executionId: string | null = null;
  if (hasSupabaseEnv()) {
    const app = await getAppBySlug(slug);
    if (app) {
      const execution = await createExecution({
        appId: app.id,
        versionId: app.current_version_id,
        status: "running",
        inputs: input,
      });
      executionId = execution.id;
    }
  }

  const result = await runAppBundle({
    bundleDir,
    input,
    mode: readRunnerMode(process.env.FLOOM_RUNNER_MODE),
  }).catch((error: unknown) => ({
    ok: false as const,
    mode: readRunnerMode(process.env.FLOOM_RUNNER_MODE),
    error: error instanceof Error ? error.message : String(error),
    logs: "",
    durationMs: 0,
  }));

  return NextResponse.json(
    buildRunResponse({
      executionId,
      result,
    }),
    { status: result.ok ? 200 : result.error.includes("schema validation") ? 400 : 500 },
  );
}
