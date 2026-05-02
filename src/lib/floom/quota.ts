import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_APP_E2B_SECONDS_PER_DAY,
  DEFAULT_OWNER_E2B_SECONDS_PER_DAY,
} from "./limits";

export type QuotaCheckResult =
  | { allowed: true }
  | { allowed: false; retryAfterUnix: number; reason: "exhausted" | "unavailable" };

export async function checkDailyQuota(
  admin: SupabaseClient,
  appId: string,
  ownerId: string
): Promise<QuotaCheckResult> {
  const windowStart = currentUtcDate();
  const [appUsageResult, ownerUsageResult] = await Promise.all([
    admin
      .from("app_quota_usage")
      .select("e2b_seconds_consumed")
      .eq("app_id", appId)
      .eq("window_start", windowStart)
      .maybeSingle(),
    admin
      .from("app_quota_usage")
      .select("e2b_seconds_consumed, apps!inner(owner_id)")
      .eq("window_start", windowStart)
      .eq("apps.owner_id", ownerId),
  ]);

  const retryAfterUnix = nextUtcMidnightUnix();

  if (appUsageResult.error || ownerUsageResult.error) {
    return { allowed: false, retryAfterUnix, reason: "unavailable" };
  }

  const appConsumed = Number(appUsageResult.data?.e2b_seconds_consumed ?? 0);
  const ownerConsumed = (ownerUsageResult.data ?? []).reduce(
    (total, row) => total + Number(row.e2b_seconds_consumed ?? 0),
    0
  );

  if (appConsumed >= readPositiveIntegerEnv("FLOOM_APP_E2B_SECONDS_PER_DAY", DEFAULT_APP_E2B_SECONDS_PER_DAY)) {
    return { allowed: false, retryAfterUnix, reason: "exhausted" };
  }

  if (
    ownerConsumed >=
    readPositiveIntegerEnv("FLOOM_OWNER_E2B_SECONDS_PER_DAY", DEFAULT_OWNER_E2B_SECONDS_PER_DAY)
  ) {
    return { allowed: false, retryAfterUnix, reason: "exhausted" };
  }

  return { allowed: true };
}

export async function recordQuotaUsage(
  admin: SupabaseClient,
  appId: string,
  elapsedSeconds: number
) {
  const windowStart = currentUtcDate();
  const safeSeconds = Math.max(0, Math.ceil(elapsedSeconds));

  if (safeSeconds > 0) {
    const { data } = await admin
      .from("app_quota_usage")
      .select("e2b_seconds_consumed")
      .eq("app_id", appId)
      .eq("window_start", windowStart)
      .maybeSingle();

    const nextValue = Number(data?.e2b_seconds_consumed ?? 0) + safeSeconds;

    await admin.from("app_quota_usage").upsert(
      {
        app_id: appId,
        window_start: windowStart,
        e2b_seconds_consumed: nextValue,
      },
      { onConflict: "app_id,window_start" }
    );
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  await admin.from("app_quota_usage").delete().lt("window_start", cutoff.toISOString().slice(0, 10));
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
