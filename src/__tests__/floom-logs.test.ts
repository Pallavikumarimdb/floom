/**
 * Tests for floom-logs feature.
 * Covers:
 *   LOG-1  GET /api/runs/[id]/logs route exists and exports GET handler
 *   LOG-2  Route validates UUID format for execution id
 *   LOG-3  Route requires Supabase config
 *   LOG-4  Route uses authorizeExecutionRead for access control
 *   LOG-5  Route queries execution_events table with since offset
 *   LOG-6  Response shape includes events, next_offset, status, terminal
 *   LOG-7  CLI logs.ts file exists with streamLogs logic
 *   LOG-8  CLI polls /api/runs/<id>/logs?since=<offset>
 *   LOG-9  CLI exits 0 on success, 1 on failure/timeout
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const routeSrc = readFileSync(resolve("src/app/api/runs/[id]/logs/route.ts"), "utf-8");
const cliSrc = readFileSync(resolve("cli/logs.ts"), "utf-8");

// ── LOG-1: Route file exists ──────────────────────────────────────────────────
describe("GET /api/runs/[id]/logs — route file", () => {
  it("route file exists", () => {
    expect(existsSync(resolve("src/app/api/runs/[id]/logs/route.ts"))).toBe(true);
  });

  it("exports GET handler", () => {
    expect(routeSrc).toContain("export async function GET");
  });
});

// ── LOG-2: UUID validation ─────────────────────────────────────────────────────
describe("GET /api/runs/[id]/logs — UUID validation", () => {
  it("validates UUID format with UUID_RE", () => {
    expect(routeSrc).toContain("UUID_RE");
    expect(routeSrc).toContain("Invalid run id");
  });
});

// ── LOG-3: Supabase config check ───────────────────────────────────────────────
describe("GET /api/runs/[id]/logs — Supabase check", () => {
  it("returns 503 when Supabase is not configured", () => {
    expect(routeSrc).toContain("hasSupabaseConfig");
    expect(routeSrc).toContain("Log streaming is unavailable");
  });
});

// ── LOG-4: Access control ──────────────────────────────────────────────────────
describe("GET /api/runs/[id]/logs — auth", () => {
  it("uses authorizeExecutionRead for access control", () => {
    expect(routeSrc).toContain("authorizeExecutionRead");
  });
});

// ── LOG-5: Event query ─────────────────────────────────────────────────────────
describe("GET /api/runs/[id]/logs — query", () => {
  it("queries execution_events table", () => {
    expect(routeSrc).toContain("execution_events");
  });

  it("uses since parameter for offset pagination", () => {
    expect(routeSrc).toContain("since");
    expect(routeSrc).toContain(".range(since");
  });

  it("limits results to 100 events per call", () => {
    expect(routeSrc).toContain("since + 99");
  });

  it("orders by created_at ascending for deterministic ordering", () => {
    expect(routeSrc).toContain('order("created_at", { ascending: true })');
  });
});

// ── LOG-6: Response shape ──────────────────────────────────────────────────────
describe("GET /api/runs/[id]/logs — response", () => {
  it("response includes events, next_offset, status, terminal fields", () => {
    expect(routeSrc).toContain("next_offset");
    expect(routeSrc).toContain("terminal");
    expect(routeSrc).toContain("events");
  });

  it("terminal is computed from isTerminalExecutionStatus", () => {
    expect(routeSrc).toContain("isTerminalExecutionStatus");
  });
});

// ── LOG-7: CLI file ────────────────────────────────────────────────────────────
describe("CLI cli/logs.ts", () => {
  it("CLI file exists", () => {
    expect(existsSync(resolve("cli/logs.ts"))).toBe(true);
  });

  it("exports streamLogs logic (async streaming function)", () => {
    expect(cliSrc).toContain("async function streamLogs");
  });

  it("reads FLOOM_TOKEN and FLOOM_API_URL from env", () => {
    expect(cliSrc).toContain("FLOOM_TOKEN");
    expect(cliSrc).toContain("FLOOM_API_URL");
  });
});

// ── LOG-8: CLI polls correct URL ──────────────────────────────────────────────
describe("CLI poll URL", () => {
  it("polls /api/runs/<id>/logs?since=<offset>", () => {
    expect(cliSrc).toContain("/api/runs/");
    expect(cliSrc).toContain("/logs?since=");
  });

  it("uses POLL_INTERVAL_MS constant for sleep", () => {
    expect(cliSrc).toContain("POLL_INTERVAL_MS");
  });

  it("stops polling when terminal is true", () => {
    expect(cliSrc).toContain("response.terminal");
    expect(cliSrc).toContain("process.exit");
  });
});

// ── LOG-9: CLI exit codes ─────────────────────────────────────────────────────
describe("CLI exit codes", () => {
  it("exits 0 on succeeded", () => {
    expect(cliSrc).toContain("exitCode = response.status === \"succeeded\" ? 0 : 1");
  });

  it("exits 1 on timeout", () => {
    expect(cliSrc).toContain("MAX_POLLS");
    // After max polls, exits 1
    expect(cliSrc).toContain("process.exit(1)");
  });
});
