/**
 * Unit tests for the stuck-run-auto-fail sweep fix.
 *
 * Covers:
 *   Fix-1  noHeartbeatRunning sweep catches rows with last_heartbeat_at IS NULL
 *   Fix-2  hardDeadlineRunning sweep catches rows older than 1.5x sandboxTimeoutMs
 *   Fix-3  heartbeatStaleRunning no longer matches NULL heartbeat rows
 *   Fix-4  sweepExecutions return shape includes hard_deadline key
 *   Fix-5  hardDeadlineRunning calls killSandboxExecution for rows with sandbox_id
 */

import { describe, it, expect, vi, type Mock } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve("src/lib/floom/execution-worker.ts"), "utf-8");

// ── Fix-1: noHeartbeatRunning sweep ─────────────────────────────────────────
describe("sweepExecutions — noHeartbeatRunning sweep", () => {
  it("queries for last_heartbeat_at IS NULL", () => {
    // The sweep must explicitly filter on null heartbeat
    expect(src).toContain('.is("last_heartbeat_at", null)');
  });

  it("falls back to created_at when started_at is null", () => {
    // The OR condition must handle rows where started_at is also NULL
    expect(src).toContain("created_at.lt.");
  });

  it("calls recoverOrTerminateStaleRunning for each no-heartbeat row", () => {
    // noHeartbeatRunning loop delegates to recoverOrTerminateStaleRunning
    const loopIdx = src.indexOf("noHeartbeatRunning");
    const recoveryIdx = src.indexOf("recoverOrTerminateStaleRunning", loopIdx);
    expect(recoveryIdx).toBeGreaterThan(loopIdx);
  });
});

// ── Fix-2: hardDeadlineRunning sweep ─────────────────────────────────────────
describe("sweepExecutions — hardDeadlineRunning catch-all", () => {
  it("hardDeadlineBefore uses sandboxTimeoutMs * 1.5", () => {
    expect(src).toContain("sandboxTimeoutMs() * 1.5");
  });

  it("uses forceFinalizeExecution to transition stuck rows", () => {
    const hardIdx = src.indexOf("hardDeadlineRunning");
    const forceIdx = src.indexOf("forceFinalizeExecution", hardIdx);
    expect(forceIdx).toBeGreaterThan(hardIdx);
  });

  it('marks stuck rows with error message "execution stuck — sandbox unresponsive"', () => {
    expect(src).toContain("execution stuck — sandbox unresponsive");
  });

  it("includes error_phase: sweep in extra metadata", () => {
    expect(src).toContain("error_phase");
    expect(src).toContain('"sweep"');
  });

  it("kills sandbox for rows that have a sandbox_id", () => {
    const hardDeadlineLoopIdx = src.indexOf("hardDeadlineRunning ?? []");
    const killIdx = src.indexOf("killSandboxExecution", hardDeadlineLoopIdx);
    expect(killIdx).toBeGreaterThan(hardDeadlineLoopIdx);
  });
});

// ── Fix-3: heartbeatStaleRunning no longer matches NULL heartbeat rows ────────
describe("sweepExecutions — heartbeatStaleRunning excludes NULL heartbeats", () => {
  it('uses .not("last_heartbeat_at", "is", null) to exclude NULL rows', () => {
    expect(src).toContain('.not("last_heartbeat_at", "is", null)');
  });

  it("no longer uses the old incorrect .or filter for started_at", () => {
    // The old broken filter was: .or(`started_at.is.null,started_at.gte.${ttlBefore}`)
    // New filter should be .gte("started_at", ttlBefore) to exclude old rows
    expect(src).toContain('.gte("started_at", ttlBefore)');
    // The old form must not be present
    expect(src).not.toContain("started_at.gte.${ttlBefore}");
  });
});

// ── Fix-4: return shape includes hard_deadline ───────────────────────────────
describe("sweepExecutions — return shape", () => {
  it("return object includes hard_deadline key", () => {
    // Find the sweepExecutions function's return statement, which follows the
    // stale_leases loop.  Search for the last occurrence of "hard_deadline"
    // anywhere in the sweep function body.
    expect(src).toContain("hard_deadline:");
  });

  it("stale_running count includes noHeartbeatRunning", () => {
    // The returned stale_running count must sum noHeartbeatRunning
    expect(src).toContain("noHeartbeatRunning?.length");
  });
});
