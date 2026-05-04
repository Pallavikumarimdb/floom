/**
 * Unit tests for src/lib/composio/runtime.ts
 *
 * Uses a lightweight Supabase client mock — no DB required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveComposioConnections,
  MissingComposioConnectionError,
} from "@/lib/composio/runtime";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a mock admin client that returns the specified row (or null) for any query. */
function mockAdmin(
  rows: Record<string, { composio_account_id: string; status: string } | null>
): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, _val: string) => ({
          eq: (_col2: string, val2: string) => ({
            eq: (_col3: string, _val3: string) => ({
              maybeSingle: async () => {
                // val2 is the toolkit / provider slug
                const row = rows[val2] ?? null;
                return { data: row, error: null };
              },
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("resolveComposioConnections", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns empty object when toolkits is empty", async () => {
    const admin = mockAdmin({});
    const result = await resolveComposioConnections(admin, "user-123", []);
    expect(result).toEqual({});
  });

  it("throws sign-in error for anon caller (null)", async () => {
    const admin = mockAdmin({});
    await expect(
      resolveComposioConnections(admin, null, ["gmail"])
    ).rejects.toMatchObject({
      name: "MissingComposioConnectionError",
      reason: "sign-in",
      toolkits: ["gmail"],
    });
  });

  it("throws sign-in error for anon caller (undefined)", async () => {
    const admin = mockAdmin({});
    await expect(
      resolveComposioConnections(admin, undefined, ["gmail"])
    ).rejects.toMatchObject({
      name: "MissingComposioConnectionError",
      reason: "sign-in",
      toolkits: ["gmail"],
    });
  });

  it("throws connect error when authenticated caller has no active row", async () => {
    const admin = mockAdmin({ gmail: null });
    await expect(
      resolveComposioConnections(admin, "user-123", ["gmail"])
    ).rejects.toMatchObject({
      name: "MissingComposioConnectionError",
      reason: "connect",
      toolkits: ["gmail"],
    });
  });

  it("returns env vars when caller has active gmail connection", async () => {
    vi.stubEnv("COMPOSIO_API_KEY", "test-api-key");
    const admin = mockAdmin({
      gmail: { composio_account_id: "acct-gmail-abc", status: "active" },
    });
    const result = await resolveComposioConnections(admin, "user-123", ["gmail"]);
    expect(result).toMatchObject({
      COMPOSIO_GMAIL_CONNECTION_ID: "acct-gmail-abc",
      COMPOSIO_CONNECTION_ID: "acct-gmail-abc",
      COMPOSIO_API_KEY: "test-api-key",
    });
  });

  it("does not inject COMPOSIO_API_KEY when env var is absent", async () => {
    vi.stubEnv("COMPOSIO_API_KEY", "");
    const admin = mockAdmin({
      gmail: { composio_account_id: "acct-gmail-abc", status: "active" },
    });
    const result = await resolveComposioConnections(admin, "user-123", ["gmail"]);
    expect(result).not.toHaveProperty("COMPOSIO_API_KEY");
  });

  it("throws connect error listing only the missing toolkits when some are absent", async () => {
    const admin = mockAdmin({
      gmail: { composio_account_id: "acct-gmail-abc", status: "active" },
      slack: null,
    });
    await expect(
      resolveComposioConnections(admin, "user-123", ["gmail", "slack"])
    ).rejects.toMatchObject({
      name: "MissingComposioConnectionError",
      reason: "connect",
      toolkits: ["slack"],
    });
  });

  it("injects per-toolkit and generic env vars for multiple active toolkits", async () => {
    vi.stubEnv("COMPOSIO_API_KEY", "test-key");
    const admin = mockAdmin({
      gmail: { composio_account_id: "acct-gmail-abc", status: "active" },
      slack: { composio_account_id: "acct-slack-xyz", status: "active" },
    });
    const result = await resolveComposioConnections(admin, "user-123", ["gmail", "slack"]);
    expect(result).toMatchObject({
      COMPOSIO_GMAIL_CONNECTION_ID: "acct-gmail-abc",
      COMPOSIO_SLACK_CONNECTION_ID: "acct-slack-xyz",
      // Last toolkit wins for the generic key.
      COMPOSIO_CONNECTION_ID: "acct-slack-xyz",
      COMPOSIO_API_KEY: "test-key",
    });
  });

  it("normalises hyphenated toolkit slug to uppercase with underscores", async () => {
    const admin = mockAdmin({
      "google-calendar": { composio_account_id: "acct-gcal", status: "active" },
    });
    const result = await resolveComposioConnections(admin, "user-123", ["google-calendar"]);
    expect(result).toHaveProperty("COMPOSIO_GOOGLE_CALENDAR_CONNECTION_ID", "acct-gcal");
  });
});

describe("MissingComposioConnectionError", () => {
  it("has the correct name and reason", () => {
    const err = new MissingComposioConnectionError(["gmail"], "sign-in");
    expect(err.name).toBe("MissingComposioConnectionError");
    expect(err.reason).toBe("sign-in");
    expect(err.toolkits).toEqual(["gmail"]);
    expect(err instanceof Error).toBe(true);
  });

  it("carries userId when provided", () => {
    const err = new MissingComposioConnectionError(["slack"], "connect", "user-abc");
    expect(err.userId).toBe("user-abc");
  });
});
