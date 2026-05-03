/**
 * Regression tests for batch-5 fixes (2026-05-03).
 * Covers:
 *   P0-A  auth timeout guard in resolveAuthCaller
 *   P1-B  validate_manifest rejects no-command manifests (verify live path)
 *   P1-C  get_app_contract mentions set_secret + connections
 *   P1-D  run route returns status "succeeded" (not "success"); started_at set
 *   P1-E  isMultilineField heuristic (textarea)
 *   P1-F  CSRF callback returns 302 (not 400)
 *   P1-G  meta description drops "Supabase and E2B" jargon
 */

import { describe, it, expect, vi } from "vitest";

// ── Mock heavy deps ──────────────────────────────────────────────────────────
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

// ── Imports after mocks ──────────────────────────────────────────────────────
import { callFloomTool, type McpToolContext } from "@/lib/mcp/tools";
import { readFileSync } from "fs";
import { resolve } from "path";

const anonContext: McpToolContext = { baseUrl: "http://localhost:3000" };

// ── P0-A: resolveAuthCaller timeout guard ────────────────────────────────────
describe("resolveAuthCaller — timeout guard", () => {
  it("source exports AUTH_RESOLVE_TIMEOUT_MS constant", () => {
    const src = readFileSync(resolve("src/lib/supabase/auth.ts"), "utf-8");
    expect(src).toContain("AUTH_RESOLVE_TIMEOUT_MS");
    // Must be >0 and <30000 (shorter than Vercel default)
    const match = src.match(/AUTH_RESOLVE_TIMEOUT_MS\s*=\s*(\d+)/);
    expect(match).toBeTruthy();
    const ms = parseInt(match![1], 10);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(30000);
  });

  it("source wraps admin.auth.getUser in Promise.race with timeout", () => {
    const src = readFileSync(resolve("src/lib/supabase/auth.ts"), "utf-8");
    expect(src).toContain("Promise.race");
    expect(src).toContain("admin.auth.getUser(token)");
    expect(src).toContain("auth_timeout");
  });

  it("source catches timeout and returns null (not throw)", () => {
    const src = readFileSync(resolve("src/lib/supabase/auth.ts"), "utf-8");
    // There must be a catch block after the Promise.race
    const raceIdx = src.indexOf("Promise.race");
    const catchIdx = src.indexOf("} catch", raceIdx);
    expect(catchIdx).toBeGreaterThan(raceIdx);
    // After catch, should return null
    const catchBlock = src.slice(catchIdx, catchIdx + 200);
    expect(catchBlock).toContain("return null");
  });
});

// ── P1-B: validate_manifest no-command (live path via callFloomTool) ─────────
describe("validate_manifest — rejects missing command (batch-5 re-verify)", () => {
  it("returns valid:false for manifest with no command and valid slug", async () => {
    const result = await callFloomTool(
      "validate_manifest",
      { manifest: "name: test app\nslug: test-no-command-b5\npublic: true" },
      anonContext
    );
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.valid).toBe(false);
    expect(parsed.errors?.some((e: string) => e.toLowerCase().includes("command"))).toBe(true);
  });

  it("returns valid:true for manifest with command field", async () => {
    const result = await callFloomTool(
      "validate_manifest",
      { manifest: "name: test app\nslug: test-with-command-b5\npublic: true\ncommand: python app.py" },
      anonContext
    );
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.valid).toBe(true);
  });
});

// ── P1-C: get_app_contract — updated text ────────────────────────────────────
describe("get_app_contract — contract accuracy", () => {
  it("mentions set_secret tool for setting secrets (not stale 'does not set today')", async () => {
    const result = await callFloomTool("get_app_contract", {}, anonContext);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("set_secret");
    expect(text).not.toContain("does not set raw secret values today");
    expect(text).not.toContain("it does not set raw secret values today");
  });

  it("mentions list_my_connections for Composio workflow", async () => {
    const result = await callFloomTool("get_app_contract", {}, anonContext);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("list_my_connections");
    expect(text).toContain("connections");
  });
});

