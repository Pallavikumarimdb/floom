import Ajv from "ajv";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  killSandboxExecution,
  pollSandboxExecution,
  runInSandboxContained,
  startSandboxExecution,
  type RunnerConfig,
} from "@/lib/e2b/runner";
import {
  executionLeaseMs,
  executionTtlMs,
  formatExecutionSnapshot,
  isTerminalExecutionStatus,
  nextPollDelaySeconds,
  normalizeExecutionStatus,
  queueTtlMs,
  sandboxTimeoutMs,
  sanitizePublicError,
  staleRunningMs,
  type ExecutionRow,
} from "@/lib/floom/executions";
import { MAX_BUNDLE_BYTES, MAX_SOURCE_BYTES } from "@/lib/floom/limits";
import { publishExecutionProcessMessage } from "@/lib/floom/queue";

// E2B Free tier: 1 concurrent sandbox. When it's busy, requeue instead of
// failing immediately. Cap at MAX_INFRA_ATTEMPTS to avoid infinite loops.
const MAX_INFRA_ATTEMPTS = 30;
const INFRA_RETRY_DELAY_SECONDS = 10;
import { readRuntimeDependencies } from "@/lib/floom/requirements";
import { resolveRuntimeSecrets, isAnonPerRunnerError } from "@/lib/floom/runtime-secrets";
import {
  MissingComposioConnectionError,
  resolveComposioConnections,
} from "@/lib/composio/runtime";
import { redactExactSecretValues, redactSecretOutput } from "@/lib/floom/schema";
import { reconcileQuotaReservation, reserveDailyQuota } from "@/lib/floom/quota";

const ajv = new Ajv({ strict: false });

type AppRow = {
  id: string;
  owner_id: string;
  slug: string;
  public: boolean;
  runtime: "python";
  entrypoint: string;
  handler: string;
  max_concurrency?: number | null;
};

type VersionRow = {
  id: string;
  app_id: string;
  bundle_path: string;
  bundle_kind: "single_file" | "tarball" | null;
  command: string | null;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  dependencies: Record<string, unknown>;
  secrets: unknown;
  composio: string[] | null;
};

type ExecutionEventInsert = {
  execution_id: string;
  kind: "status" | "progress" | "stdout" | "stderr" | "heartbeat" | "system";
  payload: Record<string, unknown> | null;
};

class LeaseLostError extends Error {
  constructor() {
    super("Execution lease is no longer owned by this worker");
  }
}

class WorkerMutationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export async function processExecutionOnce(
  admin: SupabaseClient,
  executionId: string,
  baseUrl?: string
) {
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.now() + executionLeaseMs()).toISOString();
  const { data: claimedRows, error: claimError } = await admin.rpc("claim_execution_lease", {
    p_execution_id: executionId,
    p_lease_token: leaseToken,
    p_lease_expires_at: leaseExpiresAt,
  });

  if (claimError) {
    return { status: 500, body: { error: "Failed to claim execution lease" } };
  }

  const execution = Array.isArray(claimedRows) ? (claimedRows[0] as ExecutionRow | undefined) : null;
  if (!execution) {
    return { status: 202, body: { ok: true, skipped: "lease_unavailable" } };
  }

  if (isTerminalExecutionStatus(execution.status)) {
    return { status: 200, body: { ok: true, skipped: "terminal" } };
  }

  const context = await loadExecutionContext(admin, execution);
  if (!context.ok) {
    await finalizeExecution(admin, execution, leaseToken, "failed", context.error, null);
    return { status: 200, body: { ok: true, terminal: "failed" } };
  }

  if (execution.cancel_requested_at) {
    await cancelExecution(admin, execution, leaseToken);
    return { status: 200, body: { ok: true, terminal: "cancelled" } };
  }

  const status = normalizeExecutionStatus(execution.status);
  try {
    if (status === "queued") {
      await scheduleNextPoll(admin, execution, leaseToken, 5, baseUrl);
      return { status: 202, body: { ok: true, queued: "concurrency_limit" } };
    }

    if (!execution.sandbox_id) {
      return startExecution(admin, execution, context.app, context.version, leaseToken, baseUrl);
    }

    return pollExecution(admin, execution, context.app, context.version, leaseToken, baseUrl);
  } catch (error) {
    if (error instanceof LeaseLostError) {
      return { status: 202, body: { ok: true, skipped: "lease_lost" } };
    }
    return { status: 503, body: { error: "Failed to process execution" } };
  }
}

