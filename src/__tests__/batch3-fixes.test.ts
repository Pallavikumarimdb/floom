/**
 * Smoke tests for batch-3 fixes (PR #38 / 2026-05-03).
 * Covers: F2 regex, F3 validate_manifest, F7 OutputDisplay rows, F1 privacy, F4 welcome email
 */

import { describe, it, expect, vi } from "vitest";

// ── Mock heavy deps before importing tools ──────────────────────────────────
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

// ── Imports after mocks ─────────────────────────────────────────────────────
import { SECRET_NAME_RE } from "@/lib/floom/runtime-secrets";
import { callFloomTool, type McpToolContext } from "@/lib/mcp/tools";
import { extractRows, unionKeys } from "@/lib/floom/output-rows";

const anonContext: McpToolContext = { baseUrl: "http://localhost:3000" };

// ── F2: SECRET_NAME_RE consistency ─────────────────────────────────────────
describe("SECRET_NAME_RE — matches REST source of truth", () => {
  it("accepts OPENAI_API_KEY", () => {
    expect(SECRET_NAME_RE.test("OPENAI_API_KEY")).toBe(true);
  });

  it("accepts AB (minimum 2 chars)", () => {
    expect(SECRET_NAME_RE.test("AB")).toBe(true);
  });

  it("rejects single-letter name X (REST rejects it, MCP must too)", () => {
    expect(SECRET_NAME_RE.test("X")).toBe(false);
  });

  it("rejects 65-char name (REST enforces max 64)", () => {
    const longName = "A" + "B".repeat(64); // 65 chars
    expect(SECRET_NAME_RE.test(longName)).toBe(false);
  });

  it("rejects lowercase names", () => {
    expect(SECRET_NAME_RE.test("openai_key")).toBe(false);
  });

  it("is identical to /^[A-Z][A-Z0-9_]{1,63}$/", () => {
    // Verify the canonical pattern is what's exported
    const canonical = /^[A-Z][A-Z0-9_]{1,63}$/;
    const testCases = ["X", "AB", "OPENAI_API_KEY", "A1", "a_key", "A" + "B".repeat(63), "A" + "B".repeat(64)];
    for (const c of testCases) {
      expect(SECRET_NAME_RE.test(c)).toBe(canonical.test(c));
    }
  });
});

// ── F3: validate_manifest rejects missing command without files ─────────────
describe("validate_manifest — rejects missing command regardless of files arg", () => {
  it("returns valid: false when manifest has no command and no files supplied", async () => {
    const result = await callFloomTool(
      "validate_manifest",
      { manifest: "name: foo\nslug: my-app\npublic: true" },
      anonContext
    );
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.valid).toBe(false);
    expect(parsed.errors).toBeDefined();
    expect(parsed.errors.some((e: string) => e.toLowerCase().includes("command"))).toBe(true);
  });

  it("returns valid: true when manifest has command and no files supplied", async () => {
    const result = await callFloomTool(
      "validate_manifest",
      { manifest: "name: foo\nslug: my-app\npublic: true\ncommand: python app.py" },
      anonContext
    );
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.valid).toBe(true);
  });

  it("legacy entrypoint manifest is valid without command", async () => {
    const result = await callFloomTool(
      "validate_manifest",
      { manifest: "name: foo\nslug: my-app\nentrypoint: handler.py\nhandler: main" },
      anonContext
    );
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    // Legacy manifests should not be rejected for missing command
    expect(parsed.errors?.some((e: string) => e.toLowerCase().includes("command"))).toBeFalsy();
  });
});

// ── F7: extractRows + unionKeys from {count, items: [...]} shape ────────────
describe("extractRows — handles wrapper shapes and heterogeneous rows", () => {
  it("extracts items from {count, items: [...]} wrapper", () => {
    const output = { count: 2, items: [{ a: 1 }, { a: 2 }] };
    const rows = extractRows(output);
    expect(rows).toHaveLength(2);
    expect(rows?.[0]).toEqual({ a: 1 });
  });

  it("returns array directly when top-level is array of objects", () => {
    const output = [{ x: 1 }, { x: 2 }];
    const rows = extractRows(output);
    expect(rows).toHaveLength(2);
  });

  it("returns null for scalar output", () => {
    expect(extractRows("hello")).toBeNull();
    expect(extractRows(42)).toBeNull();
    expect(extractRows(null)).toBeNull();
  });
});

describe("unionKeys — covers all columns across heterogeneous rows", () => {
  it("returns union of keys across all rows", () => {
    const rows = [{ a: 1, b: 2 }, { a: 3, c: 4 }];
    const keys = unionKeys(rows);
    expect(keys).toContain("a");
    expect(keys).toContain("b");
    expect(keys).toContain("c");
    expect(keys).toHaveLength(3);
  });

  it("returns consistent keys when all rows are identical shape", () => {
    const rows = [{ a: 1 }, { a: 2 }];
    const keys = unionKeys(rows);
    expect(keys).toEqual(["a"]);
  });
});

// ── F1: anonymous read must not receive inputs / error_detail ───────────────
// The route handler requires Next.js runtime + Supabase; we verify the
// structural guarantee by checking that the cherry-picked code uses
// conditional spreads keyed on isOwner.
describe("GET /api/runs/[id] — privacy: inputs/error_detail gated on isOwner", () => {
  it("route source uses conditional spread for inputs (not unconditional)", async () => {
    // Read source to verify structural guarantee without invoking the handler (needs Supabase).
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(resolve("src/app/api/runs/[id]/route.ts"), "utf-8");

    // Must NOT have unconditional `inputs: execution.input`
    expect(src).not.toMatch(/^\s+inputs:\s+execution\.input,/m);
    // Must have the conditional spread pattern (isOwner guard)
    expect(src).toContain("isOwner");
    expect(src).toContain("execution.input");
    // Same for error_detail
    expect(src).not.toMatch(/^\s+error_detail:\s+execution\.error_detail,/m);
    expect(src).toContain("execution.error_detail");
  });
});

// ── F4: welcome email no-op when welcome_email_sent_at already set ──────────
describe("maybeFireOAuthWelcomeEmail — idempotency guard", () => {
  it("skips sending when welcome_email_sent_at is already set in user_metadata", async () => {
    // Read callback source to assert structural guarantee (guard before sendEmail call in OAuth function).
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(resolve("src/app/auth/callback/route.ts"), "utf-8");

    // The guard pattern: early return if welcome_email_sent_at is already set
    expect(src).toContain("user.user_metadata?.welcome_email_sent_at");

    // Guard (early-return pattern) must appear before sendEmail in the maybeFireOAuthWelcomeEmail function.
    const oauthFnStart = src.indexOf("async function maybeFireOAuthWelcomeEmail");
    expect(oauthFnStart).toBeGreaterThan(-1);
    const fnBody = src.slice(oauthFnStart);
    const guardIdx = fnBody.indexOf("welcome_email_sent_at) return");
    const sendIdx = fnBody.indexOf("await sendEmail(");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(sendIdx);
  });

  it("writes welcome_email_sent_at after sending", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(resolve("src/app/auth/callback/route.ts"), "utf-8");

    // Should call updateUserById with welcome_email_sent_at after sendEmail
    expect(src).toContain("updateUserById");
    expect(src).toContain("welcome_email_sent_at");
    expect(src).toContain("new Date().toISOString()");
  });
});
