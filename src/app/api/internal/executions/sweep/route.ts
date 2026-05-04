import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/demo-app";
import { isAsyncRuntimeEnabled } from "@/lib/floom/executions";
import { verifyQstashRequest } from "@/lib/floom/queue";
import { sweepExecutions } from "@/lib/floom/execution-worker";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!isAsyncRuntimeEnabled()) {
    return NextResponse.json({ error: "Async runtime is disabled" }, { status: 404 });
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const verified = await verifyQstashRequest(req, rawBody);
  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (verified === "duplicate") {
    // Already processed this delivery — ack to QStash so it stops retrying.
    return NextResponse.json({ ok: true, skipped: "duplicate_delivery" }, { status: 200 });
  }

  const body = JSON.parse(rawBody) as { kind?: unknown };
  if (body.kind !== "sweep") {
    return NextResponse.json({ error: "Invalid sweep message" }, { status: 400 });
  }

  const result = await sweepExecutions(createAdminClient(), req.nextUrl.origin);
  return NextResponse.json({ ok: true, ...result });
}
