import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerHasScope, getBearerToken, resolveAuthCaller } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/demo-app";
import { normalizeExecutionStatus } from "@/lib/floom/executions";

type MyRunRow = {
  id: string;
  app_id: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  error_detail: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  progress: unknown | null;
  apps: {
    slug: string;
  } | null;
};

// Prevents shared/CDN caches from storing user-private execution data.
const PRIVATE_CACHE = { "Cache-Control": "private, no-store" } as const;

export async function GET(req: NextRequest) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const bearerToken = getBearerToken(req);
  const caller = await resolveAuthCaller(req, admin);
  if (!caller || (bearerToken && !caller)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_CACHE });
  }

  if (!callerHasScope(caller, "read")) {
    return NextResponse.json({ error: "Read scope required" }, { status: 403, headers: PRIVATE_CACHE });
  }

  const url = new URL(req.url);
  const limitParam = Math.min(parseInt(url.searchParams.get("limit") ?? "25", 10), 100);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 25;

  const { data, error } = await admin
    .from("executions")
    .select("id, app_id, status, input, output, error, error_detail, created_at, started_at, completed_at, progress, apps(slug)")
    .eq("caller_user_id", caller.userId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<MyRunRow[]>();

  if (error) {
    return NextResponse.json({ error: "Failed to load runs" }, { status: 500 });
  }

  return NextResponse.json(
    {
      runs: (data ?? []).map((run) => ({
        id: run.id,
        app_slug: run.apps?.slug ?? run.app_id,
        status: normalizeExecutionStatus(run.status),
        inputs: run.input,
        output: run.output,
        error: run.error,
        error_detail: run.error_detail,
        created_at: run.created_at,
        started_at: run.started_at,
        completed_at: run.completed_at,
        progress: run.progress,
      })),
    },
    { headers: PRIVATE_CACHE },
  );
}
