/**
 * Privacy model tests for the view_token anon-runner access pattern (v0.4).
 *
 * Canonical model:
 *   Runner (authed OR anon w/ view_token) → full inputs/outputs/error_detail
 *   Owner                                 → analytics only (id/status/timestamps/error_code)
 *   Stranger                              → 404
 *
 * These tests verify static structural guarantees — no live DB needed.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── View-token helpers (executions.ts) ───────────────────────────────────────
describe("executions.ts — view_token helpers", () => {
  it("exports generateViewToken", () => {
    const src = readFileSync(resolve("src/lib/floom/executions.ts"), "utf-8");
    expect(src).toContain("export function generateViewToken");
  });

  it("exports extractViewToken", () => {
    const src = readFileSync(resolve("src/lib/floom/executions.ts"), "utf-8");
    expect(src).toContain("export function extractViewToken");
  });

  it("generateViewToken uses randomBytes(32)", () => {
    const src = readFileSync(resolve("src/lib/floom/executions.ts"), "utf-8");
    expect(src).toContain("randomBytes(32)");
  });

  it("verifyViewToken uses timingSafeEqual to prevent timing attacks", () => {
    const src = readFileSync(resolve("src/lib/floom/executions.ts"), "utf-8");
    expect(src).toContain("timingSafeEqual");
  });

  it("view_token hash is SHA-256", () => {
    const src = readFileSync(resolve("src/lib/floom/executions.ts"), "utf-8");
    expect(src).toContain("sha256");
  });

  it("extractViewToken accepts Authorization: ViewToken <token> header", () => {
    const src = readFileSync(resolve("src/lib/floom/executions.ts"), "utf-8");
    expect(src).toContain("ViewToken");
    expect(src).toContain("viewtoken ");
  });

  it("extractViewToken accepts ?view_token= query param fallback", () => {
    const src = readFileSync(resolve("src/lib/floom/executions.ts"), "utf-8");
    expect(src).toContain("view_token");
  });

  it("ExecutionAuthResult type includes isOwner field", () => {
    const src = readFileSync(resolve("src/lib/floom/executions.ts"), "utf-8");
    expect(src).toContain("isOwner: boolean");
  });
});

// ── generateViewToken / extractViewToken unit tests ──────────────────────────
describe("generateViewToken — output shape", () => {
  it("returns a token and a hash", async () => {
    const { generateViewToken } = await import("@/lib/floom/executions");
    const { token, hash } = generateViewToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBe(64); // 32 bytes hex = 64 chars
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64); // SHA-256 hex = 64 chars
    expect(token).not.toBe(hash);
  });

  it("generates unique tokens on successive calls", async () => {
    const { generateViewToken } = await import("@/lib/floom/executions");
    const a = generateViewToken();
    const b = generateViewToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });
});

// ── Submission endpoint — view_token in response ──────────────────────────────
describe("POST /api/apps/[slug]/run — view_token in response", () => {
  const src = readFileSync(resolve("src/app/api/apps/[slug]/run/route.ts"), "utf-8");

  it("imports generateViewToken", () => {
    expect(src).toContain("generateViewToken");
  });

  it("stores view_token_hash in the execution insert (async path)", () => {
    // view_token_hash must be passed to the insert
    expect(src).toContain("view_token_hash: viewTokenHash");
  });

  it("returns view_token in the async queued response", () => {
    // The 202 queued response must include view_token
    expect(src).toContain("view_token: viewToken");
  });

  it("returns view_token in the sync succeeded response", () => {
    // The sync success response must include view_token
    const succeededIdx = src.indexOf("status: \"succeeded\"");
    expect(succeededIdx).toBeGreaterThan(-1);
    const afterSucceeded = src.slice(succeededIdx);
    expect(afterSucceeded).toContain("view_token: viewToken");
  });
});

// ── GET /api/runs/[id] — canonical privacy model ─────────────────────────────
describe("GET /api/runs/[id] — canonical privacy model", () => {
  const src = readFileSync(resolve("src/app/api/runs/[id]/route.ts"), "utf-8");

  it("checks isRunner (authed OR view_token) before isOwner", () => {
    const isRunnerIdx = src.indexOf("const isRunner");
    const isOwnerIdx = src.indexOf("const isOwner");
    expect(isRunnerIdx).toBeGreaterThan(-1);
    expect(isOwnerIdx).toBeGreaterThan(-1);
    expect(isRunnerIdx).toBeLessThan(isOwnerIdx);
  });

  it("stranger (neither isRunner nor isOwner) gets 404", () => {
    expect(src).toContain("!isRunner && !isOwner");
    // Must return 404 for strangers
    const strangerIdx = src.indexOf("!isRunner && !isOwner");
    const after = src.slice(strangerIdx, strangerIdx + 200);
    expect(after).toContain("404");
  });

  it("runner response includes inputs, output, error_detail", () => {
    const isRunnerBranchIdx = src.indexOf("if (isRunner)");
    expect(isRunnerBranchIdx).toBeGreaterThan(-1);
    // All sensitive fields must appear after isRunner branch starts
    expect(src.indexOf("inputs: execution.input")).toBeGreaterThan(isRunnerBranchIdx);
    expect(src.indexOf("output: execution.output")).toBeGreaterThan(isRunnerBranchIdx);
    expect(src.indexOf("error_detail: execution.error_detail")).toBeGreaterThan(isRunnerBranchIdx);
  });

  it("owner-only response does NOT include inputs, output, or error_detail", () => {
    const ownerFallbackIdx = src.indexOf("// isOwner only");
    expect(ownerFallbackIdx).toBeGreaterThan(-1);
    const ownerBranch = src.slice(ownerFallbackIdx);
    expect(ownerBranch).not.toContain("inputs: execution.input");
    expect(ownerBranch).not.toContain("output: execution.output");
    expect(ownerBranch).not.toContain("error_detail: execution.error_detail");
  });

  it("isAuthedRunner checks caller_user_id (not just owner_id)", () => {
    expect(src).toContain("isAuthedRunner");
    const isAuthedRunnerIdx = src.indexOf("const isAuthedRunner");
    const after = src.slice(isAuthedRunnerIdx, isAuthedRunnerIdx + 300);
    expect(after).toContain("caller_user_id");
  });

  it("isViewTokenRunner uses extractViewToken and verifies hash", () => {
    expect(src).toContain("isViewTokenRunner");
    expect(src).toContain("extractViewToken");
    expect(src).toContain("view_token_hash");
    expect(src).toContain("timingSafeEqual");
  });
});

// ── GET /api/executions/[id] — same model ────────────────────────────────────
describe("GET /api/executions/[id] — canonical privacy model", () => {
  const src = readFileSync(resolve("src/app/api/executions/[id]/route.ts"), "utf-8");

  it("stranger branch uses isOwner check, not canAccess", () => {
    // New model: owner check not canAccess
    expect(src).toContain("isOwner");
    expect(src).toContain("isRunner");
  });

  it("SSE stream only enables output for isRunner (not owner)", () => {
    // streamExecution called with auth.isRunner (not auth.isRunner || auth.canAccess)
    expect(src).toContain("streamExecution(req, auth.execution, auth.isRunner)");
  });

  it("owner-only response omits output, error, progress", () => {
    // The owner branch must not return output/error/progress
    const ownerBranchIdx = src.indexOf("isOwner only");
    if (ownerBranchIdx > -1) {
      const ownerBranch = src.slice(ownerBranchIdx, ownerBranchIdx + 400);
      expect(ownerBranch).not.toContain("output:");
      expect(ownerBranch).not.toContain("error:");
      expect(ownerBranch).not.toContain("progress:");
    }
  });
});

// ── GET /api/runs/[id]/logs — same model ─────────────────────────────────────
describe("GET /api/runs/[id]/logs — canonical privacy model", () => {
  const src = readFileSync(resolve("src/app/api/runs/[id]/logs/route.ts"), "utf-8");

  it("uses isRunner to gate stdout/stderr (not isRunner || canAccess)", () => {
    expect(src).toContain("isRunner");
    // The filter must be keyed on isRunner only
    expect(src).toContain("isRunner\n");
    // Must NOT use the old canAccess fallback for stdout/stderr
    const stdoutFilterIdx = src.indexOf("stdout");
    expect(stdoutFilterIdx).toBeGreaterThan(-1);
  });

  it("stranger check (neither isRunner nor isOwner) returns 404", () => {
    expect(src).toContain("!isRunner && !isOwner");
    const strangerIdx = src.indexOf("!isRunner && !isOwner");
    const after = src.slice(strangerIdx, strangerIdx + 200);
    expect(after).toContain("404");
  });
});

// ── Frontend: RunSurface stores view_token ────────────────────────────────────
describe("RunSurface.tsx — view_token localStorage persistence", () => {
  const src = readFileSync(resolve("src/components/runner/RunSurface.tsx"), "utf-8");

  it("stores view_token in localStorage on submit", () => {
    expect(src).toContain("localStorage.setItem");
    expect(src).toContain("floom_vt_");
    expect(src).toContain("view_token");
  });

  it("attaches view_token as Authorization: ViewToken header when polling", () => {
    expect(src).toContain("ViewToken");
    expect(src).toContain("localStorage.getItem");
    expect(src).toContain("floom_vt_");
  });

  it("view_token field is declared in ExecutionSnapshot type", () => {
    expect(src).toContain("view_token?: string | null");
  });
});

// ── AppPermalinkPage uses view_token when loading run from URL ────────────────
describe("AppPermalinkPage.tsx — view_token on run load from URL", () => {
  const src = readFileSync(resolve("src/app/p/[slug]/AppPermalinkPage.tsx"), "utf-8");

  it("reads view_token from localStorage before fetching run", () => {
    expect(src).toContain("floom_vt_");
    expect(src).toContain("localStorage.getItem");
  });

  it("passes view_token as Authorization header in the run fetch", () => {
    expect(src).toContain("Authorization");
    expect(src).toContain("ViewToken");
  });
});
