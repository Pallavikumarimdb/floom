/**
 * Privacy tests for iter-7 — owner vs runner access model.
 *
 * Owner of app: sees traffic metadata only (id, status, timestamps) — NEVER inputs/output of other users.
 * Runner (submitter): sees their own runs in full (inputs + output).
 * /api/me/runs: returns caller's own runs across all apps with full data.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── /api/runs/[id] — owner/runner split ─────────────────────────────────────
describe("GET /api/runs/[id] — owner sees traffic only, runner sees own run in full", () => {
  const src = readFileSync(resolve("src/app/api/runs/[id]/route.ts"), "utf-8");

  it("uses isRunner and isOwner to gate response shape", () => {
    // isRunner gates full execution body (inputs/output/error_detail)
    expect(src).toContain("isRunner");
    // isOwner gates analytics-only response
    expect(src).toContain("isOwner");
  });

  it("isRunner requires caller_user_id match (not just app owner_id)", () => {
    // isRunner is tied to caller_user_id — not app ownership
    expect(src).toContain("caller_user_id");
    expect(src).toContain("isRunner");
    // isAuthedRunner must reference caller_user_id
    expect(src).toContain("isAuthedRunner");
  });

  it("inputs field is only returned inside isRunner branch", () => {
    // inputs must be gated: the runner branch (if isRunner) returns inputs
    expect(src).toContain("inputs: execution.input");
    // The isRunner branch must come BEFORE the owner fallback
    const isRunnerIdx = src.indexOf("if (isRunner)");
    const inputsIdx = src.indexOf("inputs: execution.input");
    expect(isRunnerIdx).toBeGreaterThan(-1);
    expect(inputsIdx).toBeGreaterThan(isRunnerIdx);
    // Owner fallback must NOT contain inputs
    const ownerBranchStart = src.indexOf("// isOwner only");
    expect(ownerBranchStart).toBeGreaterThan(inputsIdx);
    const ownerBranch = src.slice(ownerBranchStart);
    expect(ownerBranch).not.toContain("inputs: execution.input");
  });

  it("error_detail field is only returned inside isRunner branch", () => {
    expect(src).toContain("error_detail: execution.error_detail");
    // error_detail must NOT appear in the owner fallback branch
    const ownerBranchStart = src.indexOf("// isOwner only");
    expect(ownerBranchStart).toBeGreaterThan(-1);
    const ownerBranch = src.slice(ownerBranchStart);
    expect(ownerBranch).not.toContain("error_detail: execution.error_detail");
  });
});

// ── /api/apps/[slug]/runs — owner sees traffic stats only ───────────────────
describe("GET /api/apps/[slug]/runs — owner gets stats shape without inputs/outputs", () => {
  const src = readFileSync(resolve("src/app/api/apps/[slug]/runs/route.ts"), "utf-8");

  it("select clause does not include input or output columns", () => {
    // The select query for owner runs must NOT include `input` or `output` fields
    const selectMatch = src.match(/\.select\([^)]+\)/g) ?? [];
    for (const sel of selectMatch) {
      // Should not select raw input/output columns
      expect(sel).not.toMatch(/\binput\b/);
      expect(sel).not.toMatch(/\boutput\b/);
    }
  });

  it("response map does not spread inputs or output", () => {
    expect(src).not.toContain("inputs:");
    expect(src).not.toContain("output:");
  });
});

// ── /api/me/runs — caller sees own runs in full ──────────────────────────────
describe("GET /api/me/runs — returns caller's own runs with full data", () => {
  const src = readFileSync(resolve("src/app/api/me/runs/route.ts"), "utf-8");

  it("filters by caller_user_id", () => {
    expect(src).toContain("caller_user_id");
    expect(src).toContain("caller.userId");
  });

  it("includes inputs and output in response", () => {
    expect(src).toContain("inputs:");
    expect(src).toContain("output:");
  });

  it("requires authentication (rejects unauthenticated)", () => {
    expect(src).toContain("Unauthorized");
    expect(src).toContain("status: 401");
  });

  it("includes error_detail for runners own runs", () => {
    expect(src).toContain("error_detail");
  });
});