// ── P1-D: run route returns 'succeeded', not 'success' ──────────────────────
describe("run route — status normalization", () => {
  it("sync success path writes status 'succeeded' (not 'success')", () => {
    const src = readFileSync(resolve("src/app/api/apps/[slug]/run/route.ts"), "utf-8");
    // The final update and return should use 'succeeded'
    // Most reliable: count occurrences
    const successCount = (src.match(/status: "success"/g) ?? []).length;
    const succeededCount = (src.match(/status: "succeeded"/g) ?? []).length;
    // Terminal sync path should use 'succeeded' at least once
    expect(succeededCount).toBeGreaterThanOrEqual(1);
    // 'success' should not appear in terminal sync path (only 'succeeded')
    // The demo-local early return may still use 'success' — check that is the only one
    // Allow max 1 occurrence (the demo path at the top of the file)
    expect(successCount).toBeLessThanOrEqual(1);
  });

  it("sync execution insert includes started_at field", () => {
    const src = readFileSync(resolve("src/app/api/apps/[slug]/run/route.ts"), "utf-8");
    // The sync insert (after bundle download) must include started_at
    expect(src).toContain("started_at: syncStartedAt");
    expect(src).toContain("syncStartedAt");
  });
});

// ── P1-E: isMultilineField heuristic ─────────────────────────────────────────
describe("RunSurface — isMultilineField heuristic", () => {
  it("source exports isMultilineField function", () => {
    const src = readFileSync(resolve("src/components/runner/RunSurface.tsx"), "utf-8");
    expect(src).toContain("function isMultilineField");
  });

  it("isMultilineField returns true for format=textarea", () => {
    const src = readFileSync(resolve("src/components/runner/RunSurface.tsx"), "utf-8");
    expect(src).toContain('f.format === \'textarea\'');
  });

  it("isMultilineField checks defaultValue for newlines", () => {
    const src = readFileSync(resolve("src/components/runner/RunSurface.tsx"), "utf-8");
    // The function must check defaultValue for newline characters
    const fnStart = src.indexOf("function isMultilineField");
    const fnEnd = src.indexOf("\n}", fnStart) + 2;
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain("defaultValue");
    // Uses .includes() with newline pattern
    expect(fnBody.includes("includes('\\n')") || fnBody.includes('includes("\\n")')).toBe(true);
  });

  it("loading copy is 'Working on it…' not 'Running your app...'", () => {
    const src = readFileSync(resolve("src/components/runner/RunSurface.tsx"), "utf-8");
    expect(src).not.toContain("Running your app...");
    expect(src).toContain("Working on it");
  });
});

// ── P1-E: Runtime badge gated behind ?dev=1 ──────────────────────────────────
describe("AppPermalinkPage — Runtime badge gated", () => {
  it("capabilityChips adds runtime only when isDevMode is true", () => {
    const src = readFileSync(resolve("src/app/p/[slug]/AppPermalinkPage.tsx"), "utf-8");
    // The runtime add call must include isDevMode check
    expect(src).toContain("isDevMode");
    const rtAddIdx = src.indexOf("add('runtime'");
    expect(rtAddIdx).toBeGreaterThan(-1);
    // The condition before add('runtime') must include isDevMode
    const condStart = src.lastIndexOf("if (", rtAddIdx);
    const condition = src.slice(condStart, rtAddIdx + 20);
    expect(condition).toContain("isDevMode");
  });
});

// ── P1-F: CSRF callback returns 302, not 400 ─────────────────────────────────
describe("composio/oauth/callback — CSRF mismatch returns 302", () => {
  it("state mismatch path uses NextResponse.redirect (not new NextResponse 400)", () => {
    const src = readFileSync(
      resolve("src/app/api/composio/oauth/callback/route.ts"),
      "utf-8"
    );
    // Must NOT have raw 400 for mismatch
    expect(src).not.toContain('"Bad Request: OAuth state mismatch"');
    expect(src).not.toContain('"Bad Request: OAuth user mismatch"');
    // Both mismatch paths must redirect to /connections?error=invalid_callback
    const occurrences = (src.match(/connections\?error=invalid_callback/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

// ── P1-G: meta description ───────────────────────────────────────────────────
describe("layout.tsx — meta description", () => {
  it("does not mention 'Supabase' or 'E2B' in SITE_DESCRIPTION", () => {
    const src = readFileSync(resolve("src/app/layout.tsx"), "utf-8");
    // Find the SITE_DESCRIPTION constant
    const descIdx = src.indexOf("SITE_DESCRIPTION");
    expect(descIdx).toBeGreaterThan(-1);
    // Extract the string value (between quotes on the same block)
    const descBlock = src.slice(descIdx, descIdx + 300);
    expect(descBlock.toLowerCase()).not.toContain("supabase");
    expect(descBlock.toLowerCase()).not.toContain("e2b");
  });
});