export async function sweepExecutions(admin: SupabaseClient, baseUrl?: string) {
  const now = Date.now();
  const queuedBefore = new Date(now - queueTtlMs()).toISOString();
  const staleBefore = new Date(now - staleRunningMs()).toISOString();
  const ttlBefore = new Date(now - executionTtlMs()).toISOString();
  // Catch-all: any running execution whose effective start time exceeds 1.5x
  // executionTtlMs (default 2400s → hard deadline 3600s = 60min) is definitively stuck.
  const hardDeadlineBefore = new Date(now - Math.floor(executionTtlMs() * 1.5)).toISOString();

  const { data: staleQueued } = await admin
    .from("executions")
    .select("*")
    .eq("status", "queued")
    .lt("created_at", queuedBefore)
    .limit(50)
    .returns<ExecutionRow[]>();

  for (const execution of staleQueued ?? []) {
    await forceFinalizeExecution(admin, execution, "timed_out", "Execution exceeded SANDBOX_TIMEOUT_MS", null, {
      timed_out_at: new Date().toISOString(),
    });
  }

  // Rows with a stale last_heartbeat_at (heartbeat was set but stopped updating).
  // The `.or` guard excludes rows already covered by the TTL sweep below so we
  // don't double-process the same execution in both loops.
  const { data: heartbeatStaleRunning } = await admin
    .from("executions")
    .select("*")
    .eq("status", "running")
    .lt("last_heartbeat_at", staleBefore)
    .not("last_heartbeat_at", "is", null)
    .gte("started_at", ttlBefore)
    .limit(50)
    .returns<ExecutionRow[]>();

  for (const execution of heartbeatStaleRunning ?? []) {
    await recoverOrTerminateStaleRunning(admin, execution, "stale_heartbeat");
  }

  const { data: ttlRunning } = await admin
    .from("executions")
    .select("*")
    .eq("status", "running")
    .lt("started_at", ttlBefore)
    .limit(50)
    .returns<ExecutionRow[]>();

  for (const execution of ttlRunning ?? []) {
    await recoverOrTerminateStaleRunning(admin, execution, "ttl");
  }

  // Workers that died before ever setting last_heartbeat_at.
  // These fall through both heartbeatStaleRunning and ttlRunning because NULL
  // comparisons evaluate to false/NULL in SQL.  Match on NULL heartbeat +
  // coalesce(started_at, created_at) older than staleRunningMs.
  const { data: noHeartbeatRunning } = await admin
    .from("executions")
    .select("*")
    .eq("status", "running")
    .is("last_heartbeat_at", null)
    .or(`started_at.lt.${staleBefore},and(started_at.is.null,created_at.lt.${staleBefore})`)
    .limit(50)
    .returns<ExecutionRow[]>();

  for (const execution of noHeartbeatRunning ?? []) {
    await recoverOrTerminateStaleRunning(admin, execution, "stale_heartbeat");
  }

  // Hard catch-all: any running row whose effective age exceeds 1.5x
  // executionTtlMs * 1.5 is force-transitioned to timed_out regardless of heartbeat
  // or lease state.  This ensures the UI never shows a permanently-stuck run.
  const { data: hardDeadlineRunning } = await admin
    .from("executions")
    .select("*")
    .eq("status", "running")
    .or(
      `started_at.lt.${hardDeadlineBefore},and(started_at.is.null,created_at.lt.${hardDeadlineBefore})`
    )
    .limit(50)
    .returns<ExecutionRow[]>();

  for (const execution of hardDeadlineRunning ?? []) {
    await forceFinalizeExecution(
      admin,
      execution,
      "timed_out",
      "execution stuck — sandbox unresponsive",
      null,
      { timed_out_at: new Date().toISOString(), error_phase: "sweep" }
    );
    if (execution.sandbox_id) {
      await killSandboxExecution(execution.sandbox_id, execution.sandbox_pid).catch(() => undefined);
    }
  }

  const { data: staleLeases } = await admin
    .from("executions")
    .select("*")
    .in("status", ["queued", "running"])
    .lt("lease_expires_at", new Date().toISOString())
    .limit(50)
    .returns<ExecutionRow[]>();

  for (const execution of staleLeases ?? []) {
    if (isTerminalExecutionStatus(execution.status)) {
      continue;
    }
    const { error: clearError } = await admin.rpc("clear_execution_lease", { p_execution_id: execution.id });
    if (clearError) {
      continue;
    }
    await publishExecutionProcessMessage({
      executionId: execution.id,
      pollCount: execution.poll_count + 1,
      delaySeconds: 0,
      baseUrl,
    }).catch(() => undefined);
  }

  return {
    stale_queued: staleQueued?.length ?? 0,
    stale_running:
      (heartbeatStaleRunning?.length ?? 0) +
      (ttlRunning?.length ?? 0) +
      (noHeartbeatRunning?.length ?? 0),
    hard_deadline: hardDeadlineRunning?.length ?? 0,
    stale_leases: staleLeases?.length ?? 0,
  };
}

