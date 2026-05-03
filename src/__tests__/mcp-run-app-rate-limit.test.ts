/**
 * Regression test: MCP run_app must apply the same public-run rate limit
 * as POST /api/apps/<slug>/run.
 *
 * Root cause: forwardedHeaders() only forwarded Authorization, so all 30
 * parallel anon MCP callers arrived at the REST route with no IP headers,
 * collapsing to a single rate-limit key. Fix: McpToolContext now carries
 * callerIp/callerUserAgent and forwardedHeaders() passes them through.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/demo-app", () => ({
  hasSupabaseConfig: () => false,
  hasBrowserAuthConfig: () => false,
  demoApp: null,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));
vi.mock("@/lib/floom/bundle", () => ({
  createBundleFromFileMap: vi.fn(),
}));
vi.mock("@/lib/floom/executions", () => ({
  isAsyncRuntimeEnabled: () => false,
  appendExecutionEvent: vi.fn(),
  appQueueMax: () => 10,
  syncWaitBudgetMs: () => 30000,
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { callFloomTool, type McpToolContext } from "@/lib/mcp/tools";
import { getRunCallerKey, getPublicRunCallerKey } from "@/lib/floom/rate-limit";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHeaders(overrides: Record<string, string> = {}): Headers {
  return new Headers(overrides);
}

// ── Rate-limit key propagation tests ─────────────────────────────────────────

describe("McpToolContext.callerIp → forwardedHeaders passes real IP", () => {
  it("two contexts with different IPs produce different rate-limit keys", () => {
    const h1 = makeHeaders({ "x-forwarded-for": "1.2.3.4" });
    const h2 = makeHeaders({ "x-forwarded-for": "5.6.7.8" });
    const key1 = getRunCallerKey(null, h1);
    const key2 = getRunCallerKey(null, h2);
    expect(key1).not.toBe(key2);
  });

  it("two contexts with no IP produce the same 'anonymous' key", () => {
    const h1 = makeHeaders({});
    const h2 = makeHeaders({});
    const key1 = getRunCallerKey(null, h1);
    const key2 = getRunCallerKey(null, h2);
    expect(key1).toBe(key2);
    expect(key1).toBe("anonymous");
  });

  it("getPublicRunCallerKey is deterministic for the same IP+UA", () => {
    const h1 = makeHeaders({ "x-forwarded-for": "1.2.3.4", "user-agent": "test-agent" });
    const h2 = makeHeaders({ "x-forwarded-for": "1.2.3.4", "user-agent": "test-agent" });
    expect(getPublicRunCallerKey(h1)).toBe(getPublicRunCallerKey(h2));
  });

  it("different user-agents with no IP produce different keys", () => {
    const h1 = makeHeaders({ "user-agent": "claude/1.0" });
    const h2 = makeHeaders({ "user-agent": "gpt/4.0" });
    const key1 = getRunCallerKey(null, h1);
    const key2 = getRunCallerKey(null, h2);
    expect(key1).not.toBe(key2);
  });
});

// ── forwardedHeaders includes callerIp when present ──────────────────────────

describe("forwardedHeaders populates IP headers from McpToolContext", () => {
  let fetchCalls: Array<{ url: string; init: RequestInit }> = [];

  beforeEach(() => {
    fetchCalls = [];
    global.fetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      fetchCalls.push({ url, init });
      // Return a fake 429 rate-limit response so we can inspect headers without
      // needing a real app in the DB.
      return Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: "Run rate limit exceeded" }),
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards callerIp as X-Forwarded-For and X-Real-IP", async () => {
    const ctx: McpToolContext = {
      baseUrl: "http://localhost:3000",
      callerIp: "203.0.113.42",
      callerUserAgent: "test-ua/1.0",
    };
    await callFloomTool("run_app", { slug: "test-app", inputs: {} }, ctx);

    expect(fetchCalls.length).toBeGreaterThan(0);
    const sentHeaders = new Headers(fetchCalls[0].init.headers as HeadersInit);
    expect(sentHeaders.get("x-forwarded-for")).toBe("203.0.113.42");
    expect(sentHeaders.get("x-real-ip")).toBe("203.0.113.42");
    expect(sentHeaders.get("user-agent")).toBe("test-ua/1.0");
  });

  it("omits IP headers when callerIp is absent", async () => {
    const ctx: McpToolContext = {
      baseUrl: "http://localhost:3000",
    };
    await callFloomTool("run_app", { slug: "test-app", inputs: {} }, ctx);

    expect(fetchCalls.length).toBeGreaterThan(0);
    const sentHeaders = new Headers(fetchCalls[0].init.headers as HeadersInit);
    expect(sentHeaders.get("x-forwarded-for")).toBeNull();
    expect(sentHeaders.get("x-real-ip")).toBeNull();
  });

  it("30 parallel calls with distinct IPs each get unique X-Forwarded-For", async () => {
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        callFloomTool(
          "run_app",
          { slug: "meeting-action-items", inputs: { transcript: `caller-${i} twenty-char-pad-ok` } },
          {
            baseUrl: "http://localhost:3000",
            callerIp: `10.0.0.${i + 1}`,
            callerUserAgent: `anon-client/${i}`,
          }
        )
      )
    );

    // All 30 calls reached fetch (none short-circuited before the proxy)
    expect(fetchCalls.length).toBe(30);

    // Each call forwarded a distinct IP
    const forwardedIps = fetchCalls.map((c) =>
      new Headers(c.init.headers as HeadersInit).get("x-forwarded-for")
    );
    const uniqueIps = new Set(forwardedIps);
    expect(uniqueIps.size).toBe(30);

    // All 30 received a result (no crash)
    expect(results.length).toBe(30);
  });
});
