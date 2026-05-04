import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBearerToken, resolveAuthCaller } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/demo-app";
import {
  extractViewToken,
  generateViewToken,
  normalizeExecutionStatus,
} from "@/lib/floom/executions";
import type { ExecutionRow, AppVisibilityRow } from "@/lib/floom/executions";

// UUID v4 pattern — rejects obviously invalid IDs before hitting the DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Re-export generateViewToken so other modules can generate tokens without
// importing from two places. (Submission routes import from here.)
export { generateViewToken };

// Prevents shared/CDN caches from storing user-private execution data.
const PRIVATE_CACHE = { "Cache-Control": "private, no-store" } as const;

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
    .select("id, app_id, caller_user_id, input, output, status, error, error_detail, created_at, started_at, completed_at, progress, view_token_hash")
    .eq("id", id)
    .maybeSingle<ExecutionRow & { error_detail: Record<string, unknown> | null }>();

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
    .maybeSingle<AppVisibilityRow>();

  if (appError) {
    return NextResponse.json({ error: "Failed to load app" }, { status: 500 });
  }

  if (!app) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // ── Determine caller role ──────────────────────────────────────────────────
  //
  // Runner (authed):   caller.userId === execution.caller_user_id
  // Runner (anon):     caller holds view_token matching execution.view_token_hash
  // Owner:             caller.userId === app.owner_id
  // Stranger:          none of the above → 404

  const isAuthedRunner =
    caller?.userId != null && caller.userId === execution.caller_user_id;

  const providedViewToken = extractViewToken(req);
  let isViewTokenRunner = false;
  if (
    !isAuthedRunner &&
    typeof providedViewToken === "string" &&
    typeof execution.view_token_hash === "string" &&
    execution.view_token_hash.length > 0
  ) {
    // Import and use verifyViewToken via the shared crypto path. We inline the
    // check here to avoid exposing an internal helper; the logic is simple.
    const { createHash, timingSafeEqual } = await import("node:crypto");
    const providedHash = createHash("sha256").update(providedViewToken).digest("hex");
    const storedHash = execution.view_token_hash;
    try {
      isViewTokenRunner =
        providedHash.length === storedHash.length &&
        timingSafeEqual(
          Buffer.from(providedHash, "hex"),
          Buffer.from(storedHash, "hex"),
        );
    } catch {
      isViewTokenRunner = false;
    }
  }

  const isRunner = isAuthedRunner || isViewTokenRunner;
  const isOwner = caller?.userId != null && caller.userId === app.owner_id;

  // Gate visibility: strangers on public apps still get 404 for individual runs.
  // Owners see analytics only. Runners see the full execution.
  if (!isRunner && !isOwner) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // ── Build response based on caller role ────────────────────────────────────
  const status = normalizeExecutionStatus(execution.status);

  const baseFields = {
    id: execution.id,
    app_slug: app.slug,
    status,
    created_at: execution.created_at,
    started_at: execution.started_at,
    completed_at: execution.completed_at,
  };

  if (isRunner) {
    // Full execution: runner sees everything they need to reconstruct their run.
    return NextResponse.json(
      {
        ...baseFields,
        inputs: execution.input,
        output: execution.output,
        progress: execution.progress,
        error: execution.error,
        error_detail: execution.error_detail,
      },
      { headers: PRIVATE_CACHE },
    );
  }

  // isOwner only: analytics shape — never inputs/output/error_detail.
  return NextResponse.json(
    {
      ...baseFields,
      // Sanitized error code only — no detail string.
      error_code: execution.error ? (execution.error.slice(0, 64) ?? null) : null,
    },
    { headers: PRIVATE_CACHE },
  );
}