async function startExecution(
  admin: SupabaseClient,
  execution: ExecutionRow,
  app: AppRow,
  version: VersionRow,
  leaseToken: string,
  baseUrl?: string
) {
  const bundleKind = version.bundle_kind ?? "single_file";
  const bundle = await loadBundle(admin, version.bundle_path, bundleKind);
  if (!bundle.ok) {
    await finalizeExecution(admin, execution, leaseToken, "failed", bundle.error, null);
    return { status: 200, body: { ok: true, terminal: "failed" } };
  }

  const runtimeSecrets = await resolveRuntimeSecrets(
    admin,
    version.secrets ?? [],
    app.id,
    app.owner_id,
    execution.caller_user_id
  );

  if (isAnonPerRunnerError(runtimeSecrets)) {
    await finalizeExecution(admin, execution, leaseToken, "failed", "This app requires sign-in to connect your own credentials.", null);
    return { status: 200, body: { ok: true, terminal: "failed" } };
  }
  if (!runtimeSecrets.ok) {
    await finalizeExecution(admin, execution, leaseToken, "failed", runtimeSecrets.error, null);
    return { status: 200, body: { ok: true, terminal: "failed" } };
  }

  if (runtimeSecrets.missing.length > 0) {
    await finalizeExecution(
      admin,
      execution,
      leaseToken,
      "failed",
      `Missing configured app secret(s): ${runtimeSecrets.missing.join(", ")}`,
      null
    );
    return { status: 200, body: { ok: true, terminal: "failed" } };
  }

  // Re-read cancel_requested_at immediately before launching the sandbox.
  // A DELETE request may have arrived after the lease was claimed, so the
  // cancel flag could be set between claim_execution_lease returning and
  // this point.  Holding the lease means no other worker can start this
  // execution concurrently, so this single fresh SELECT closes the window.
  const { data: freshRow } = await admin
    .from("executions")
    .select("cancel_requested_at, cancel_reason")
    .eq("id", execution.id)
    .eq("lease_token", leaseToken)
    .maybeSingle<Pick<ExecutionRow, "cancel_requested_at" | "cancel_reason">>();

  if (freshRow?.cancel_requested_at) {
    await cancelExecution(admin, { ...execution, ...freshRow }, leaseToken);
    return { status: 200, body: { ok: true, terminal: "cancelled" } };
  }

  // Resolve Composio connections declared in the manifest composio: field.
  // Failures surface as a terminal "failed" execution rather than a 412 (since
  // the execution row already exists by the time the worker runs).
  const composioToolkits = Array.isArray(version.composio) ? version.composio : [];
  let composioEnv: Record<string, string> = {};
  if (composioToolkits.length > 0) {
    try {
      composioEnv = await resolveComposioConnections(admin, execution.caller_user_id, composioToolkits);
    } catch (e) {
      if (e instanceof MissingComposioConnectionError) {
        await finalizeExecution(
          admin,
          execution,
          leaseToken,
          "failed",
          e.reason === "sign-in"
            ? `This app requires Composio connections (${e.toolkits.join(", ")}). Sign in to continue.`
            : `Missing active Composio connection for: ${e.toolkits.join(", ")}. Visit /connections to connect.`,
          null
        );
        return { status: 200, body: { ok: true, terminal: "failed" } };
      }
      throw e;
    }
  }

  // Merge Composio env vars on top of runtime secrets.
  const mergedEnvs = { ...runtimeSecrets.envs, ...composioEnv };

  if (bundleKind === "tarball") {
    // Tarball (stock_e2b) path: delegate to runInSandboxContained, same as the
    // sync route, then record the sandbox result directly as a terminal execution.
    // The async worker uses start/poll for long-running jobs, but runInSandboxContained
    // handles the full lifecycle internally — it creates and kills its own sandbox.
    // We record the result inline rather than persisting a sandbox_id for polling.
    let runnerResult: Awaited<ReturnType<typeof runInSandboxContained>> | null = null;
    const tarballStartedAt = Date.now();
    try {
      const runnerConfig: RunnerConfig = {
        bundle: (bundle as { ok: true; buffer: Buffer }).buffer,
        bundleKind: "tarball",
        command: version.command ?? undefined,
        inputs: execution.input,
        hasOutputSchema: Boolean(version.output_schema && Object.keys(version.output_schema).length > 0),
        dependencies: readRuntimeDependencies(version.dependencies),
        secrets: mergedEnvs,
      };
      runnerResult = await runInSandboxContained(runnerConfig);
    } catch (error) {
      if (error instanceof LeaseLostError) {
        return { status: 202, body: { ok: true, skipped: "lease_lost" } };
      }
      const actualSeconds = Math.max(1, Math.ceil((Date.now() - tarballStartedAt) / 1000));
      await reconcileQuotaUsage(admin, app, execution, actualSeconds).catch(() => undefined);
      await finalizeExecution(admin, execution, leaseToken, "failed", "App execution failed", null)
        .catch(() => undefined);
      return { status: 200, body: { ok: true, terminal: "failed" } };
    }

    if (runnerResult.kind === "sandbox_unavailable") {
      // E2B Free tier: sandbox is busy/rate-limited. Requeue with backoff instead
      // of failing immediately, up to MAX_INFRA_ATTEMPTS.
      // No sandbox time was consumed — release the full reservation.
      await reconcileQuotaUsage(admin, app, execution, 0).catch(() => undefined);
      const infraAttempt = (execution.infra_attempt_count ?? 0) + 1;
      if (infraAttempt <= MAX_INFRA_ATTEMPTS) {
        await updateExecutionByLease(admin, execution, leaseToken, {
          infra_attempt_count: infraAttempt,
        });
        await scheduleNextPoll(admin, { ...execution, infra_attempt_count: infraAttempt }, leaseToken, INFRA_RETRY_DELAY_SECONDS, baseUrl);
        return { status: 202, body: { ok: true, queued: "sandbox_busy_retry" } };
      }
      await finalizeExecution(admin, execution, leaseToken, "failed", "Sandbox unavailable", null)
        .catch(() => undefined);
      return { status: 200, body: { ok: true, terminal: "failed" } };
    }

    const actualTarballSeconds = runnerResult.kind === "success"
      ? Math.max(1, Math.ceil((runnerResult.elapsedMs ?? (Date.now() - tarballStartedAt)) / 1000))
      : Math.max(1, Math.ceil((Date.now() - tarballStartedAt) / 1000));
    await reconcileQuotaUsage(admin, app, execution, actualTarballSeconds).catch(() => undefined);

    if (runnerResult.kind === "success") {
      const validateOutput = ajv.compile(version.output_schema ?? {});
      const outputValid = validateOutput(runnerResult.output ?? {});
      if (!outputValid) {
        await finalizeExecution(admin, execution, leaseToken, "failed", "Output validation failed", null);
        return { status: 200, body: { ok: true, terminal: "failed" } };
      }
      await finalizeExecution(admin, execution, leaseToken, "succeeded", null, runnerResult.output);
      return { status: 200, body: { ok: true, terminal: "succeeded" } };
    }

    const terminalStatus = runnerResult.kind === "timed_out" ? "timed_out" : "failed";
    const errorMsg = runnerResult.error?.detail ?? runnerResult.error?.stderr_tail ?? "App execution failed";
    await finalizeExecution(admin, execution, leaseToken, terminalStatus, errorMsg, null);
    return { status: 200, body: { ok: true, terminal: terminalStatus } };
  }

  // single_file (legacy_python) path: start a sandbox and let the async poll loop handle it.
  let started: Awaited<ReturnType<typeof startSandboxExecution>> | null = null;
  try {
    started = await startSandboxExecution({
      source: (bundle as { ok: true; source: string }).source,
      inputs: execution.input,
      runtime: app.runtime,
      entrypoint: app.entrypoint,
      handler: app.handler,
      dependencies: readRuntimeDependencies(version.dependencies),
      secrets: mergedEnvs,
      // Give the E2B sandbox the full execution TTL budget so jobs that run
      // longer than the old 250 s default are not killed by E2B before the
      // poller can finalize them.
      timeoutMs: executionTtlMs(),
    });

    const now = new Date().toISOString();
    const pollDelaySeconds = nextPollDelaySeconds({ ...execution, started_at: now });
    const nextPollAt = new Date(Date.now() + pollDelaySeconds * 1000).toISOString();
    await updateExecutionByLease(admin, execution, leaseToken, {
      status: "running",
      started_at: execution.started_at ?? now,
      last_heartbeat_at: now,
      heartbeat_at: now,
      sandbox_id: started.sandboxId,
      sandbox_pid: started.pid,
      next_poll_at: nextPollAt,
    });
    await insertExecutionEvents(admin, [
      {
        execution_id: execution.id,
        kind: "status",
        payload: { status: "running" },
      },
    ]);
    const messageId = await publishExecutionProcessMessage({
      executionId: execution.id,
      pollCount: execution.poll_count + 1,
      delaySeconds: pollDelaySeconds,
      baseUrl,
    });
    await updateExecutionByLease(admin, execution, leaseToken, {
      queue_message_id: messageId,
      lease_token: null,
      lease_expires_at: null,
      lease_until: null,
    });
    return { status: 202, body: { ok: true, status: "running" } };
  } catch (error) {
    if (error instanceof LeaseLostError) {
      return { status: 202, body: { ok: true, skipped: "lease_lost" } };
    }
    if (started) {
      await killSandboxExecution(started.sandboxId, started.pid).catch((killError) => {
        console.error("Failed to clean up sandbox after execution start error", {
          executionId: execution.id,
          sandboxId: started?.sandboxId,
          error: killError,
        });
      });
    }
    // If sandbox creation failed before `started` was set, check for E2B rate
    // limit / transient errors and requeue instead of marking failed.
    if (!started && isSandboxBusyError(error)) {
      const infraAttempt = (execution.infra_attempt_count ?? 0) + 1;
      if (infraAttempt <= MAX_INFRA_ATTEMPTS) {
        await updateExecutionByLease(admin, execution, leaseToken, {
          infra_attempt_count: infraAttempt,
        }).catch(() => undefined);
        await scheduleNextPoll(
          admin,
          { ...execution, infra_attempt_count: infraAttempt },
          leaseToken,
          INFRA_RETRY_DELAY_SECONDS,
          baseUrl
        ).catch(() => undefined);
        return { status: 202, body: { ok: true, queued: "sandbox_busy_retry" } };
      }
    }
    await finalizeExecution(admin, execution, leaseToken, "failed", "App execution failed", null)
      .catch(() => undefined);
    return { status: 200, body: { ok: true, terminal: "failed" } };
  }
}

