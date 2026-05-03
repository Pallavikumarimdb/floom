import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/demo-app";
import { isAsyncRuntimeEnabled } from "@/lib/floom/executions";
import { verifyQstashRequest } from "@/lib/floom/queue";
import { processExecutionOnce } from "@/lib/floom/execution-worker";

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

  const body = JSON.parse(rawBody) as { execution_id?: unknown; phase?: unknown };
  if (typeof body.execution_id !== "string" || body.phase !== "process") {
    return NextResponse.json({ error: "Invalid process message" }, { status: 400 });
  }

  const result = await processExecutionOnce(createAdminClient(), body.execution_id, req.nextUrl.origin);
  return NextResponse.json(result.body, { status: result.status });
}
