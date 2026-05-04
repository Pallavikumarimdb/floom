/**
 * GET /api/runs/[id]/logs?since=<offset>
 *
 * Returns execution events for a run since a given offset (event count).
 * Used by `floom logs <execution_id>` to stream stdout/stderr.
 *
 * Query params:
 *   since (optional, default 0): return events at or after this index
 *
 * Response:
 *   { events: ExecutionEvent[], next_offset: number, status: ExecutionStatus }
 *
 * Auth: same as GET /api/runs/[id] — runner OR app owner can read logs.
 * Public apps: any caller can read logs for executions tied to that app.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/demo-app";
import { authorizeExecutionRead, isTerminalExecutionStatus, normalizeExecutionStatus } from "@/lib/floom/executions";

// UUID v4 pattern
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ExecutionEvent = {
  id: string;
  execution_id: string;
  kind: "status" | "progress" | "stdout" | "stderr" | "heartbeat" | "system";
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type LogsResponse = {
  events: ExecutionEvent[];
  next_offset: number;
  status: string;
  terminal: boolean;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured. Log streaming is unavailable." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const auth = await authorizeExecutionRead(req, admin, id);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const { execution, isRunner, isOwner } = auth;

  // Stranger check: neither runner nor owner → 404 on logs too.
  if (!isRunner && !isOwner) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam !== null ? Math.max(0, parseInt(sinceParam, 10)) : 0;

  if (isNaN(since)) {
    return NextResponse.json({ error: "since must be a non-negative integer" }, { status: 400 });
  }

  // Fetch events from offset. We use row number ordering via created_at + id
  // (insertion order) to ensure stable pagination.
  // The execution_events table stores events in insertion order; since is the
  // count of events already seen by the caller.
  const { data: events, error: eventsError } = await admin
    .from("execution_events")
    .select("id, execution_id, kind, payload, created_at")
    .eq("execution_id", id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(since, since + 99) // at most 100 events per call
    .returns<ExecutionEvent[]>();

  if (eventsError) {
    return NextResponse.json({ error: "Failed to load logs" }, { status: 500 });
  }

  const rawEvents = events ?? [];
  // Runners see all events (stdout/stderr included).
  // Owners see only status/progress/system events — never stdout/stderr (runner output).
  const eventsData = isRunner
    ? rawEvents
    : rawEvents.filter((e) => !["stdout", "stderr"].includes(e.kind));
  const status = normalizeExecutionStatus(execution.status);
  const terminal = isTerminalExecutionStatus(status);

  const response: LogsResponse = {
    events: eventsData,
    next_offset: since + rawEvents.length,
    status,
    terminal,
  };

  return NextResponse.json(response);
}