/**
 * Returns true for E2B errors that indicate the sandbox is temporarily busy
 * or rate-limited (transient infra conditions on E2B Free tier).
 * These should be retried via the queue, not treated as permanent failures.
 */
function isSandboxBusyError(error: unknown): boolean {
  const statusCode = (error as Record<string, unknown>)?.statusCode ?? (error as Record<string, unknown>)?.status;
  const message = String((error as Error)?.message ?? error ?? "");
  return (
    statusCode === 429 ||
    /rate.?limit|too many|sandbox.+(unavailable|busy|failed|boot)|429/i.test(message)
  );
}

/**
 * Reconcile the quota reservation made by the route when the execution
 * reaches a terminal state in the async worker.
 *
 * The route always reserves ceil(sandboxTimeoutMs() / 1000) seconds upfront.
 * This function reconciles to the actual elapsed seconds (or 0 if no sandbox
 * ran, e.g. sandbox_unavailable requeue).
 *
 * Safe to call with .catch(() => undefined) — quota reconcile failures must
 * never block execution finalization.
 */
async function reconcileQuotaUsage(
  admin: SupabaseClient,
  app: AppRow,
  execution: ExecutionRow,
  actualSeconds: number
) {
  const reservedSeconds = Math.ceil(sandboxTimeoutMs() / 1000);
  const safe = Math.max(0, Math.ceil(actualSeconds));
  await reconcileQuotaReservation(admin, app.id, reservedSeconds, safe);
}

/**
 * Reconcile quota for a single_file execution terminal in pollExecution.
 * Actual elapsed seconds are computed from execution.started_at to now.
 */
async function reconcileQuotaForPollTerminal(
  admin: SupabaseClient,
  app: AppRow,
  execution: ExecutionRow
) {
  const reservedSeconds = Math.ceil(sandboxTimeoutMs() / 1000);
  const actualSeconds = execution.started_at
    ? Math.max(1, Math.ceil((Date.now() - Date.parse(execution.started_at)) / 1000))
    : reservedSeconds;
  await reconcileQuotaReservation(admin, app.id, reservedSeconds, actualSeconds);
}

async function pollExecution(
  admin: SupabaseClient,
  execution: ExecutionRow,
  app: AppRow,
  version: VersionRow,
  leaseToken: string,
  baseUrl?: string
) {
  if (execution.started_at) {
    const elapsedMs = Date.now() - Date.parse(execution.started_at);
    if (Number.isFinite(elapsedMs) && elapsedMs >= executionTtlMs()) {
      await finalizeExecution(
        admin,
        execution,
        leaseToken,
        "timed_out",
        "Execution exceeded maximum execution time",
        null,
        { timed_out_at: new Date().toISOString() }
      );
      await killSandboxExecution(execution.sandbox_id, execution.sandbox_pid);
      return { status: 200, body: { ok: true, terminal: "timed_out" } };
    }
  }

  if (!execution.sandbox_id) {
    await finalizeExecution(admin, execution, leaseToken, "failed", "App execution failed", null);
    return { status: 200, body: { ok: true, terminal: "failed" } };
  }

  let pollResult;
  try {
    pollResult = await pollSandboxExecution({
      sandboxId: execution.sandbox_id,
      pid: execution.sandbox_pid,
      stdoutOffset: execution.stdout_offset,
      stderrOffset: execution.stderr_offset,
    });
  } catch {
    await finalizeExecution(admin, execution, leaseToken, "failed", "App execution failed", null);
    return { status: 200, body: { ok: true, terminal: "failed" } };
  }

  const eventInserts = await buildPollEventInserts(admin, execution, app, version, pollResult);

  const now = new Date().toISOString();
  if (pollResult.status === "running") {
    const pollCount = execution.poll_count + 1;
    const pollDelaySeconds = nextPollDelaySeconds({ ...execution, poll_count: pollCount });
    const nextPollAt = new Date(Date.now() + pollDelaySeconds * 1000).toISOString();
    await updateExecutionByLease(admin, execution, leaseToken, {
      progress: pollResult.progress ?? execution.progress,
      last_heartbeat_at: now,
      heartbeat_at: now,
      poll_count: pollCount,
      stdout_offset: pollResult.stdoutOffset,
      stderr_offset: pollResult.stderrOffset,
      next_poll_at: nextPollAt,
    });
    await insertExecutionEvents(admin, [
      ...eventInserts,
      { execution_id: execution.id, kind: "heartbeat", payload: { at: now } },
    ]);
    let messageId: string;
    try {
      messageId = await publishExecutionProcessMessage({
        executionId: execution.id,
        pollCount,
        delaySeconds: pollDelaySeconds,
        baseUrl,
      });
    } catch {
      await finalizeExecution(admin, execution, leaseToken, "failed", "App execution failed", null)
        .catch(() => undefined);
      await killSandboxExecution(execution.sandbox_id, execution.sandbox_pid);
      return { status: 200, body: { ok: true, terminal: "failed" } };
    }
    try {
      await updateExecutionByLease(admin, execution, leaseToken, {
        queue_message_id: messageId,
        lease_token: null,
        lease_expires_at: null,
        lease_until: null,
      });
    } catch (error) {
      if (error instanceof LeaseLostError) {
        return { status: 202, body: { ok: true, skipped: "lease_lost" } };
      }
      await finalizeExecution(admin, execution, leaseToken, "failed", "App execution failed", null)
        .catch(() => undefined);
      await killSandboxExecution(execution.sandbox_id, execution.sandbox_pid);
      return { status: 200, body: { ok: true, terminal: "failed" } };
    }
    return { status: 202, body: { ok: true, status: "running" } };
  }

  if (pollResult.status === "succeeded") {
    const validateOutput = ajv.compile(version.output_schema ?? {});
    const outputValid = validateOutput(pollResult.output ?? {});
    if (!outputValid) {
      await finalizeExecution(admin, execution, leaseToken, "failed", "Output validation failed", null, {
        progress: pollResult.progress ?? execution.progress,
        stdout_offset: pollResult.stdoutOffset,
        stderr_offset: pollResult.stderrOffset,
      });
      await insertExecutionEvents(admin, eventInserts);
      await killSandboxExecution(execution.sandbox_id, execution.sandbox_pid);
      return { status: 200, body: { ok: true, terminal: "failed" } };
    }

    const redactedOutput = redactSecretOutput(version.output_schema ?? {}, pollResult.output ?? {});
    const runtimeSecrets = await resolveRuntimeSecrets(
      admin,
      version.secrets ?? [],
      app.id,
      app.owner_id,
      execution.caller_user_id
    );
    const finalOutput = (!isAnonPerRunnerError(runtimeSecrets) && runtimeSecrets.ok)
      ? redactExactSecretValues(redactedOutput, Object.values(runtimeSecrets.envs))
      : redactedOutput;
    await finalizeExecution(admin, execution, leaseToken, "succeeded", null, finalOutput, {
      progress: pollResult.progress ?? execution.progress,
      stdout_offset: pollResult.stdoutOffset,
      stderr_offset: pollResult.stderrOffset,
    });
    await insertExecutionEvents(admin, eventInserts);
    await killSandboxExecution(execution.sandbox_id, execution.sandbox_pid);
    return { status: 200, body: { ok: true, terminal: "succeeded" } };
  }

  const terminalStatus = pollResult.status === "timed_out" ? "timed_out" : "failed";
  // Resolve runtime secrets so we can scrub them out of pollResult.error
  // before it lands in the public error field. The sandbox's stderr can
  // surface env-var values via tracebacks (e.g. dumping an HTTP error body
  // that included a leaked Authorization header).
  const errorRedactSecrets = await resolveRuntimeSecrets(
    admin,
    version.secrets ?? [],
    app.id,
    app.owner_id,
    execution.caller_user_id
  );
  const errorSecretValues = (!isAnonPerRunnerError(errorRedactSecrets) && errorRedactSecrets.ok)
    ? Object.values(errorRedactSecrets.envs)
    : [];
  await finalizeExecution(
    admin,
    execution,
    leaseToken,
    terminalStatus,
    pollResult.error ?? "App execution failed",
    null,
    {
      progress: pollResult.progress ?? execution.progress,
      stdout_offset: pollResult.stdoutOffset,
      stderr_offset: pollResult.stderrOffset,
      timed_out_at: terminalStatus === "timed_out" ? new Date().toISOString() : execution.timed_out_at,
    },
    errorSecretValues
  );
  await insertExecutionEvents(admin, eventInserts);
  await killSandboxExecution(execution.sandbox_id, execution.sandbox_pid);
  return { status: 200, body: { ok: true, terminal: terminalStatus } };
}

