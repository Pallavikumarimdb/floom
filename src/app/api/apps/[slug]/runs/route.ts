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

const PRIVATE_CACHE = { "Cache-Control": "private, no-store" } as const;

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

  const isOwner =
    caller?.userId === app.owner_id && (callerHasScope(caller, "read") || callerHasScope(caller, "run"));
  if (!app.public && !isOwner) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  // Executions are always private: only the app owner can list runs.
  // Authenticated non-owners receive an empty list rather than a 403 to avoid
  // leaking whether the app has any runs.
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwner) {
    return NextResponse.json({ runs: [] }, { headers: PRIVATE_CACHE });
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
