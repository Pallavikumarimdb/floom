import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SANDBOX_TIMEOUT_MS } from "@/lib/floom/limits";
import { callerHasScope, getBearerToken, resolveAuthCaller, type AuthCaller } from "@/lib/supabase/auth";

export const EXECUTION_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const TERMINAL_EXECUTION_STATUSES = new Set<ExecutionStatus>([
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
]);

export type ExecutionSnapshot = {
  execution_id: string;
  status: ExecutionStatus;
  output: unknown | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  progress?: unknown | null;
};

export type ExecutionRow = {
  id: string;
  app_id: string;
  version_id: string | null;
  caller_user_id: string | null;
  caller_agent_token_id: string | null;
  input: Record<string, unknown>;
  output: unknown | null;
  status: string;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  progress: unknown | null;
  last_heartbeat_at: string | null;
  heartbeat_at?: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
  lease_until?: string | null;
  cancel_requested_at: string | null;
  cancel_reason: string | null;
  timed_out_at: string | null;
  sandbox_id: string | null;
  sandbox_pid: number | null;
  poll_count: number;
  infra_attempt_count: number;
  next_poll_at: string | null;
  queue_message_id?: string | null;
  stdout_offset: number;
  stderr_offset: number;
};

export type AppVisibilityRow = {
  id: string;
  slug: string;
  public: boolean;
  owner_id: string;
  max_concurrency?: number | null;
};

export type ExecutionAuthResult =
  | { ok: true; caller: AuthCaller | null; app: AppVisibilityRow; execution: ExecutionRow }
  | { ok: false; status: number; body: { error: string } };

export function isAsyncRuntimeEnabled() {
  return process.env.FLOOM_ASYNC_RUNTIME === "enabled";
}

export function normalizeExecutionStatus(status: string): ExecutionStatus {
  if (status === "success") {
    return "succeeded";
  }
  if (status === "error") {
    return "failed";
  }
  if (status === "timeout") {
    return "timed_out";
  }
  if ((EXECUTION_STATUSES as readonly string[]).includes(status)) {
    return status as ExecutionStatus;
  }
  return "failed";
}

export function isTerminalExecutionStatus(status: string) {
  return TERMINAL_EXECUTION_STATUSES.has(normalizeExecutionStatus(status));
}

export function formatExecutionSnapshot(row: ExecutionRow): ExecutionSnapshot {
  const status = normalizeExecutionStatus(row.status);
  return {
    execution_id: row.id,
    status,
    output: status === "succeeded" ? row.output ?? null : null,
    error: row.error ?? (status === "cancelled" ? "Execution was cancelled" : null),
    started_at: row.started_at,
    completed_at: row.completed_at,
    progress: row.progress ?? null,
  };
}

const REDACTED_SECRET_PLACEHOLDER = "[redacted]";

export function sanitizePublicError(
  error: unknown,
  fallback = "App execution failed",
  secretValues: readonly string[] = []
) {
  if (typeof error !== "string") {
    return fallback;
  }
  const trimmed = error.trim();
  if (!trimmed) {
    return fallback;
  }
  const redacted = redactSecretsInString(trimmed, secretValues);
  return redacted.slice(0, 500);
}

function redactSecretsInString(value: string, secretValues: readonly string[]): string {
  let result = value;
  for (const secret of secretValues) {
    if (typeof secret !== "string" || secret.length < 6) {
      // Skip empty/too-short candidates; redacting them would obliterate
      // common substrings and yield useless errors.
      continue;
    }
    if (!result.includes(secret)) continue;
    result = result.split(secret).join(REDACTED_SECRET_PLACEHOLDER);
  }
  return result;
}

export function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function readBooleanEnv(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "enabled", "yes"].includes(value.toLowerCase());
}

export function executionLeaseMs() {
  return readPositiveIntegerEnv("FLOOM_EXECUTION_LEASE_MS", 90_000);
}

export function queueTtlMs() {
  return readPositiveIntegerEnv("FLOOM_EXECUTION_QUEUE_TTL_MS", 900_000);
}

export function executionTtlMs() {
  return readPositiveIntegerEnv("FLOOM_EXECUTION_TTL_MS", sandboxTimeoutMs() + 600_000);
}

export function staleRunningMs() {
  return readPositiveIntegerEnv("FLOOM_EXECUTION_STALE_RUNNING_MS", 90_000);
}

export function sandboxTimeoutMs() {
  return readPositiveIntegerEnv("SANDBOX_TIMEOUT_MS", SANDBOX_TIMEOUT_MS);
}

