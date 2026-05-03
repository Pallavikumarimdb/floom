import { NextRequest, NextResponse } from "next/server";
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
  isAsyncRuntimeEnabled,
  syncWaitBudgetMs,
} from "@/lib/floom/executions";
import {
  getPublicRunAppRateLimitKey,
  getPublicRunRateLimitKey,
  getRunCallerKey,
} from "@/lib/floom/rate-limit";
import { publishExecutionProcessMessage } from "@/lib/floom/queue";
import { readRuntimeDependencies } from "@/lib/floom/requirements";
import { resolveRuntimeSecrets } from "@/lib/floom/runtime-secrets";
import {
  redactExactSecretValues,
  redactSecretInput,
  redactSecretOutput,
} from "@/lib/floom/schema";
import { executionSnapshotAfterWait } from "@/lib/floom/execution-worker";

export const maxDuration = 60;

const ajv = new Ajv({ strict: false });
const DEFAULT_PUBLIC_RUN_RATE_LIMIT_MAX = 20;
const DEFAULT_PUBLIC_RUN_APP_RATE_LIMIT_MAX = 100;
const DEFAULT_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS = 60;

type LatestVersion = {
  id: string;
  bundle_path: string;
  bundle_kind: "single_file" | "tarball" | null;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
  dependencies: Record<string, unknown> | null;
  secrets: string[] | null;
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
    if (rawBody.trim() !== "") {
      body = JSON.parse(rawBody);
    } else {
      body = {};
    }
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const inputs = (body as { inputs?: unknown }).inputs;

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
    .select("*, app_versions(*)")
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
    const rateLimit = await checkPublicRunRateLimit(
      admin,
      app.id,
      getRunCallerKey(caller, req.headers)
    );
    if (!rateLimit.allowed) {
      const retryAfterSeconds = String(
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
    app.owner_id
  );
  if (!runtimeSecrets.ok) {
    return NextResponse.json({ error: runtimeSecrets.error }, { status: 503 });
  }

  if (runtimeSecrets.missing.length > 0) {
    return NextResponse.json(
      {
        error: `Missing configured app secret(s): ${runtimeSecrets.missing.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const redactedInputs = inputSchema
    ? redactSecretInput(inputSchema, inputs)
    : redactExactSecretValues(inputs ?? null, Object.values(runtimeSecrets.envs));

  if (isAsyncRuntimeEnabled()) {
    const queueDepth = await checkAppQueueDepth(admin, app.id);
    if (!queueDepth.allowed) {
      const queueHeaders = queueDepth.status === 429 ? { "Retry-After": "30" } : undefined;
      return NextResponse.json({ error: queueDepth.error }, { status: queueDepth.status, headers: queueHeaders });
    }

    const { data: execution, error: execError } = await admin
      .from("executions")
      .insert({
        app_id: app.id,
        version_id: latestVersion.id,
        caller_user_id: caller?.kind === "user" ? caller.userId : null,
        caller_agent_token_id: caller?.kind === "agent_token" ? caller.agentTokenId : null,
        input: redactedInputs,
        status: "queued",
      })
      .select()
      .single();

    if (execError || !execution) {
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
      return NextResponse.json({ error: "Failed to enqueue execution" }, { status: 500 });
    }

    if (req.nextUrl.searchParams.get("wait") === "true") {
      const waited = await executionSnapshotAfterWait(admin, execution.id, syncWaitBudgetMs());
      if (waited?.terminal) {
        return NextResponse.json(waited.snapshot);
      }
      return NextResponse.json(waited?.snapshot ?? {
        execution_id: execution.id,
        status: "queued",
        output: null,
        error: null,
        started_at: null,
        completed_at: null,
        progress: null,
      }, { status: 202 });
    }

    return NextResponse.json(
      {
        execution_id: execution.id,
        status: "queued",
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

  const syncStartedAt = new Date().toISOString();
  const { data: execution, error: execError } = await admin
    .from("executions")
    .insert({
      app_id: app.id,
      version_id: latestVersion.id,
      caller_user_id: caller?.kind === "user" ? caller.userId : null,
      caller_agent_token_id: caller?.kind === "agent_token" ? caller.agentTokenId : null,
      input: redactedInputs ?? {},
      status: "running",
      started_at: syncStartedAt,
    })
    .select()
    .single();

  if (execError || !execution) {
    return NextResponse.json({ error: "Failed to create execution" }, { status: 500 });
  }

  const quota = await reserveDailyQuota(
    admin,
    app.id,
    app.owner_id,
    Math.ceil(SANDBOX_TIMEOUT_MS / 1000)
  );
  if (!quota.allowed) {
    await admin
      .from("executions")
      .update({
        status: "error",
        error: quota.reason === "unavailable" ? "quota_check_unavailable" : "app_quota_exhausted",
        error_detail: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

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
    secrets: runtimeSecrets.envs,
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
    await admin
      .from("executions")
      .update({
        status: runnerResult.kind === "timed_out" ? "timed_out" : "failed",
        output: null,
        error: runnerResult.error.detail ?? runnerResult.error.phase,
        error_detail: runnerResult.error,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

    return NextResponse.json({
      execution_id: execution.id,
      status: runnerResult.kind === "timed_out" ? "timed_out" : "failed",
      output: null,
      error: runnerResult.error,
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
    });
  }

  const redactedOutput = redactExactSecretValues(
    outputSchema ? redactSecretOutput(outputSchema, runnerResult.output) : runnerResult.output,
    Object.values(runtimeSecrets.envs)
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
  });
}

async function checkAppQueueDepth(
  admin: ReturnType<typeof createAdminClient>,
  appId: string
): Promise<
  | { allowed: true }
  | {
      allowed: false;
      status: number;
      error: string;
    }
> {
  const { count, error } = await admin
    .from("executions")
    .select("id", { count: "exact", head: true })
    .eq("app_id", appId)
    .in("status", ["queued", "running"]);

  if (error) {
    return { allowed: false, status: 503, error: "Run queue check failed" };
  }

  if ((count ?? 0) >= appQueueMax()) {
    return { allowed: false, status: 429, error: "Run queue is full" };
  }

  return { allowed: true };
}

async function checkPublicRunRateLimit(
  admin: ReturnType<typeof createAdminClient>,
  appId: string,
  callerKey: string
): Promise<
  | { allowed: true }
  | {
      allowed: false;
      status: number;
      error: string;
    }
> {
  const windowSeconds = readPositiveIntegerEnv(
    "FLOOM_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS",
    DEFAULT_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS
  );
  const checks = [
    {
      key: getPublicRunRateLimitKey(appId, callerKey),
      limit: readPositiveIntegerEnv(
        "FLOOM_PUBLIC_RUN_RATE_LIMIT_MAX",
        DEFAULT_PUBLIC_RUN_RATE_LIMIT_MAX
      ),
    },
    {
      key: getPublicRunAppRateLimitKey(appId),
      limit: readPositiveIntegerEnv(
        "FLOOM_PUBLIC_RUN_APP_RATE_LIMIT_MAX",
        DEFAULT_PUBLIC_RUN_APP_RATE_LIMIT_MAX
      ),
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
