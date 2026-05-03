import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/demo-app";
import { callerHasScope, getBearerToken, resolveAuthCaller } from "@/lib/supabase/auth";
import { normalizeExecutionStatus } from "@/lib/floom/executions";

type AppRow = {
  id: string;
  slug: string;
  public: boolean;
  owner_id: string;
};

type RunRow = {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const bearerToken = getBearerToken(req);
  const caller = await resolveAuthCaller(req, admin);
  if (bearerToken && !caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: app, error: appError } = await admin
    .from("apps")
    .select("id, slug, public, owner_id")
    .eq("slug", slug)
    .maybeSingle<AppRow>();

  if (appError) {
    return NextResponse.json({ error: "Failed to load app" }, { status: 500 });
  }

  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const canReadPrivate =
    caller?.userId === app.owner_id && (callerHasScope(caller, "read") || callerHasScope(caller, "run"));
  if (!app.public && !canReadPrivate) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const { data, error } = await admin
    .from("executions")
    .select("id, status, created_at, started_at, completed_at, error")
    .eq("app_id", app.id)
    .order("created_at", { ascending: false })
    .limit(25)
    .returns<RunRow[]>();

  if (error) {
    return NextResponse.json({ error: "Failed to load runs" }, { status: 500 });
  }

  return NextResponse.json({
    runs: (data ?? []).map((run) => ({
      ...run,
      status: normalizeExecutionStatus(run.status),
    })),
  });
}
