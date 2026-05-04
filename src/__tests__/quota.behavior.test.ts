/**
 * Behavior tests for quota.ts
 *
 * Tests the actual logic of reserveDailyQuota, recordQuotaUsage, and
 * reconcileQuotaReservation by mocking the Supabase RPC layer at the
 * boundary — not by grepping source files.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  reserveDailyQuota,
  recordQuotaUsage,
  reconcileQuotaReservation,
} from "@/lib/floom/quota";
import {
  DEFAULT_APP_E2B_SECONDS_PER_DAY,
  DEFAULT_OWNER_E2B_SECONDS_PER_DAY,
} from "@/lib/floom/limits";

// ── Supabase mock helpers ────────────────────────────────────────────────────

type RpcResponse = { data: unknown; error: { message: string } | null };
type DbResponse = { data: unknown; error: { message: string } | null };

function buildAdmin(overrides: {
  rpcResponse?: RpcResponse;
  deleteResponse?: DbResponse;
  adjustResponse?: RpcResponse;
}): SupabaseClient {
  const rpcFn = vi.fn().mockResolvedValue(overrides.rpcResponse ?? { data: null, error: null });

  // If we need different responses per rpc name, the caller passes a mock fn directly.
  const deleteBuilder = {
    lt: vi.fn().mockResolvedValue(overrides.deleteResponse ?? { data: null, error: null }),
  };

  return {
    rpc: rpcFn,
    from: vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue(deleteBuilder),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
      }),
    }),
  } as unknown as SupabaseClient;
}

// ── reserveDailyQuota ────────────────────────────────────────────────────────

describe("reserveDailyQuota", () => {
  it("returns allowed=true when RPC says allowed", async () => {
    const admin = buildAdmin({
      rpcResponse: {
        data: [{ allowed: true, e2b_seconds_consumed: 60, owner_e2b_seconds_consumed: 60 }],
        error: null,
      },
    });
    const result = await reserveDailyQuota(admin, "app-1", "owner-1", 30);
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.reservedSeconds).toBe(30);
    }
  });

  it("clamps reserveSeconds to at least 1 (Math.max(1, ceil))", async () => {
    const admin = buildAdmin({
      rpcResponse: {
        data: [{ allowed: true, e2b_seconds_consumed: 1, owner_e2b_seconds_consumed: 1 }],
        error: null,
      },
    });
    // Even with 0.1s requested, p_seconds must be at least 1
    const rpcMock = admin.rpc as ReturnType<typeof vi.fn>;
    await reserveDailyQuota(admin, "app-1", "owner-1", 0.1);
    const call = rpcMock.mock.calls[0];
    expect(call[1].p_seconds).toBe(1);
  });

  it("ceils fractional seconds (2.3 → 3)", async () => {
    const admin = buildAdmin({
      rpcResponse: {
        data: [{ allowed: true, e2b_seconds_consumed: 3, owner_e2b_seconds_consumed: 3 }],
        error: null,
      },
    });
    const rpcMock = admin.rpc as ReturnType<typeof vi.fn>;
    await reserveDailyQuota(admin, "app-1", "owner-1", 2.3);
    expect(rpcMock.mock.calls[0][1].p_seconds).toBe(3);
  });

  it("returns allowed=false with reason=exhausted when RPC says not allowed", async () => {
    const admin = buildAdmin({
      rpcResponse: {
        data: [{ allowed: false }],
        error: null,
      },
    });
    const result = await reserveDailyQuota(admin, "app-1", "owner-1", 30);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("exhausted");
    }
  });

  it("returns allowed=false with reason=unavailable on RPC error", async () => {
    const admin = buildAdmin({
      rpcResponse: {
        data: null,
        error: { message: "connection refused" },
      },
    });
    const result = await reserveDailyQuota(admin, "app-1", "owner-1", 30);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("unavailable");
    }
  });

  it("returns allowed=false with reason=unavailable when data is empty", async () => {
    const admin = buildAdmin({
      rpcResponse: { data: [], error: null },
    });
    const result = await reserveDailyQuota(admin, "app-1", "owner-1", 30);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("unavailable");
    }
  });

  it("returns allowed=false with reason=unavailable when data is null", async () => {
    const admin = buildAdmin({
      rpcResponse: { data: null, error: null },
    });
    const result = await reserveDailyQuota(admin, "app-1", "owner-1", 30);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("unavailable");
    }
  });

  it("passes window_start as UTC date YYYY-MM-DD", async () => {
    const admin = buildAdmin({
      rpcResponse: {
        data: [{ allowed: true, e2b_seconds_consumed: 0, owner_e2b_seconds_consumed: 0 }],
        error: null,
      },
    });
    const rpcMock = admin.rpc as ReturnType<typeof vi.fn>;
    await reserveDailyQuota(admin, "app-1", "owner-1", 30);
    const windowStart: string = rpcMock.mock.calls[0][1].p_window_start;
    expect(windowStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("passes the default app/owner limits from env when env vars are absent", async () => {
    const original = process.env.FLOOM_APP_E2B_SECONDS_PER_DAY;
    delete process.env.FLOOM_APP_E2B_SECONDS_PER_DAY;

    const admin = buildAdmin({
      rpcResponse: {
        data: [{ allowed: true, e2b_seconds_consumed: 0, owner_e2b_seconds_consumed: 0 }],
        error: null,
      },
    });
    const rpcMock = admin.rpc as ReturnType<typeof vi.fn>;
    await reserveDailyQuota(admin, "app-1", "owner-1", 30);
    expect(rpcMock.mock.calls[0][1].p_app_limit).toBe(DEFAULT_APP_E2B_SECONDS_PER_DAY);

    if (original !== undefined) {
      process.env.FLOOM_APP_E2B_SECONDS_PER_DAY = original;
    }
  });

  it("overrides limit from env var when set to a valid positive integer", async () => {
    process.env.FLOOM_APP_E2B_SECONDS_PER_DAY = "9999";
    const admin = buildAdmin({
      rpcResponse: {
        data: [{ allowed: true, e2b_seconds_consumed: 0, owner_e2b_seconds_consumed: 0 }],
        error: null,
      },
    });
    const rpcMock = admin.rpc as ReturnType<typeof vi.fn>;
    await reserveDailyQuota(admin, "app-1", "owner-1", 30);
    expect(rpcMock.mock.calls[0][1].p_app_limit).toBe(9999);
    delete process.env.FLOOM_APP_E2B_SECONDS_PER_DAY;
  });

  it("computes warningPercent as max of app% and owner%", async () => {
    // App consumed 80% of limit, owner consumed 50% — warningPercent should be 80
    const appLimit = DEFAULT_APP_E2B_SECONDS_PER_DAY;
    const ownerLimit = DEFAULT_OWNER_E2B_SECONDS_PER_DAY;
    const admin = buildAdmin({
      rpcResponse: {
        data: [
          {
            allowed: true,
            e2b_seconds_consumed: Math.floor(appLimit * 0.8),
            owner_e2b_seconds_consumed: Math.floor(ownerLimit * 0.5),
          },
        ],
        error: null,
      },
    });
    const result = await reserveDailyQuota(admin, "app-1", "owner-1", 30);
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.warningPercent).toBe(80);
    }
  });

  it("retryAfterUnix is a future unix timestamp (next UTC midnight)", async () => {
    const admin = buildAdmin({
      rpcResponse: { data: [{ allowed: false }], error: null },
    });
    const before = Math.floor(Date.now() / 1000);
    const result = await reserveDailyQuota(admin, "app-1", "owner-1", 30);
    const after = Math.floor(Date.now() / 1000) + 86400;
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterUnix).toBeGreaterThan(before);
      expect(result.retryAfterUnix).toBeLessThanOrEqual(after);
    }
  });
});

// ── reconcileQuotaReservation ────────────────────────────────────────────────

describe("reconcileQuotaReservation", () => {
  it("returns ok=true with actual seconds as consumedSeconds", async () => {
    const admin = buildAdmin({
      rpcResponse: { data: 30, error: null },
    });
    const result = await reconcileQuotaReservation(admin, "app-1", 30, 30);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.consumedSeconds).toBe(30);
    }
  });

  it("when actual < reserved it adjusts quota by negative delta", async () => {
    // reserved=60, actual=30 → delta=-30 (refund 30s)
    const rpcFn = vi.fn().mockResolvedValue({ data: 30, error: null });
    const admin = { rpc: rpcFn } as unknown as SupabaseClient;
    const result = await reconcileQuotaReservation(admin, "app-1", 60, 30);
    expect(result.ok).toBe(true);
    const call = rpcFn.mock.calls[0];
    // delta = ceil(30) - ceil(60) = -30
    expect(call[1].p_seconds_delta).toBe(-30);
    if (result.ok) {
      expect(result.consumedSeconds).toBe(30);
    }
  });

  it("when actual > reserved it charges the overage", async () => {
    // reserved=10, actual=50 → delta=+40
    const rpcFn = vi.fn().mockResolvedValue({ data: 50, error: null });
    const admin = { rpc: rpcFn } as unknown as SupabaseClient;
    const result = await reconcileQuotaReservation(admin, "app-1", 10, 50);
    expect(result.ok).toBe(true);
    expect(rpcFn.mock.calls[0][1].p_seconds_delta).toBe(40);
  });

  it("clamps actual to at least 1 second (min=1 rule)", async () => {
    // If actual is 0, ceil(0)=0 → Math.max(1,0)=1
    const rpcFn = vi.fn().mockResolvedValue({ data: 1, error: null });
    const admin = { rpc: rpcFn } as unknown as SupabaseClient;
    const result = await reconcileQuotaReservation(admin, "app-1", 10, 0);
    // actual=max(1,ceil(0))=1; delta=1-10=-9
    expect(rpcFn.mock.calls[0][1].p_seconds_delta).toBe(-9);
    if (result.ok) {
      expect(result.consumedSeconds).toBe(1);
    }
  });

  it("when reserved === actual, no RPC call is made (delta=0 path skips adjust)", async () => {
    const rpcFn = vi.fn();
    const admin = { rpc: rpcFn } as unknown as SupabaseClient;
    const result = await reconcileQuotaReservation(admin, "app-1", 30, 30);
    // delta=0 → adjustQuotaUsage is not called
    expect(rpcFn).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.consumedSeconds).toBe(30);
    }
  });

  it("returns ok=false reason=unavailable when RPC errors", async () => {
    const rpcFn = vi.fn().mockResolvedValue({ data: null, error: { message: "db error" } });
    const admin = { rpc: rpcFn } as unknown as SupabaseClient;
    const result = await reconcileQuotaReservation(admin, "app-1", 30, 40);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unavailable");
    }
  });

  it("handles fractional seconds: both reserved and actual are ceiled", async () => {
    const rpcFn = vi.fn().mockResolvedValue({ data: 5, error: null });
    const admin = { rpc: rpcFn } as unknown as SupabaseClient;
    // reserved=10.7 → 11; actual=4.2 → max(1, ceil(4.2))=5; delta=5-11=-6
    await reconcileQuotaReservation(admin, "app-1", 10.7, 4.2);
    expect(rpcFn.mock.calls[0][1].p_seconds_delta).toBe(-6);
  });
});

// ── recordQuotaUsage ─────────────────────────────────────────────────────────

describe("recordQuotaUsage", () => {
  it("returns ok=true with consumedSeconds when both RPC and cleanup succeed", async () => {
    const admin = buildAdmin({
      rpcResponse: { data: 30, error: null },
      deleteResponse: { data: null, error: null },
    });
    const result = await recordQuotaUsage(admin, "app-1", 30);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.consumedSeconds).toBe(30);
    }
  });

  it("skips the adjust RPC when elapsed is 0 or negative", async () => {
    const rpcFn = vi.fn();
    const deleteBuilder = { lt: vi.fn().mockResolvedValue({ data: null, error: null }) };
    const admin = {
      rpc: rpcFn,
      from: vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue(deleteBuilder) }),
    } as unknown as SupabaseClient;
    const result = await recordQuotaUsage(admin, "app-1", 0);
    expect(rpcFn).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("returns ok=false reason=unavailable when cleanup query errors", async () => {
    const admin = buildAdmin({
      rpcResponse: { data: 30, error: null },
      deleteResponse: { data: null, error: { message: "cleanup failed" } },
    });
    const result = await recordQuotaUsage(admin, "app-1", 30);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unavailable");
    }
  });

  it("returns ok=false reason=unavailable when adjust RPC errors", async () => {
    const admin = buildAdmin({
      rpcResponse: { data: null, error: { message: "adjust failed" } },
      deleteResponse: { data: null, error: null },
    });
    const result = await recordQuotaUsage(admin, "app-1", 30);
    expect(result.ok).toBe(false);
  });

  it("calls cleanup with a 7-day cutoff date in YYYY-MM-DD format", async () => {
    const ltFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const deleteFn = vi.fn().mockReturnValue({ lt: ltFn });
    const rpcFn = vi.fn().mockResolvedValue({ data: 10, error: null });
    const admin = {
      rpc: rpcFn,
      from: vi.fn().mockReturnValue({ delete: deleteFn }),
    } as unknown as SupabaseClient;

    await recordQuotaUsage(admin, "app-1", 10);

    // lt is called as: .lt("window_start", "YYYY-MM-DD")
    expect(ltFn).toHaveBeenCalledTimes(1);
    const [_field, cutoffStr] = ltFn.mock.calls[0] as [string, string];
    // Should be a YYYY-MM-DD string
    expect(cutoffStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Should be approximately 7 days ago (compare date strings)
    const today = new Date().toISOString().slice(0, 10);
    const cutoffDate = new Date(cutoffStr + "T00:00:00Z");
    const todayDate = new Date(today + "T00:00:00Z");
    const daysDiff = Math.round((todayDate.getTime() - cutoffDate.getTime()) / 86400000);
    expect(daysDiff).toBe(7);
  });
});