async function cancelExecution(admin: SupabaseClient, execution: ExecutionRow, leaseToken: string) {
  await finalizeExecution(admin, execution, leaseToken, "cancelled", "Execution was cancelled", null, {
    cancel_reason: execution.cancel_reason ?? "caller",
  });
  if (execution.sandbox_id) {
    await killSandboxExecution(execution.sandbox_id, execution.sandbox_pid);
  }
  await insertExecutionEvents(admin, [
    { execution_id: execution.id, kind: "system", payload: { code: "cancel_completed" } },
  ]);
}

async function finalizeExecution(
  admin: SupabaseClient,
  execution: ExecutionRow,
  leaseToken: string,
  status: "succeeded" | "failed" | "timed_out" | "cancelled",
  error: string | null,
  output: unknown | null,
  extra: Record<string, unknown> = {},
  secretValues: readonly string[] = []
) {
  const completedAt = new Date().toISOString();
  const publicError = error === null ? null : sanitizePublicError(error, undefined, secretValues);
  await updateExecutionByLease(admin, execution, leaseToken, {
    status,
    output,
    error: publicError,
    completed_at: completedAt,
    last_heartbeat_at: completedAt,
    heartbeat_at: completedAt,
    lease_token: null,
    lease_expires_at: null,
    lease_until: null,
    next_poll_at: null,
    ...extra,
  });
  await insertExecutionEvents(admin, [
    {
      execution_id: execution.id,
      kind: "status",
      payload: {
        status,
        error: publicError,
        completed_at: completedAt,
      },
    },
  ]);
}

async function scheduleNextPoll(
  admin: SupabaseClient,
  execution: ExecutionRow,
  leaseToken: string,
  delaySeconds: number,
  baseUrl?: string
) {
  const pollCount = execution.poll_count + 1;
  const nextPollAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
  await updateExecutionByLease(admin, execution, leaseToken, {
    poll_count: pollCount,
    next_poll_at: nextPollAt,
  });
  const messageId = await publishExecutionProcessMessage({
    executionId: execution.id,
    pollCount,
    delaySeconds,
    baseUrl,
  });
  await updateExecutionByLease(admin, execution, leaseToken, {
    queue_message_id: messageId,
    lease_token: null,
    lease_expires_at: null,
    lease_until: null,
  });
}

