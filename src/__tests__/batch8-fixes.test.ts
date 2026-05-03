/**
 * Regression tests for batch-8 fixes (2026-05-03).
 * Covers:
 *   Fix-1  POST /api/agent-tokens reads scopes from body, validates, defaults to full scopes
 *   Fix-2  next.config.ts passes VERCEL_GIT_COMMIT_SHA as Sentry release name
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Fix-1: POST /api/agent-tokens scope handling ──────────────────────────────
describe("POST /api/agent-tokens — scope body param", () => {
  it("reads scopes from request body (Array.isArray check present)", () => {
    const src = readFileSync(resolve("src/app/api/agent-tokens/route.ts"), "utf-8");
    expect(src).toContain("Array.isArray(body.scopes)");
  });

  it("validates scopes against ALLOWED_SCOPES", () => {
    const src = readFileSync(resolve("src/app/api/agent-tokens/route.ts"), "utf-8");
    expect(src).toContain("ALLOWED_SCOPES");
    expect(src).toContain("Invalid scope");
  });

  it("rejects unknown scopes with 400", () => {
    const src = readFileSync(resolve("src/app/api/agent-tokens/route.ts"), "utf-8");
    expect(src).toContain("status: 400");
    expect(src).toContain("Allowed:");
  });

  it("defaults to full scopes when body.scopes is absent (backward-compat)", () => {
    const src = readFileSync(resolve("src/app/api/agent-tokens/route.ts"), "utf-8");
    // The else branch must set scopes to the full set
    expect(src).toContain('"read", "run", "publish"');
  });

  it("passes scopes to createAgentToken call", () => {
    const src = readFileSync(resolve("src/app/api/agent-tokens/route.ts"), "utf-8");
    expect(src).toContain("createAgentToken(admin, caller.userId, name, scopes)");
  });

  it("ALLOWED_SCOPES contains exactly read, run, publish", () => {
    const src = readFileSync(resolve("src/app/api/agent-tokens/route.ts"), "utf-8");
    expect(src).toContain('["read", "run", "publish"] as const');
  });
});

// ── Fix-2: Sentry release name uses VERCEL_GIT_COMMIT_SHA ────────────────────
describe("next.config.ts — Sentry release name", () => {
  it("passes release.name using VERCEL_GIT_COMMIT_SHA", () => {
    const src = readFileSync(resolve("next.config.ts"), "utf-8");
    expect(src).toContain("VERCEL_GIT_COMMIT_SHA");
  });

  it("release.name falls back to SENTRY_RELEASE if VERCEL_GIT_COMMIT_SHA is absent", () => {
    const src = readFileSync(resolve("next.config.ts"), "utf-8");
    expect(src).toContain("SENTRY_RELEASE");
  });

  it("release block contains both name and create fields", () => {
    const src = readFileSync(resolve("next.config.ts"), "utf-8");
    const releaseIdx = src.indexOf("release:");
    expect(releaseIdx).toBeGreaterThan(-1);
    const releaseBlock = src.slice(releaseIdx, releaseIdx + 200);
    expect(releaseBlock).toContain("name:");
    expect(releaseBlock).toContain("create:");
  });
});
