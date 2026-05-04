import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/demo-app";
import {
  appendExecutionEvent,
  authorizeExecutionCancel,
  authorizeExecutionRead,
  formatExecutionSnapshot,
  isAsyncRuntimeEnabled,
  isTerminalExecutionStatus,
  normalizeExecutionStatus,
  type ExecutionRow,
} from "@/lib/floom/executions";
import { publishExecutionProcessMessage } from "@/lib/floom/queue";

export const maxDuration = 300;

type EventRow = {
  id: number;
  execution_id: string;
  kind: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isAsyncRuntimeEnabled()) {
    return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const auth = await authorizeExecutionRead(req, admin, id);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  if (req.headers.get("accept")?.includes("text/event-stream")) {
    return streamExecution(req, auth.execution, auth.isRunner);
  }

  const snapshot = formatExecutionSnapshot(auth.execution);

  // Strangers: 404 (already gated by authorizeExecutionRead returning ok:false
  // for private apps; for public apps canAccess=false means stranger).
  if (!auth.isRunner && !auth.isOwner) {
    return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  }

  if (auth.isRunner) {
    return NextResponse.json(snapshot);
  }

  // isOwner only: analytics shape — never inputs/output/error_detail/progress.
  return NextResponse.json({
    execution_id: snapshot.execution_id,
    status: snapshot.status,
    started_at: snapshot.started_at,
    completed_at: snapshot.completed_at,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isAsyncRuntimeEnabled()) {
    return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const auth = await authorizeExecutionCancel(req, admin, id);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const status = normalizeExecutionStatus(auth.execution.status);
  if (isTerminalExecutionStatus(status)) {
    return NextResponse.json(formatExecutionSnapshot(auth.execution));
  }

  const now = new Date().toISOString();
  if (status === "queued") {
    const { data, error: cancelError } = await admin
      .from("executions")
      .update({
        status: "cancelled",
        error: "Execution was cancelled",
        completed_at: now,
        cancel_requested_at: now,
        cancel_reason: "caller",
        lease_token: null,
        lease_expires_at: null,
        lease_until: null,
      })
      .eq("id", id)
      .eq("status", "queued")
      .select("*")
      .maybeSingle<ExecutionRow>();
    if (cancelError) {
      return NextResponse.json({ error: "Failed to cancel execution" }, { status: 500 });
    }
    if (!data) {
      const { data: current } = await admin
        .from("executions")
        .select("*")
        .eq("id", id)
        .maybeSingle<ExecutionRow>();
      return NextResponse.json(formatExecutionSnapshot(current ?? auth.execution));
    }
    await appendExecutionEvent(admin, id, "status", { status: "cancelled", completed_at: now });
    return NextResponse.json({
      execution_id: id,
      status: "cancelled",
      completed_at: data?.completed_at ?? now,
    });
  }

  await admin
    .from("executions")
    .update({
      cancel_requested_at: now,
      cancel_reason: "caller",
    })
    .eq("id", id)
    .eq("status", "running");
  await appendExecutionEvent(admin, id, "system", { code: "cancel_requested", at: now });
  await publishExecutionProcessMessage({
    executionId: id,
    pollCount: auth.execution.poll_count + 1,
    delaySeconds: 0,
    baseUrl: req.nextUrl.origin,
  }).catch(() => undefined);

  return NextResponse.json(
    {
      execution_id: id,
      status: "running",
      cancel_requested: true,
    },
    { status: 202 }
  );
}

function redactSnapshotForPublic(snapshot: ReturnType<typeof formatExecutionSnapshot>) {
  return { ...snapshot, output: undefined, error: undefined, progress: undefined };
}

function streamExecution(req: NextRequest, initialExecution: ExecutionRow, canViewOutput: boolean) {
  const encoder = new TextEncoder();
  const admin = createAdminClient();
  const lastEventId = Number(req.headers.get("last-event-id") ?? 0);
  let cursor = Number.isFinite(lastEventId) && lastEventId > 0 ? lastEventId : 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown, id?: number) => {
        const idLine = id ? `id: ${id}\n` : "";
        controller.enqueue(
          encoder.encode(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      const keepalive = () => controller.enqueue(encoder.encode(": keepalive\n\n"));

      const maybeRedact = (s: ReturnType<typeof formatExecutionSnapshot> | null) =>
        s && !canViewOutput ? redactSnapshotForPublic(s) : s;

      controller.enqueue(encoder.encode("retry: 1000\n"));
      send("snapshot", maybeRedact(formatExecutionSnapshot(initialExecution)));

      const deadline = Date.now() + 25_000;
      let keepaliveAt = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const { data: events } = await admin
          .from("execution_events")
          .select("id, execution_id, kind, payload, created_at")
          .eq("execution_id", initialExecution.id)
          .gt("id", cursor)
          .order("id", { ascending: true })
          .limit(100)
          .returns<EventRow[]>();

        for (const event of events ?? []) {
          cursor = event.id;
          const name = mapSseEventName(event);
          if (!name) {
            continue;
          }
          const snapshot = await loadSnapshotForSse(admin, initialExecution.id);
          send(name, maybeRedact(snapshot), event.id);
          if (snapshot && isTerminalExecutionStatus(snapshot.status)) {
            controller.close();
            return;
          }
        }

        const snapshot = await loadSnapshotForSse(admin, initialExecution.id);
        if (snapshot && isTerminalExecutionStatus(snapshot.status)) {
          send("completed", maybeRedact(snapshot));
          controller.close();
          return;
        }

        if (Date.now() >= keepaliveAt) {
          keepalive();
          keepaliveAt = Date.now() + 10_000;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function mapSseEventName(event: EventRow) {
  if (event.kind === "progress") {
    return "progress";
  }
  if (event.kind === "status") {
    const status = typeof event.payload?.status === "string" ? event.payload.status : "";
    return isTerminalExecutionStatus(status) ? "completed" : "status";
  }
  return null;
}

async function loadSnapshotForSse(admin: ReturnType<typeof createAdminClient>, executionId: string) {
  const { data } = await admin
    .from("executions")
    .select("*")
    .eq("id", executionId)
    .maybeSingle<ExecutionRow>();
  return data ? formatExecutionSnapshot(data) : null;
}
