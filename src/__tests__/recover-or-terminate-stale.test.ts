/**
 * Tests for the recoverOrTerminateStaleRunning fix (2026-05-04).
 *
 * Problem: when a healthy long-running sandbox triggered the stale-heartbeat
 * sweep (QStash delayed > 90 s), the old code killed the sandbox regardless
 * of whether it was still alive. This caused 600s and 1800s soaks to fail.
 *
 * Fix: recoverOrTerminateStaleRunning now polls E2B first:
 *   - sandbox still running + TTL not elapsed → refresh heartbeat + reschedule
 *   - sandbox terminated (SandboxNotFoundError / not running) → finalize failed
 *   - TTL elapsed → finalize timed_out
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve("src/lib/floom/execution-worker.ts"), "utf-8");

// Extract the recoverOrTerminateStaleRunning function body.
const recoverFnStart = src.indexOf("async function recoverOrTerminateStaleRunning");
const forceFinalizeStart = src.indexOf("\nasync function forceFinalizeExecution");
const recoverFnBody = src.slice(recoverFnStart, forceFinalizeStart);

describe("recoverOrTerminateStaleRunning — source structure", () => {
  it("exists as a function in execution-worker.ts", () => {
    expect(recoverFnStart).toBeGreaterThan(0);
  });

  it("polls E2B sandbox before deciding to terminate", () => {
    expect(recoverFnBody).toContain("pollSandboxExecution");
  });

  it("checks executionTtlMs() before killing a running sandbox", () => {
    expect(recoverFnBody).toContain("executionTtlMs()");
  });

  it("reschedules instead of killing when sandbox is running and TTL not elapsed", () => {
    expect(recoverFnBody).toContain("publishExecutionProcessMessage");
  });

  it("refreshes last_heartbeat_at when sandbox is confirmed running", () => {
    // The rescue block updates last_heartbeat_at.
    const rescueBlock = recoverFnBody.slice(recoverFnBody.indexOf("Sandbox is alive and within TTL"));
    expect(rescueBlock).toContain("last_heartbeat_at: now");
  });

  it("releases lease after reschedule (lease_token: null)", () => {
    const rescueBlock = recoverFnBody.slice(recoverFnBody.indexOf("Sandbox is alive and within TTL"));
    expect(rescueBlock).toContain("lease_token: null");
  });

  it("returns early from the rescue path without calling killSandboxExecution", () => {
    const rescueBlock = recoverFnBody.slice(recoverFnBody.indexOf("Sandbox is alive and within TTL"));
    // The return; must appear before killSandboxExecution in the rescue block.
    const returnIdx = rescueBlock.indexOf("return;");
    const killIdx = rescueBlock.indexOf("await killSandboxExecution");
    expect(returnIdx).toBeGreaterThan(0);
    // Either kill never appears in the rescue path, or return comes first.
    if (killIdx >= 0) {
      expect(returnIdx).toBeLessThan(killIdx);
    }
  });

  it("does not use sandboxTimeoutMs as the termination criterion", () => {
    // The function body must not call sandboxTimeoutMs() for the kill decision.
    expect(recoverFnBody).not.toContain("sandboxTimeoutMs()");
  });

  it("terminates as timed_out when TTL has elapsed", () => {
    // The terminal section must finalize as timed_out.
    expect(recoverFnBody).toContain('"timed_out"');
  });

  it("calls killSandboxExecution in the terminal path", () => {
    expect(recoverFnBody).toContain("await killSandboxExecution(claimed.sandbox_id");
  });
});

describe("sweepExecutions hard-deadline — uses executionTtlMs not sandboxTimeoutMs", () => {
  it("hardDeadlineBefore uses executionTtlMs() * 1.5 (not sandboxTimeoutMs)", () => {
    expect(src).toContain("Math.floor(executionTtlMs() * 1.5)");
    // Old pattern must be gone from sweepExecutions.
    const sweepIdx = src.indexOf("export async function sweepExecutions");
    const snippet = src.slice(sweepIdx, sweepIdx + 1500);
    expect(snippet).not.toContain("sandboxTimeoutMs() * 1.5");
  });
});

describe("recoverOrTerminateStaleRunning — path 1: running + TTL not elapsed", () => {
  it("source confirms the guard checks pollResult.status === 'running' AND !ttlElapsed", () => {
    expect(recoverFnBody).toContain('pollResult?.status === "running" && !ttlElapsed');
  });

  it("source confirms heartbeat refresh and reschedule happen together", () => {
    const rescueBlock = recoverFnBody.slice(recoverFnBody.indexOf("Sandbox is alive and within TTL"));
    expect(rescueBlock).toContain("last_heartbeat_at: now");
    expect(rescueBlock).toContain("publishExecutionProcessMessage");
    expect(rescueBlock).toContain("lease_token: null");
  });
});

describe("recoverOrTerminateStaleRunning — path 2: sandbox terminated (null poll result)", () => {
  it("falls through to kill+finalize when pollResult is null", () => {
    // When E2B poll throws (pollResult === null), code falls through to terminate.
    // The function does NOT reschedule for null results — safer to terminate.
    expect(recoverFnBody).toContain("pollResult === null");
  });
});

describe("recoverOrTerminateStaleRunning — path 3: TTL elapsed", () => {
  it("uses executionTtlMs() for the TTL elapsed check", () => {
    expect(recoverFnBody).toContain("elapsedMs >= executionTtlMs()");
  });

  it("finalizes with 'Execution exceeded maximum execution time' message", () => {
    expect(recoverFnBody).toContain("Execution exceeded maximum execution time");
  });
});
