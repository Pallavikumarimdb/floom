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

  it("uses isRunner (not isOwner) to gate inputs/error_detail", () => {
    // isRunner gates the sensitive fields
    expect(src).toContain("isRunner");
    // canAccess gates visibility (access control)
    expect(src).toContain("canAccess");
  });

  it("isRunner requires caller_user_id match (not just app owner_id)", () => {
    // isRunner is tied to caller_user_id — not app ownership
    expect(src).toContain("caller_user_id");
    expect(src).toContain("isRunner");
    // The isRunner definition must check caller_user_id
    const isRunnerBlock = src.match(/const isRunner[\s\S]*?;/)?.[0] ?? "";
    expect(isRunnerBlock).toContain("caller_user_id");
  });

  it("inputs field is conditionally gated on isRunner", () => {
    // Must NOT have unconditional inputs
    expect(src).not.toMatch(/^\s+inputs:\s+execution\.input,/m);
    // Must have isRunner gate
    expect(src).toContain("isRunner ? { inputs: execution.input }");
  });

  it("error_detail field is conditionally gated on isRunner", () => {
    expect(src).not.toMatch(/^\s+error_detail:\s+execution\.error_detail,/m);
    expect(src).toContain("isRunner ? { error_detail: execution.error_detail }");
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
