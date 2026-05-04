import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/demo-app";
import { isDecoupledSandboxEnabled } from "@/lib/floom/executions";
import { verifyQstashRequest } from "@/lib/floom/queue";
import { pollInFlightSandboxes } from "@/lib/floom/execution-worker";

// Cron-driven poller for in-flight E2B sandboxes (Option B — decoupled runtime).
//
// Activated only when FLOOM_DECOUPLED_SANDBOX=enabled (and FLOOM_ASYNC_RUNTIME=enabled).
// When the flag is off this route returns 404, so the QStash schedule becomes a no-op
// and the existing sync process path continues to handle everything.
//
// QStash schedule: POST https://floom.dev/api/internal/executions/poll-sandboxes
//   cron: "* * * * *" (every 1 minute — QStash minimum; processes all in-flight rows per tick)
//   body: {"kind":"poll-sandboxes"}
//   retries: 0
//
// The route holds a Vercel function for up to 300s to accommodate large batches,
// but each individual sandbox poll is fast (<5s) and runs sequentially with lease
// protection so concurrent invocations don't double-finalize.

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!isDecoupledSandboxEnabled()) {
    return NextResponse.json({ error: "Decoupled sandbox poller is disabled" }, { status: 404 });
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const verified = await verifyQstashRequest(req, rawBody);
  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as { kind?: unknown };
  if (body.kind !== "poll-sandboxes") {
    return NextResponse.json({ error: "Invalid poll-sandboxes message" }, { status: 400 });
  }

  const result = await pollInFlightSandboxes(createAdminClient());
  return NextResponse.json({ ok: true, ...result });
}