async function recoverOrTerminateStaleRunning(
  admin: SupabaseClient,
  execution: ExecutionRow,
  reason: "stale_heartbeat" | "ttl"
) {
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.now() + executionLeaseMs()).toISOString();
  const { data: claimedRows, error: claimError } = await admin.rpc("claim_execution_lease", {
    p_execution_id: execution.id,
    p_lease_token: leaseToken,
    p_lease_expires_at: leaseExpiresAt,
  });

  if (claimError) {
    return;
  }

  const claimed = Array.isArray(claimedRows) ? (claimedRows[0] as ExecutionRow | undefined) : null;
  if (!claimed || normalizeExecutionStatus(claimed.status) !== "running") {
    return;
  }

  const context = await loadExecutionContext(admin, claimed);
  if (!context.ok) {
    await finalizeExecution(admin, claimed, leaseToken, "failed", context.error, null)
      .catch(() => undefined);
    return;
  }

  if (claimed.sandbox_id) {
    const pollResult = await pollSandboxExecution({
      sandboxId: claimed.sandbox_id,
      pid: claimed.sandbox_pid,
      stdoutOffset: claimed.stdout_offset,
      stderrOffset: claimed.stderr_offset,
    }).catch(() => null);

    if (pollResult && pollResult.status !== "running") {
      // Sandbox completed (succeeded / failed / timed_out) — finalize.
      const eventInserts = await buildPollEventInserts(
        admin,
        claimed,
        context.app,
        context.version,
        pollResult
      );
      if (pollResult.status === "succeeded") {
        const validateOutput = ajv.compile(context.version.output_schema ?? {});
        const outputValid = validateOutput(pollResult.output ?? {});
        const runtimeSecrets = await resolveRuntimeSecrets(
          admin,
          context.version.secrets ?? [],
          context.app.id,
          context.app.owner_id,
          claimed.caller_user_id
        );
        const redactedOutput = redactSecretOutput(context.version.output_schema ?? {}, pollResult.output ?? {});
        const finalOutput = (!isAnonPerRunnerError(runtimeSecrets) && runtimeSecrets.ok)
          ? redactExactSecretValues(redactedOutput, Object.values(runtimeSecrets.envs))
          : redactedOutput;
        await finalizeExecution(
          admin,
          claimed,
          leaseToken,
          outputValid ? "succeeded" : "failed",
          outputValid ? null : "Output validation failed",
          outputValid ? finalOutput : null,
          {
            progress: pollResult.progress ?? claimed.progress,
            stdout_offset: pollResult.stdoutOffset,
            stderr_offset: pollResult.stderrOffset,
          }
        );
      } else {
        const terminalStatus = pollResult.status === "timed_out" ? "timed_out" : "failed";
        await finalizeExecution(
          admin,
          claimed,
          leaseToken,
          terminalStatus,
          pollResult.error ?? "App execution failed",
          null,
          {
            progress: pollResult.progress ?? claimed.progress,
            stdout_offset: pollResult.stdoutOffset,
            stderr_offset: pollResult.stderrOffset,
            timed_out_at: terminalStatus === "timed_out" ? new Date().toISOString() : claimed.timed_out_at,
          }
        );
      }
      await insertExecutionEvents(admin, eventInserts);
      await killSandboxExecution(claimed.sandbox_id, claimed.sandbox_pid);
      return;
    }

    // Sandbox is confirmed still running (pollResult.status === "running") OR
    // the E2B poll threw an unhandled error (pollResult === null).
    // In both cases: only terminate if the overall execution TTL has elapsed.
    // Otherwise refresh the heartbeat and reschedule — the sandbox is alive.
    const elapsedMs = claimed.started_at ? Date.now() - Date.parse(claimed.started_at) : Infinity;
    const ttlElapsed = !Number.isFinite(elapsedMs) || elapsedMs >= executionTtlMs();

    if (pollResult?.status === "running" && !ttlElapsed) {
      // Sandbox is alive and within TTL — the sweep fired due to a transient
      // QStash delay or a slow Vercel cold-start. Refresh heartbeat and
      // reschedule a poll so the execution continues normally.
      const now = new Date().toISOString();
      const pollCount = claimed.poll_count + 1;
      const pollDelaySeconds = nextPollDelaySeconds({ ...claimed, poll_count: pollCount });
      const nextPollAt = new Date(Date.now() + pollDelaySeconds * 1000).toISOString();
      await updateExecutionByLease(admin, claimed, leaseToken, {
        last_heartbeat_at: now,
        heartbeat_at: now,
        poll_count: pollCount,
        stdout_offset: pollResult.stdoutOffset,
        stderr_offset: pollResult.stderrOffset,
        next_poll_at: nextPollAt,
        progress: pollResult.progress ?? claimed.progress,
      });
      const messageId = await publishExecutionProcessMessage({
        executionId: claimed.id,
        pollCount,
        delaySeconds: pollDelaySeconds,
      });
      await updateExecutionByLease(admin, claimed, leaseToken, {
        queue_message_id: messageId,
        lease_token: null,
        lease_expires_at: null,
        lease_until: null,
      });
      return;
    }
    // pollResult === null (E2B error) and not past TTL: fall through to terminate below.
    // This is safer than rescheduling when we can't confirm the sandbox is healthy.
  }

  // Either: no sandbox_id, E2B poll failed (null), or TTL elapsed.
  // Terminate and finalize.
  await killSandboxExecution(claimed.sandbox_id, claimed.sandbox_pid);
  const elapsedMs = claimed.started_at ? Date.now() - Date.parse(claimed.started_at) : Infinity;
  const terminalMsg =
    reason === "ttl" || !Number.isFinite(elapsedMs) || elapsedMs >= executionTtlMs()
      ? "Execution exceeded maximum execution time"
      : "Execution exceeded SANDBOX_TIMEOUT_MS";
  await finalizeExecution(admin, claimed, leaseToken, "timed_out", terminalMsg, null, {
    timed_out_at: new Date().toISOString(),
  }).catch(() => undefined);
}

async function forceFinalizeExecution(
  admin: SupabaseClient,
  execution: ExecutionRow,
  status: "succeeded" | "failed" | "timed_out" | "cancelled",
  error: string | null,
  output: unknown | null,
  extra: Record<string, unknown> = {},
  secretValues: readonly string[] = []
) {
  const completedAt = new Date().toISOString();
  const publicError = error === null ? null : sanitizePublicError(error, undefined, secretValues);
  const originalStatus = execution.status;
  const originalLeaseToken = execution.lease_token;
  let updateQuery = admin
    .from("executions")
    .update({
      status,
      output,
      error: publicError,
      completed_at: completedAt,
      last_heartbeat_at: completedAt,
      heartbeat_at: completedAt,
      lease_token: null,
      lease_expires_at: null,
      lease_until: null,
      next_poll_at: null,
      ...extra,
    })
    .eq("id", execution.id)
    .eq("status", originalStatus);

  updateQuery = originalLeaseToken === null
    ? updateQuery.is("lease_token", null)
    : updateQuery.eq("lease_token", originalLeaseToken);

  const { data, error: updateError } = await updateQuery
    .select("*")
    .maybeSingle<ExecutionRow>();

  if (updateError || !data) {
    return;
  }

  await insertExecutionEvents(admin, [
    {
      execution_id: execution.id,
      kind: "status",
      payload: { status, error: publicError, completed_at: completedAt },
    },
  ]).catch(() => undefined);
}

async function updateExecutionByLease(
  admin: SupabaseClient,
  execution: ExecutionRow,
  leaseToken: string,
  values: Record<string, unknown>
) {
  const { data, error } = await admin
    .from("executions")
    .update(values)
    .eq("id", execution.id)
    .eq("lease_token", leaseToken)
    .gt("lease_expires_at", new Date().toISOString())
    .in("status", ["queued", "running"])
    .select("*")
    .maybeSingle<ExecutionRow>();

  if (error) {
    throw new WorkerMutationError("Failed to update execution");
  }
  if (!data) {
    throw new LeaseLostError();
  }
  return data;
}

async function insertExecutionEvents(admin: SupabaseClient, events: ExecutionEventInsert[]) {
  if (events.length === 0) {
    return;
  }

  const { error } = await admin.from("execution_events").insert(events);
  if (error) {
    throw new WorkerMutationError("Failed to append execution event");
  }
}

