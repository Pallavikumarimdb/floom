import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_APP_E2B_SECONDS_PER_DAY,
  DEFAULT_OWNER_E2B_SECONDS_PER_DAY,
} from "./limits";

export type QuotaCheckResult =
  | { allowed: true; reservedSeconds: number }
  | { allowed: false; retryAfterUnix: number; reason: "exhausted" | "unavailable" };

type QuotaRpcRow = {
  allowed?: boolean;
  reason?: string | null;
  e2b_seconds_consumed?: number | string | null;
  owner_e2b_seconds_consumed?: number | string | null;
};

export async function reserveDailyQuota(
  admin: SupabaseClient,
  appId: string,
  ownerId: string,
  reserveSeconds: number
): Promise<QuotaCheckResult> {
  const retryAfterUnix = nextUtcMidnightUnix();
  const safeSeconds = Math.max(1, Math.ceil(reserveSeconds));
  const { data, error } = await admin.rpc("floom_reserve_app_quota_usage", {
    p_app_id: appId,
    p_owner_id: ownerId,
    p_seconds: safeSeconds,
    p_app_limit: readPositiveIntegerEnv("FLOOM_APP_E2B_SECONDS_PER_DAY", DEFAULT_APP_E2B_SECONDS_PER_DAY),
    p_owner_limit: readPositiveIntegerEnv("FLOOM_OWNER_E2B_SECONDS_PER_DAY", DEFAULT_OWNER_E2B_SECONDS_PER_DAY),
    p_window_start: currentUtcDate(),
  });

  if (error) {
    return { allowed: false, retryAfterUnix, reason: "unavailable" };
  }

  const row = Array.isArray(data) ? data[0] as QuotaRpcRow | undefined : data as QuotaRpcRow | undefined;
  if (!row) {
    return { allowed: false, retryAfterUnix, reason: "unavailable" };
  }

  if (!row.allowed) {
    return { allowed: false, retryAfterUnix, reason: "exhausted" };
  }

  return { allowed: true, reservedSeconds: safeSeconds };
}

export async function recordQuotaUsage(
  admin: SupabaseClient,
  appId: string,
  elapsedSeconds: number
): Promise<{ ok: true; consumedSeconds: number } | { ok: false; reason: "unavailable" }> {
  const windowStart = currentUtcDate();
  const safeSeconds = Math.max(0, Math.ceil(elapsedSeconds));

  if (safeSeconds > 0) {
    const result = await adjustQuotaUsage(admin, appId, safeSeconds, windowStart);
    if (!result.ok) {
      return result;
    }
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const { error: cleanupError } = await admin
    .from("app_quota_usage")
    .delete()
    .lt("window_start", cutoff.toISOString().slice(0, 10));

  if (cleanupError) {
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, consumedSeconds: safeSeconds };
}

export async function reconcileQuotaReservation(
  admin: SupabaseClient,
  appId: string,
  reservedSeconds: number,
  actualSeconds: number
): Promise<{ ok: true; consumedSeconds: number } | { ok: false; reason: "unavailable" }> {
  const reserved = Math.max(0, Math.ceil(reservedSeconds));
  const actual = Math.max(1, Math.ceil(actualSeconds));
  const delta = actual - reserved;
  if (delta === 0) {
    return { ok: true, consumedSeconds: actual };
  }

  const result = await adjustQuotaUsage(admin, appId, delta, currentUtcDate());
  if (!result.ok) {
    return result;
  }

  return { ok: true, consumedSeconds: actual };
}

async function adjustQuotaUsage(
  admin: SupabaseClient,
  appId: string,
  secondsDelta: number,
  windowStart: string
): Promise<{ ok: true; consumedSeconds: number } | { ok: false; reason: "unavailable" }> {
  const { data, error } = await admin.rpc("floom_adjust_app_quota_usage", {
    p_app_id: appId,
    p_seconds_delta: secondsDelta,
    p_window_start: windowStart,
  });

  if (error) {
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, consumedSeconds: Number(data ?? 0) };
}

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function nextUtcMidnightUnix() {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return Math.floor(next.getTime() / 1000);
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
