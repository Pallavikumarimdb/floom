import { NextRequest, NextResponse, after } from "next/server";
import Ajv from "ajv";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerHasScope, getBearerToken, resolveAuthCaller } from "@/lib/supabase/auth";
import { demoApp, hasSupabaseConfig, runDemoApp } from "@/lib/demo-app";
import { runInSandboxContained } from "@/lib/e2b/runner";
import {
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES,
  MAX_REQUEST_BYTES,
  SANDBOX_TIMEOUT_MS,
} from "@/lib/floom/limits";
import { reconcileQuotaReservation, reserveDailyQuota } from "@/lib/floom/quota";
import {
  appendExecutionEvent,
  appQueueMax,
  generateViewToken,
  isAsyncRuntimeEnabled,
  sanitizePublicError,
  syncWaitBudgetMs,
} from "@/lib/floom/executions";
import {
  getPublicRunAppRateLimitKey,
  getPublicRunRateLimitKey,
  getRunCallerKey,
} from "@/lib/floom/rate-limit";
import { publishExecutionProcessMessage } from "@/lib/floom/queue";
import { readRuntimeDependencies } from "@/lib/floom/requirements";
import { resolveRuntimeSecrets, isAnonPerRunnerError } from "@/lib/floom/runtime-secrets";
import {
  MissingComposioConnectionError,
  resolveComposioConnections,
} from "@/lib/composio/runtime";
import {
  redactExactSecretValues,
  redactSecretInput,
  redactSecretOutput,
} from "@/lib/floom/schema";
import { executionSnapshotAfterWait } from "@/lib/floom/execution-worker";
import { sendEmail } from "@/lib/email/send";
import { renderQuotaWarningEmail } from "@/lib/email/templates";

export const maxDuration = 300;

const ajv = new Ajv({ strict: false });
const DEFAULT_PUBLIC_RUN_RATE_LIMIT_MAX = 20;
// Authenticated non-owner callers: higher limit since they have verified identity.
const DEFAULT_AUTHED_RUN_RATE_LIMIT_MAX = 60;
const DEFAULT_PUBLIC_RUN_APP_RATE_LIMIT_MAX = 500;
const DEFAULT_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS = 60;
// Demo apps share a single GEMINI key — apply tighter caps so anon abuse
// doesn't burn the shared quota.
const DEMO_PUBLIC_RUN_RATE_LIMIT_MAX = 5;
const DEMO_PUBLIC_RUN_APP_RATE_LIMIT_MAX = 100;
const DEMO_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS = 3600;