async function buildPollEventInserts(
  admin: SupabaseClient,
  execution: ExecutionRow,
  app: AppRow,
  version: VersionRow,
  pollResult: Awaited<ReturnType<typeof pollSandboxExecution>>
) {
  const eventInserts: ExecutionEventInsert[] = [];
  const runtimeSecrets = await resolveRuntimeSecrets(
    admin,
    version.secrets ?? [],
    app.id,
    app.owner_id,
    execution.caller_user_id
  );
  const secretValues = (!isAnonPerRunnerError(runtimeSecrets) && runtimeSecrets.ok) ? Object.values(runtimeSecrets.envs) : null;

  if (pollResult.stdoutChunk && secretValues) {
    eventInserts.push({
      execution_id: execution.id,
      kind: "stdout",
      payload: { chunk: redactLogChunk(pollResult.stdoutChunk, secretValues) },
    });
  }
  if (pollResult.stderrChunk && secretValues) {
    eventInserts.push({
      execution_id: execution.id,
      kind: "stderr",
      payload: { chunk: redactLogChunk(pollResult.stderrChunk, secretValues) },
    });
  }
  if (pollResult.progress && JSON.stringify(pollResult.progress) !== JSON.stringify(execution.progress)) {
    eventInserts.push({
      execution_id: execution.id,
      kind: "progress",
      payload: { progress: pollResult.progress },
    });
  }

  return eventInserts;
}

export function redactLogChunk(chunk: string, secretValues: string[]) {
  const redacted = redactExactSecretValues(chunk, secretValues);
  return typeof redacted === "string" ? redacted : "";
}

async function loadExecutionContext(admin: SupabaseClient, execution: ExecutionRow) {
  const { data: app, error: appError } = await admin
    .from("apps")
    .select("id, owner_id, slug, public, runtime, entrypoint, handler, max_concurrency")
    .eq("id", execution.app_id)
    .maybeSingle<AppRow>();
  if (appError || !app) {
    return { ok: false as const, error: "App execution failed" };
  }

  const versionQuery = admin
    .from("app_versions")
    .select("id, app_id, bundle_path, bundle_kind, command, input_schema, output_schema, dependencies, secrets, composio")
    .eq("app_id", app.id);
  const { data: version, error: versionError } = execution.version_id
    ? await versionQuery.eq("id", execution.version_id).maybeSingle<VersionRow>()
    : await versionQuery.order("version", { ascending: false }).limit(1).maybeSingle<VersionRow>();

  if (versionError || !version) {
    return { ok: false as const, error: "App execution failed" };
  }

  return { ok: true as const, app, version };
}

async function loadBundle(
  admin: SupabaseClient,
  bundlePath: string,
  bundleKind: "single_file" | "tarball"
) {
  const { data, error } = await admin.storage.from("app-bundles").download(bundlePath);
  if (error || !data) {
    return { ok: false as const, error: "Failed to download app bundle" };
  }

  if (bundleKind === "tarball") {
    const buffer = Buffer.from(await data.arrayBuffer());
    if (buffer.byteLength > MAX_BUNDLE_BYTES) {
      return { ok: false as const, error: "App bundle is too large" };
    }
    return { ok: true as const, buffer };
  }

  const source = await data.text();
  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    return { ok: false as const, error: "App source is too large" };
  }

  return { ok: true as const, source };
}

