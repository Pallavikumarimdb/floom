/**
 * Regression tests for v0.4 launch hardening (2026-05-04).
 * Covers:
 *   Fix-1  MCP batch size cap (MAX_BATCH_SIZE = 10)
 *   Fix-2  execution_id length cap (max 64 chars)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Fix-1: MCP batch size limit ──────────────────────────────────────────────
describe("server.ts — MAX_BATCH_SIZE batch guard", () => {
  it("defines MAX_BATCH_SIZE = 10", () => {
    const src = readFileSync(resolve("src/lib/mcp/server.ts"), "utf-8");
    expect(src).toContain("MAX_BATCH_SIZE = 10");
  });

  it("checks payload.length > MAX_BATCH_SIZE before Promise.all", () => {
    const src = readFileSync(resolve("src/lib/mcp/server.ts"), "utf-8");
    expect(src).toContain("payload.length > MAX_BATCH_SIZE");
  });

  it("returns -32600 error with descriptive message when batch exceeds limit", () => {
    const src = readFileSync(resolve("src/lib/mcp/server.ts"), "utf-8");
    expect(src).toContain("-32600");
    expect(src).toContain("Batch too large");
  });

  it("guard is placed before Promise.all in the array case", () => {
    const src = readFileSync(resolve("src/lib/mcp/server.ts"), "utf-8");
    const arrayIfIdx = src.indexOf("if (Array.isArray(payload))");
    const batchCheckIdx = src.indexOf("MAX_BATCH_SIZE");
    const promiseAllIdx = src.indexOf("Promise.all");
    expect(arrayIfIdx).toBeGreaterThan(-1);
    expect(batchCheckIdx).toBeGreaterThan(arrayIfIdx);
    expect(promiseAllIdx).toBeGreaterThan(batchCheckIdx);
  });
});

// ── Fix-2: execution_id length cap ───────────────────────────────────────────
describe("tools.ts — getExecution execution_id length cap", () => {
  it("checks execution_id.length > 64", () => {
    const src = readFileSync(resolve("src/lib/mcp/tools.ts"), "utf-8");
    expect(src).toContain("executionId.length > 64");
  });

  it("returns error when execution_id exceeds 64 chars", () => {
    const src = readFileSync(resolve("src/lib/mcp/tools.ts"), "utf-8");
    const getExecIdx = src.indexOf("async function getExecution");
    expect(getExecIdx).toBeGreaterThan(-1);
    const nextFuncIdx = src.indexOf("async function", getExecIdx + 1);
    const funcBody = src.slice(getExecIdx, nextFuncIdx);
    expect(funcBody).toContain("executionId.length > 64");
    expect(funcBody).toContain("is too long");
  });

  it("length check comes after the < 8 check", () => {
    const src = readFileSync(resolve("src/lib/mcp/tools.ts"), "utf-8");
    const getExecIdx = src.indexOf("async function getExecution");
    const nextFuncIdx = src.indexOf("async function", getExecIdx + 1);
    const funcBody = src.slice(getExecIdx, nextFuncIdx);
    const minCheckIdx = funcBody.indexOf("executionId.length < 8");
    const maxCheckIdx = funcBody.indexOf("executionId.length > 64");
    expect(minCheckIdx).toBeGreaterThan(-1);
    expect(maxCheckIdx).toBeGreaterThan(-1);
    expect(minCheckIdx).toBeLessThan(maxCheckIdx);
  });

  it("both length checks use errorResult for consistent error handling", () => {
    const src = readFileSync(resolve("src/lib/mcp/tools.ts"), "utf-8");
    const getExecIdx = src.indexOf("async function getExecution");
    const nextFuncIdx = src.indexOf("async function", getExecIdx + 1);
    const funcBody = src.slice(getExecIdx, nextFuncIdx);
    const lengthErrorLines = funcBody.match(/executionId\.length.*\n.*return errorResult/g);
    expect(lengthErrorLines).not.toBeNull();
    if (lengthErrorLines) {
      expect(lengthErrorLines.length).toBeGreaterThanOrEqual(2);
    }
  });
});