type LatestVersion = {
  id: string;
  bundle_path: string;
  bundle_kind: "single_file" | "tarball" | null;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
  dependencies: Record<string, unknown> | null;
  secrets: string[] | null;
  composio: string[] | null;
  command: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const routeStartedAt = Date.now();
  const { slug } = await params;
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    const rawBody = await req.text();
    // Enforce the size cap on the actual body bytes, not just the declared
    // Content-Length header. A spoofed Content-Length header (e.g. "100") could
    // bypass the header check above while req.text() reads the full large body.
    if (rawBody.length > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "body_too_large" }, { status: 413 });
    }
    if (rawBody.trim() !== "") {
      body = JSON.parse(rawBody);
    } else {
      body = {};
    }
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const rawInputs = (body as { inputs?: unknown }).inputs;
  // Reject null bytes before any validation or DB write.
  // Postgres jsonb rejects \x00 (SQLSTATE 22P05); rejecting here returns a
  // clear 400 rather than a 500 from the DB layer.
  if (rawInputs !== undefined) {
    try {
      rejectNullBytes(rawInputs, "inputs");
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "null byte in input" },
        { status: 400 }
      );
    }
  }
  const inputs = rawInputs;

  const inputBytes = inputs === undefined ? 0 : Buffer.byteLength(JSON.stringify(inputs), "utf8");
  if (inputBytes > MAX_INPUT_BYTES) {
    return NextResponse.json({ error: "Inputs are too large" }, { status: 413 });
  }

  if (!hasSupabaseConfig() && slug === demoApp.slug) {
    const validateDemoInput = ajv.compile(demoApp.input_schema);
    if (!validateDemoInput(inputs)) {
      return NextResponse.json(
        { error: "Invalid input", details: validateDemoInput.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({
      execution_id: "demo-local",
      status: "success",
      output: runDemoApp((inputs as Record<string, unknown>) ?? {}),
    });
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured. Only the demo app is available without Supabase env." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const { data: app, error } = await admin
    .from("apps")
    .select("*, app_versions(id, bundle_path, bundle_kind, input_schema, output_schema, dependencies, secrets, composio, command)")
    .eq("slug", slug)
    .order("version", { foreignTable: "app_versions", ascending: false })
    .limit(1, { foreignTable: "app_versions" })
    .single();

  if (error || !app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const latestVersion = app.app_versions?.[0] as LatestVersion | undefined;
  if (!latestVersion) {
    return NextResponse.json({ error: "No version found" }, { status: 400 });
  }

  const bearerToken = getBearerToken(req);
  const caller = await resolveAuthCaller(req, admin);
  if (bearerToken && !caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = caller?.userId ?? null;
  const isOwner = userId === app.owner_id;
  if (!isOwner && !app.public) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  if (caller?.kind === "agent_token" && !callerHasScope(caller, "run")) {
    return NextResponse.json({ error: "Missing run scope" }, { status: 403 });
  }

  const inputSchema = latestVersion.input_schema ?? null;
  if (inputSchema) {
    const validateInput = ajv.compile(inputSchema);
    if (!validateInput(inputs)) {
      return NextResponse.json(
        { error: "Invalid input", details: validateInput.errors },
        { status: 400 }
      );
    }
  } else if (inputs !== undefined && !isJsonValue(inputs)) {
    return NextResponse.json(
      { error: "inputs must be valid JSON when no input schema is declared" },
      { status: 400 }
    );
  }

  if (!isOwner) {
    // Authenticated non-owners get a higher per-caller limit (60/60s vs 20/60s).
    const isAuthedCaller = caller?.kind === "user" || caller?.kind === "agent_token";
    const isDemo = Boolean(app.is_demo);
    const rateLimit = await checkPublicRunRateLimit(
      admin,
      app.id,
      getRunCallerKey(caller, req.headers),
      isAuthedCaller,
      isDemo
    );
    if (!rateLimit.allowed) {
      // Retry-After reflects the actual window (demo uses 1h, normal uses global env/default).
      const retryAfterSeconds = isDemo
        ? String(DEMO_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS)
        : String(
            readPositiveIntegerEnv(
              "FLOOM_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS",
              DEFAULT_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS
            )
          );
      return NextResponse.json(
        { error: rateLimit.error },
        { status: rateLimit.status, headers: { "Retry-After": retryAfterSeconds } }
      );
    }
  }

  // Resolve secrets and redact inputs before branching on async vs sync path.
  // Both paths need redactedInputs for the execution record.
  const runtimeSecrets = await resolveRuntimeSecrets(
    admin,
    latestVersion.secrets ?? [],
    app.id,
    app.owner_id,
    userId
  );
  if (isAnonPerRunnerError(runtimeSecrets)) {
    return NextResponse.json(
      {
        error: "This app requires you to sign in and connect your own credentials.",
        requires_sign_in: true,
        missing_secrets: runtimeSecrets.requiresSignIn,
      },
      { status: 401 }
    );
  }
  if (!runtimeSecrets.ok) {
    return NextResponse.json({ error: runtimeSecrets.error }, { status: 503 });
  }

  if (runtimeSecrets.missing.length > 0) {
    return NextResponse.json(
      {
        error: `Missing configured app secret(s): ${runtimeSecrets.missing.join(", ")}`,
        missing_secrets: runtimeSecrets.missing,
      },
      { status: 400 }
    );
  }

  // Resolve Composio connections declared in the manifest composio: field.
  const composioToolkits = Array.isArray(latestVersion.composio) ? latestVersion.composio : [];
  let composioEnv: Record<string, string> = {};
  if (composioToolkits.length > 0) {
    try {
      composioEnv = await resolveComposioConnections(admin, userId, composioToolkits);
    } catch (e) {
      if (e instanceof MissingComposioConnectionError) {
        return NextResponse.json(
          {
            error: "missing_integration",
            legacy_error: "missing_composio_connection",
            toolkits: e.toolkits,
            next: e.reason === "sign-in"
              ? { action: "sign-in", url: "/login" }
              : { action: "connect", url: "/integrations" },
          },
          { status: 412 }
        );
      }
      throw e;
    }
  }

  // Merge Composio env vars on top of secrets env vars.
  const mergedEnvs = { ...runtimeSecrets.envs, ...composioEnv };

  const redactedInputs = inputSchema
    ? redactSecretInput(inputSchema, inputs)
    : redactExactSecretValues(inputs ?? null, Object.values(mergedEnvs));

  if (isAsyncRuntimeEnabled()) {
    const { token: viewToken, hash: viewTokenHash } = generateViewToken();

    // Reserve daily quota BEFORE inserting the execution row (async path).
    // Mirrors the sync path's P0-2 pattern. The execution-worker reconciles
    // the actual seconds when the execution reaches a terminal state.
    const asyncQuota = await reserveDailyQuota(
      admin,
      app.id,
      app.owner_id,
      Math.ceil(SANDBOX_TIMEOUT_MS / 1000)
    );
    if (asyncQuota.allowed && asyncQuota.warningPercent !== undefined && asyncQuota.warningPercent >= 80) {
      after(maybeFireQuotaWarningEmail(admin, app.owner_id, asyncQuota.warningPercent));
    }
    if (!asyncQuota.allowed) {
      if (asyncQuota.reason === "unavailable") {
        return NextResponse.json(
          { error: "quota_check_unavailable", retry_after: asyncQuota.retryAfterUnix },
          { status: 503 }
        );
      }
      const quotaRetryAfter = asyncQuota.retryAfterUnix
        ? String(Math.max(1, asyncQuota.retryAfterUnix - Math.floor(Date.now() / 1000)))
        : "60";
      return NextResponse.json(
        { error: "app_quota_exhausted", retry_after: asyncQuota.retryAfterUnix },
        { status: 429, headers: { "Retry-After": quotaRetryAfter } }
      );
    }

    // P0-1: atomic queue-slot claim via Postgres advisory lock.
    // claim_app_queue_slot takes pg_advisory_xact_lock(app_id), checks the
    // in-flight count, and inserts the execution row in one transaction.
    // Two concurrent requests can no longer both pass the count check.
    const { data: execution, error: execError } = await admin.rpc(
      "claim_app_queue_slot",
      {
        p_app_id: app.id,
        p_queue_max: appQueueMax(),
        p_version_id: latestVersion.id,
        p_caller_user_id: caller?.userId ?? null,
        p_caller_agent_token_id: caller?.kind === "agent_token" ? caller.agentTokenId : null,
        p_input: redactedInputs,
        p_status: "queued",
        p_view_token_hash: viewTokenHash,
      }
    );

    if (execError) {
      // Release quota reservation since no execution row was created.
      await reconcileQuotaReservation(admin, app.id, asyncQuota.reservedSeconds, 0).catch(() => undefined);
      // SQLSTATE P0001 = queue_full raised by claim_app_queue_slot.
      if (execError.code === "P0001") {
        return NextResponse.json(
          { error: "Run queue is full" },
          { status: 429, headers: { "Retry-After": "5" } }
        );
      }
      return NextResponse.json({ error: "Failed to create execution" }, { status: 500 });
    }
    if (!execution) {
      await reconcileQuotaReservation(admin, app.id, asyncQuota.reservedSeconds, 0).catch(() => undefined);
      return NextResponse.json({ error: "Failed to create execution" }, { status: 500 });
    }

    await appendExecutionEvent(admin, execution.id, "status", { status: "queued" });

    try {
      const messageId = await publishExecutionProcessMessage({
        executionId: execution.id,
        pollCount: 0,
        baseUrl: req.nextUrl.origin,
      });
      const { error: queueMessageError } = await admin
        .from("executions")
        .update({ queue_message_id: messageId })
        .eq("id", execution.id);
      if (queueMessageError) {
        throw queueMessageError;
      }
    } catch {
      await admin
        .from("executions")
        .update({
          status: "failed",
          error: "Failed to enqueue execution",
          completed_at: new Date().toISOString(),
        })
        .eq("id", execution.id);
      await appendExecutionEvent(admin, execution.id, "status", {
        status: "failed",
        error: "Failed to enqueue execution",
      });
      // Release quota reservation since the execution failed to enqueue.
      await reconcileQuotaReservation(admin, app.id, asyncQuota.reservedSeconds, 0).catch(() => undefined);
      return NextResponse.json({ error: "Failed to enqueue execution" }, { status: 500 });
    }

    if (req.nextUrl.searchParams.get("wait") === "true") {
      const waited = await executionSnapshotAfterWait(admin, execution.id, syncWaitBudgetMs());
      if (waited?.terminal) {
        return NextResponse.json({ ...waited.snapshot, view_token: viewToken });
      }
      return NextResponse.json({
        ...(waited?.snapshot ?? {
          execution_id: execution.id,
          status: "queued",
          output: null,
          error: null,
          started_at: null,
          completed_at: null,
          progress: null,
        }),
        view_token: viewToken,
      }, { status: 202 });
    }

    return NextResponse.json(
      {
        execution_id: execution.id,
        status: "queued",
        view_token: viewToken,
      },
      { status: 202 }
    );
  }

  // Fetch bundle
  const { data: bundleData, error: bundleError } = await admin.storage
    .from("app-bundles")
    .download(latestVersion.bundle_path);

  if (bundleError || !bundleData) {
    return NextResponse.json(
      { error: "sandbox_unavailable", retry_after: Math.floor(Date.now() / 1000) + 60 },
      { status: 502 }
    );
  }

  // P0-2: reserve quota BEFORE inserting the execution row (sync path).
  // If the process is killed after insert but before reservation, reconcile
  // never fires and quota is not consumed. Reserving first ensures every
  // execution row has a matching reservation that the sweep can account for.
  const quota = await reserveDailyQuota(
    admin,
    app.id,
    app.owner_id,
    Math.ceil(SANDBOX_TIMEOUT_MS / 1000)
  );
  // Fire a soft-cap warning email (once per day) when the owner crosses 80%.
  if (quota.allowed && quota.warningPercent !== undefined && quota.warningPercent >= 80) {
    after(maybeFireQuotaWarningEmail(admin, app.owner_id, quota.warningPercent));
  }

  if (!quota.allowed) {
    if (quota.reason === "unavailable") {
      return NextResponse.json(
        { error: "quota_check_unavailable", retry_after: quota.retryAfterUnix },
        { status: 503 }
      );
    }

    const quotaRetryAfter = quota.retryAfterUnix
      ? String(Math.max(1, quota.retryAfterUnix - Math.floor(Date.now() / 1000)))
      : "60";
    return NextResponse.json(
      { error: "app_quota_exhausted", retry_after: quota.retryAfterUnix },
      { status: 429, headers: { "Retry-After": quotaRetryAfter } }
    );
  }

  // P0-1 (sync path): atomic queue-slot claim via Postgres advisory lock.
  const { token: viewToken, hash: viewTokenHash } = generateViewToken();
  const syncStartedAt = new Date().toISOString();
  const { data: claimedSync, error: claimSyncError } = await admin.rpc(
    "claim_app_queue_slot",
    {
      p_app_id: app.id,
      p_queue_max: appQueueMax(),
      p_version_id: latestVersion.id,
      p_caller_user_id: caller?.userId ?? null,
      p_caller_agent_token_id: caller?.kind === "agent_token" ? caller.agentTokenId : null,
      p_input: redactedInputs ?? {},
      p_status: "running",
      p_view_token_hash: viewTokenHash,
    }
  );

  if (claimSyncError) {
    // Release the quota reservation we just made before returning.
    await reconcileQuotaReservation(admin, app.id, quota.reservedSeconds, 0).catch(() => undefined);
    if (claimSyncError.code === "P0001") {
      return NextResponse.json(
        { error: "Run queue is full" },
        { status: 429, headers: { "Retry-After": "5" } }
      );
    }
    return NextResponse.json({ error: "Failed to create execution" }, { status: 500 });
  }
  if (!claimedSync) {
    await reconcileQuotaReservation(admin, app.id, quota.reservedSeconds, 0).catch(() => undefined);
    return NextResponse.json({ error: "Failed to create execution" }, { status: 500 });
  }

  // Backfill started_at which claim_app_queue_slot doesn't set (status was
  // inserted as "running" but started_at must be set separately).
  const execution = { ...claimedSync, started_at: syncStartedAt } as typeof claimedSync;
  await admin
    .from("executions")
    .update({ started_at: syncStartedAt })
    .eq("id", claimedSync.id);

  const bundleBuffer = Buffer.from(await bundleData.arrayBuffer());
  const outputSchema = latestVersion.output_schema ?? null;
  const runnerStartedAt = Date.now();
  const runnerResult = await runInSandboxContained({
    bundle: bundleBuffer,
    bundleKind: latestVersion.bundle_kind ?? "single_file",
    command: latestVersion.bundle_kind === "tarball" ? latestVersion.command ?? undefined : undefined,
    legacyEntrypoint: app.entrypoint,
    legacyHandler: app.handler,
    inputs,
    hasOutputSchema: Boolean(outputSchema),
    dependencies: readRuntimeDependencies(latestVersion.dependencies),
    secrets: mergedEnvs,
    deadlineAt: routeStartedAt + SANDBOX_TIMEOUT_MS,
  });

  const actualQuotaSeconds = runnerResult.kind === "sandbox_unavailable"
    ? Math.max(1, Math.ceil((Date.now() - runnerStartedAt) / 1000))
    : Math.max(1, Math.ceil(runnerResult.elapsedMs / 1000));
  const quotaReconcile = await reconcileQuotaReservation(
    admin,
    app.id,
    quota.reservedSeconds,
    actualQuotaSeconds
  );
  if (!quotaReconcile.ok) {
    await admin
      .from("executions")
      .update({
        status: "error",
        error: "quota_record_unavailable",
        error_detail: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

    return NextResponse.json(
      { error: "quota_record_unavailable", retry_after: Math.floor(Date.now() / 1000) + 60 },
      { status: 503 }
    );
  }

  if (runnerResult.kind === "sandbox_unavailable") {
    await admin
      .from("executions")
      .update({
        status: "error",
        error: runnerResult.detail,
        error_detail: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

    return NextResponse.json(
      { error: "sandbox_unavailable", retry_after: runnerResult.retryAfterUnix },
      { status: 502 }
    );
  }

  if (runnerResult.kind === "failed" || runnerResult.kind === "timed_out") {
    const safeError = sanitizePublicError(
      runnerResult.error.detail ?? runnerResult.error.phase,
      "App execution failed",
      Object.values(mergedEnvs)
    );
    await admin
      .from("executions")
      .update({
        status: runnerResult.kind === "timed_out" ? "timed_out" : "failed",
        output: null,
        error: safeError,
        error_detail: runnerResult.error,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

    return NextResponse.json({
      execution_id: execution.id,
      status: runnerResult.kind === "timed_out" ? "timed_out" : "failed",
      output: null,
      error: runnerResult.error,
      view_token: viewToken,
    });
  }

  const outputValidation = validateOutputPayload(outputSchema, runnerResult.output);
  if (!outputValidation.ok) {
    const errorDetail = {
      phase: "output_validation" as const,
      stderr_tail: tailRunnerText(runnerResult.stderr),
      detail: outputValidation.error,
    };

    await admin
      .from("executions")
      .update({
        status: "failed",
        output: null,
        error: outputValidation.error,
        error_detail: errorDetail,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

    return NextResponse.json({
      execution_id: execution.id,
      status: "failed",
      output: null,
      error: errorDetail,
      view_token: viewToken,
    });
  }

  const redactedOutput = redactExactSecretValues(
    outputSchema ? redactSecretOutput(outputSchema, runnerResult.output) : runnerResult.output,
    Object.values(mergedEnvs)
  );

  await admin
    .from("executions")
    .update({
      status: "succeeded",
      output: redactedOutput,
      error: null,
      error_detail: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", execution.id);

  return NextResponse.json({
    execution_id: execution.id,
    status: "succeeded",
    output: redactedOutput,
    error: null,
    view_token: viewToken,
  });
}

// P1-3: Fire a quota warning email once per day per owner.
// Idempotency guard: INSERT into quota_warning_log (unique on user_id +
// warned_date). The winning INSERT fires the email; duplicate inserts
// (SQLSTATE 23505) are silently ignored. Replaces the read-modify-write
// on user_metadata which had a TOCTOU race. Never throws.
async function maybeFireQuotaWarningEmail(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  percentUsed: number
): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Attempt to claim the "send slot" for today atomically.
    const { error: logError } = await admin
      .from("quota_warning_log")
      .insert({ user_id: ownerId, warned_date: today });

    if (logError) {
      // 23505 = unique_violation: already sent today. Any other error: skip silently.
      return;
    }

    // We won the race — fetch user details and send.
    const { data: userRecord } = await admin.auth.admin.getUserById(ownerId);
    if (!userRecord?.user?.email) return;

    const meta = (userRecord.user.user_metadata ?? {}) as Record<string, unknown>;
    const name =
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      null;

    const resetDate = new Date();
    resetDate.setUTCHours(24, 0, 0, 0);
    const resetAtUtc = resetDate.toISOString().slice(0, 10);

    const publicUrl =
      process.env.FLOOM_ORIGIN ??
      process.env.NEXT_PUBLIC_FLOOM_ORIGIN ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://floom.dev";

    const { subject, html, text } = renderQuotaWarningEmail({
      name,
      publicUrl,
      percentUsed,
      resetAtUtc,
    });

    await sendEmail({ to: userRecord.user.email, subject, html, text });
  } catch (err) {
    console.error("[quota-warning] email error:", err);
  }
}

async function checkPublicRunRateLimit(
  admin: ReturnType<typeof createAdminClient>,
  appId: string,
  callerKey: string,
  isAuthedCaller = false,
  isDemo = false
): Promise<
  | { allowed: true }
  | {
      allowed: false;
      status: number;
      error: string;
    }
> {
  // Demo apps share a single key and use fixed, tighter caps (5/hr per caller,
  // 100/hr per app) regardless of env var overrides. Non-demo apps use the
  // global env-var-overrideable defaults.
  const windowSeconds = isDemo
    ? DEMO_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS
    : readPositiveIntegerEnv(
        "FLOOM_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS",
        DEFAULT_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS
      );
  const callerLimit = isDemo
    ? DEMO_PUBLIC_RUN_RATE_LIMIT_MAX
    : isAuthedCaller
      ? readPositiveIntegerEnv("FLOOM_AUTHED_RUN_RATE_LIMIT_MAX", DEFAULT_AUTHED_RUN_RATE_LIMIT_MAX)
      : readPositiveIntegerEnv("FLOOM_PUBLIC_RUN_RATE_LIMIT_MAX", DEFAULT_PUBLIC_RUN_RATE_LIMIT_MAX);
  const appLimit = isDemo
    ? DEMO_PUBLIC_RUN_APP_RATE_LIMIT_MAX
    : readPositiveIntegerEnv("FLOOM_PUBLIC_RUN_APP_RATE_LIMIT_MAX", DEFAULT_PUBLIC_RUN_APP_RATE_LIMIT_MAX);
  const checks = [
    {
      key: getPublicRunRateLimitKey(appId, callerKey),
      limit: callerLimit,
    },
    {
      key: getPublicRunAppRateLimitKey(appId),
      limit: appLimit,
    },
  ];

  for (const check of checks) {
    const { data, error } = await admin.rpc("check_public_run_rate_limit", {
      p_rate_key: check.key,
      p_limit: check.limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      return {
        allowed: false,
        status: 503,
        error: "Run rate limit check failed",
      };
    }

    if (data !== true) {
      return {
        allowed: false,
        status: 429,
        error: "Run rate limit exceeded",
      };
    }
  }

  return { allowed: true };
}

function validateOutputPayload(
  outputSchema: Record<string, unknown> | null,
  output: unknown
) {
  const bytes = Buffer.byteLength(JSON.stringify(output ?? null), "utf8");
  if (bytes > MAX_OUTPUT_BYTES) {
    return { ok: false as const, error: "output exceeds the 1 MB limit" };
  }

  if (!outputSchema) {
    return { ok: true as const };
  }

  const validateOutput = ajv.compile(outputSchema);
  if (!validateOutput(output)) {
    return { ok: false as const, error: "Output validation failed" };
  }

  return { ok: true as const };
}

function tailRunnerText(text: string) {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.byteLength <= 2048) {
    return text;
  }
  return buffer.subarray(buffer.byteLength - 2048).toString("utf8");
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function isJsonValue(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively reject null bytes (\x00) in any string value of a JSON-safe
 * structure. Postgres jsonb rejects \x00 (SQLSTATE 22P05); catching here
 * returns a clean 400 to the caller rather than a 500 from the DB layer.
 * Throws an Error with a human-readable path on the first violation found.
 */
export function rejectNullBytes(value: unknown, path = "inputs"): void {
  if (typeof value === "string") {
    if (value.includes("\x00")) {
      throw new Error(`null byte in input at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => rejectNullBytes(v, `${path}[${i}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      rejectNullBytes(v, `${path}.${k}`);
    }
  }
}