export async function executionSnapshotAfterWait(
  admin: SupabaseClient,
  executionId: string,
  budgetMs: number
) {
  const deadline = Date.now() + budgetMs;
  let last: ExecutionRow | null = null;
  while (Date.now() < deadline) {
    const { data } = await admin
      .from("executions")
      .select("*")
      .eq("id", executionId)
      .maybeSingle<ExecutionRow>();
    if (data) {
      last = data;
      if (isTerminalExecutionStatus(data.status)) {
        return { terminal: true, snapshot: formatExecutionSnapshot(data) };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!last) {
    return null;
  }

  return { terminal: false, snapshot: formatExecutionSnapshot(last) };
}

// ── Decoupled sandbox poller (Option B) ──────────────────────────────────────
//
// Called from /api/internal/executions/poll-sandboxes (cron, every ~30s).
// Only active when FLOOM_DECOUPLED_SANDBOX=enabled.
//
// For each running execution with a sandbox_id that hasn't been polled
// recently, reconnect to E2B, check status, finalize or bump last_polled_at.
// Concurrency protection: use the existing lease mechanism so two cron
// invocations that overlap don't both finalize the same execution.

export async function pollInFlightSandboxes(
  admin: SupabaseClient
): Promise<{ polled: number; finalized: number; errors: number }> {
  const staleThreshold = new Date(Date.now() - 30_000).toISOString();

  // Fetch running executions with a sandbox_id that haven't been polled in
  // the last 30 s (or have never been polled).  Limit 50 per cron tick.
  const { data: candidates } = await admin
    .from("executions")
    .select("*")
    .eq("status", "running")
    .not("sandbox_id", "is", null)
    .or(`last_polled_at.is.null,last_polled_at.lt.${staleThreshold}`)
    .order("last_polled_at", { ascending: true, nullsFirst: true })
    .limit(50)
    .returns<ExecutionRow[]>();

  if (!candidates || candidates.length === 0) {
    return { polled: 0, finalized: 0, errors: 0 };
  }

  let finalized = 0;
  let errors = 0;

  for (const execution of candidates) {
    try {
      const result = await pollOneInFlightSandbox(admin, execution);
      if (result === "finalized") {
        finalized++;
      }
    } catch {
      errors++;
    }
  }

  return { polled: candidates.length, finalized, errors };
}

async function pollOneInFlightSandbox(
  admin: SupabaseClient,
  execution: ExecutionRow
): Promise<"finalized" | "still_running" | "skipped"> {
  // Claim a short lease to prevent concurrent poll routes from double-finalizing.
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.now() + executionLeaseMs()).toISOString();
  const { data: claimedRows, error: claimError } = await admin.rpc("claim_execution_lease", {
    p_execution_id: execution.id,
    p_lease_token: leaseToken,
    p_lease_expires_at: leaseExpiresAt,
  });

  if (claimError) {
    return "skipped";
  }

  const claimed = Array.isArray(claimedRows) ? (claimedRows[0] as ExecutionRow | undefined) : null;
  if (!claimed) {
    // Lease already held by another worker (e.g., a concurrent QStash process message).
    return "skipped";
  }

  if (isTerminalExecutionStatus(claimed.status)) {
    return "skipped";
  }

  if (!claimed.sandbox_id) {
    return "skipped";
  }

  // Check cancel before polling.
  if (claimed.cancel_requested_at) {
    await cancelExecutionInPoller(admin, claimed, leaseToken);
    return "finalized";
  }

  // Enforce execution TTL as the hard-kill backstop in the poller.
  // We use executionTtlMs() (default 850 s) rather than sandboxTimeoutMs()
  // (250 s) because the E2B sandbox is now created with the full TTL budget.
  // Using the shorter sandboxTimeoutMs() here would kill jobs at 250 s even
  // though the sandbox itself is alive and running.
  if (claimed.started_at) {
    const elapsedMs = Date.now() - Date.parse(claimed.started_at);
    if (Number.isFinite(elapsedMs) && elapsedMs >= executionTtlMs()) {
      await finalizeExecutionInPoller(
        admin,
        claimed,
        leaseToken,
        "timed_out",
        "Execution exceeded maximum execution time",
        null,
        { timed_out_at: new Date().toISOString() }
      );
      await killSandboxExecution(claimed.sandbox_id, claimed.sandbox_pid);
      return "finalized";
    }
  }

  let pollResult: Awaited<ReturnType<typeof pollSandboxExecution>>;
  try {
    pollResult = await pollSandboxExecution({
      sandboxId: claimed.sandbox_id,
      pid: claimed.sandbox_pid,
      stdoutOffset: claimed.stdout_offset,
      stderrOffset: claimed.stderr_offset,
    });
  } catch {
    await finalizeExecutionInPoller(admin, claimed, leaseToken, "failed", "App execution failed", null);
    return "finalized";
  }

  const now = new Date().toISOString();

  if (pollResult.status === "running") {
    // Still running — bump last_polled_at and release lease.
    await updateExecutionInPoller(admin, claimed, leaseToken, {
      last_polled_at: now,
      last_heartbeat_at: now,
      heartbeat_at: now,
      progress: pollResult.progress ?? claimed.progress,
      stdout_offset: pollResult.stdoutOffset,
      stderr_offset: pollResult.stderrOffset,
      lease_token: null,
      lease_expires_at: null,
      lease_until: null,
    });
    return "still_running";
  }

  const context = await loadExecutionContext(admin, claimed);

  if (pollResult.status === "succeeded") {
    if (!context.ok) {
      await finalizeExecutionInPoller(admin, claimed, leaseToken, "failed", context.error, null, {
        last_polled_at: now,
        stdout_offset: pollResult.stdoutOffset,
        stderr_offset: pollResult.stderrOffset,
      });
      await killSandboxExecution(claimed.sandbox_id, claimed.sandbox_pid);
      return "finalized";
    }

    const validateOutput = ajv.compile(context.version.output_schema ?? {});
    const outputValid = validateOutput(pollResult.output ?? {});
    if (!outputValid) {
      await finalizeExecutionInPoller(admin, claimed, leaseToken, "failed", "Output validation failed", null, {
        last_polled_at: now,
        progress: pollResult.progress ?? claimed.progress,
        stdout_offset: pollResult.stdoutOffset,
        stderr_offset: pollResult.stderrOffset,
      });
      await killSandboxExecution(claimed.sandbox_id, claimed.sandbox_pid);
      return "finalized";
    }

    const redactedOutput = redactSecretOutput(context.version.output_schema ?? {}, pollResult.output ?? {});
    const runtimeSecrets = await resolveRuntimeSecrets(
      admin,
      context.version.secrets ?? [],
      context.app.id,
      context.app.owner_id
    );
    const finalOutput = runtimeSecrets.ok
      ? redactExactSecretValues(redactedOutput, Object.values(runtimeSecrets.envs))
      : redactedOutput;

    await finalizeExecutionInPoller(admin, claimed, leaseToken, "succeeded", null, finalOutput, {
      last_polled_at: now,
      progress: pollResult.progress ?? claimed.progress,
      stdout_offset: pollResult.stdoutOffset,
      stderr_offset: pollResult.stderrOffset,
    });
    await killSandboxExecution(claimed.sandbox_id, claimed.sandbox_pid);
    return "finalized";
  }

  // failed or timed_out
  const terminalStatus = pollResult.status === "timed_out" ? "timed_out" : "failed";
  let errorSecretValues: string[] = [];
  if (context.ok) {
    const errorRedactSecrets = await resolveRuntimeSecrets(
      admin,
      context.version.secrets ?? [],
      context.app.id,
      context.app.owner_id
    );
    errorSecretValues = errorRedactSecrets.ok ? Object.values(errorRedactSecrets.envs) : [];
  }

  await finalizeExecutionInPoller(
    admin,
    claimed,
    leaseToken,
    terminalStatus,
    pollResult.error ?? "App execution failed",
    null,
    {
      last_polled_at: now,
      progress: pollResult.progress ?? claimed.progress,
      stdout_offset: pollResult.stdoutOffset,
      stderr_offset: pollResult.stderrOffset,
      timed_out_at: terminalStatus === "timed_out" ? now : claimed.timed_out_at,
    },
    errorSecretValues
  );
  await killSandboxExecution(claimed.sandbox_id, claimed.sandbox_pid);
  return "finalized";
}

async function finalizeExecutionInPoller(
  admin: SupabaseClient,
  execution: ExecutionRow,
  leaseToken: string,
  status: "succeeded" | "failed" | "timed_out" | "cancelled",
  error: string | null,
  output: unknown | null,
  extra: Record<string, unknown> = {},
  secretValues: readonly string[] = []
) {
  const completedAt = new Date().toISOString();
  const publicError = error === null ? null : sanitizePublicError(error, undefined, secretValues);
  await updateExecutionInPoller(admin, execution, leaseToken, {
    status,
    output,
    error: publicError,
    completed_at: completedAt,
    last_heartbeat_at: completedAt,
    heartbeat_at: completedAt,
    lease_token: null,
    lease_expires_at: null,
    lease_until: null,
    next_poll_at: null,
    ...extra,
  });

  await admin.from("execution_events").insert({
    execution_id: execution.id,
    kind: "status",
    payload: {
      status,
      error: publicError,
      completed_at: completedAt,
    },
  });
}

async function cancelExecutionInPoller(
  admin: SupabaseClient,
  execution: ExecutionRow,
  leaseToken: string
) {
  await finalizeExecutionInPoller(admin, execution, leaseToken, "cancelled", "Execution was cancelled", null, {
    cancel_reason: execution.cancel_reason ?? "caller",
  });
  if (execution.sandbox_id) {
    await killSandboxExecution(execution.sandbox_id, execution.sandbox_pid);
  }
  await admin.from("execution_events").insert({
    execution_id: execution.id,
    kind: "system",
    payload: { code: "cancel_completed" },
  });
}

async function updateExecutionInPoller(
  admin: SupabaseClient,
  execution: ExecutionRow,
  leaseToken: string,
  values: Record<string, unknown>
) {
  const { data, error } = await admin
    .from("executions")
    .update(values)
    .eq("id", execution.id)
    .eq("lease_token", leaseToken)
    .gt("lease_expires_at", new Date().toISOString())
    .in("status", ["queued", "running"])
    .select("id")
    .maybeSingle();

  if (error || !data) {
    // Lease lost — another worker already handled this execution.
    return null;
  }
  return data;
}
