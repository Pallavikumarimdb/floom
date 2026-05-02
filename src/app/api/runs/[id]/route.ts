import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerHasScope, getBearerToken, resolveAuthCaller } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/demo-app";

type ExecutionRow = {
  id: string;
  app_id: string;
  caller_user_id: string | null;
  input: Record<string, unknown>;
  output: unknown;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

type AppRow = {
  id: string;
  slug: string;
  public: boolean;
  owner_id: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured. Run lookup is unavailable." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const bearerToken = getBearerToken(req);
  const caller = await resolveAuthCaller(req, admin);
  if (bearerToken && !caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: execution, error: executionError } = await admin
    .from("executions")
    .select("id, app_id, caller_user_id, input, output, status, error, created_at, completed_at")
    .eq("id", id)
    .maybeSingle<ExecutionRow>();

  if (executionError) {
    return NextResponse.json({ error: "Failed to load run" }, { status: 500 });
  }

  if (!execution) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const { data: app, error: appError } = await admin
    .from("apps")
    .select("id, slug, public, owner_id")
    .eq("id", execution.app_id)
    .maybeSingle<AppRow>();

  if (appError) {
    return NextResponse.json({ error: "Failed to load app" }, { status: 500 });
  }

  if (!app) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const canReadPrivateRun =
    callerHasScope(caller, "read") &&
    (caller?.userId === app.owner_id || caller?.userId === execution.caller_user_id);

  if (!app.public && !canReadPrivateRun) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: execution.id,
    app_slug: app.slug,
    status: execution.status,
    inputs: execution.input,
    output: execution.output,
    error: execution.error,
    created_at: execution.created_at,
    completed_at: execution.completed_at,
  });
}