export function appConcurrencySoftLimit(app: AppVisibilityRow | null | undefined) {
  const appLimit = Number(app?.max_concurrency);
  if (Number.isInteger(appLimit) && appLimit > 0) {
    return appLimit;
  }
  return readPositiveIntegerEnv("FLOOM_APP_CONCURRENCY_SOFT_LIMIT", 10);
}

export function appQueueMax() {
  return readPositiveIntegerEnv("FLOOM_APP_QUEUE_MAX", 100);
}

export function syncWaitBudgetMs() {
  const planBudget = readPositiveIntegerEnv("FLOOM_SYNC_WAIT_BUDGET_MS", 250_000);
  return Math.min(planBudget, sandboxTimeoutMs());
}

export function nextPollDelaySeconds(row: Pick<ExecutionRow, "started_at" | "created_at" | "poll_count">) {
  const started = row.started_at ? Date.parse(row.started_at) : Date.parse(row.created_at);
  const elapsedMs = Number.isFinite(started) ? Date.now() - started : 0;
  if (elapsedMs < 30_000) {
    return Math.ceil(readPositiveIntegerEnv("FLOOM_EXECUTION_POLL_FAST_MS", 3_000) / 1000);
  }
  if (elapsedMs < 300_000) {
    return Math.ceil(readPositiveIntegerEnv("FLOOM_EXECUTION_POLL_MEDIUM_MS", 5_000) / 1000);
  }
  if (elapsedMs < 1_800_000) {
    return Math.ceil(readPositiveIntegerEnv("FLOOM_EXECUTION_POLL_SLOW_MS", 15_000) / 1000);
  }
  return Math.ceil(readPositiveIntegerEnv("FLOOM_EXECUTION_POLL_VERY_SLOW_MS", 30_000) / 1000);
}

export async function authorizeExecutionRead(
  req: NextRequest,
  admin: SupabaseClient,
  executionId: string
): Promise<ExecutionAuthResult> {
  return authorizeExecutionAccess(req, admin, executionId, "read");
}

export async function authorizeExecutionCancel(
  req: NextRequest,
  admin: SupabaseClient,
  executionId: string
): Promise<ExecutionAuthResult> {
  return authorizeExecutionAccess(req, admin, executionId, "cancel");
}

async function authorizeExecutionAccess(
  req: NextRequest,
  admin: SupabaseClient,
  executionId: string,
  mode: "read" | "cancel"
): Promise<ExecutionAuthResult> {
  const bearerToken = getBearerToken(req);
  const caller = await resolveAuthCaller(req, admin);
  if (bearerToken && !caller) {
    return { ok: false, status: 401, body: { error: "Unauthorized" } };
  }

  const { data: execution, error: executionError } = await admin
    .from("executions")
    .select("*")
    .eq("id", executionId)
    .maybeSingle<ExecutionRow>();

  if (executionError) {
    return { ok: false, status: 500, body: { error: "Failed to load execution" } };
  }

  if (!execution) {
    return { ok: false, status: 404, body: { error: "Execution not found" } };
  }

  const { data: app, error: appError } = await admin
    .from("apps")
    .select("id, slug, public, owner_id, max_concurrency")
    .eq("id", execution.app_id)
    .maybeSingle<AppVisibilityRow>();

  if (appError) {
    return { ok: false, status: 500, body: { error: "Failed to load app" } };
  }

  if (!app) {
    return { ok: false, status: 404, body: { error: "Execution not found" } };
  }

  if (mode === "read" && app.public) {
    return { ok: true, caller, app, execution };
  }

  const ownerCaller = caller?.userId === app.owner_id;
  const hasOwnerReadOrRun =
    ownerCaller && (callerHasScope(caller, "read") || callerHasScope(caller, "run"));

  if (mode === "read" && hasOwnerReadOrRun) {
    return { ok: true, caller, app, execution };
  }

  if (mode === "cancel" && ownerCaller && callerHasScope(caller, "run")) {
    return { ok: true, caller, app, execution };
  }

  return { ok: false, status: 404, body: { error: "Execution not found" } };
}

export async function appendExecutionEvent(
  admin: SupabaseClient,
  executionId: string,
  kind: "status" | "progress" | "stdout" | "stderr" | "heartbeat" | "system",
  payload: Record<string, unknown> | null = null
) {
  await admin.from("execution_events").insert({
    execution_id: executionId,
    kind,
    payload,
  });
}

export async function loadExecutionSnapshot(
  admin: SupabaseClient,
  executionId: string
) {
  const { data, error } = await admin
    .from("executions")
    .select("*")
    .eq("id", executionId)
    .maybeSingle<ExecutionRow>();

  if (error || !data) {
    return null;
  }

  return formatExecutionSnapshot(data);
}
