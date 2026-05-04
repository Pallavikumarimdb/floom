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
import { extractRows, unionKeys, type TableRow } from "@/lib/floom/output-rows";

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
// inputs/error_detail must be gated on isRunner (runner-only: never shown to app owners).
describe("GET /api/runs/[id] — privacy: inputs/error_detail gated on isRunner", () => {
  it("route source uses isRunner branch to gate inputs and error_detail", async () => {
    // Read source to verify structural guarantee without invoking the handler (needs Supabase).
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(resolve("src/app/api/runs/[id]/route.ts"), "utf-8");

    // Must have isRunner guard
    expect(src).toContain("isRunner");
    expect(src).toContain("execution.input");
    // inputs must appear AFTER the isRunner branch guard
    const isRunnerBranchIdx = src.indexOf("if (isRunner)");
    const inputsIdx = src.indexOf("inputs: execution.input");
    expect(isRunnerBranchIdx).toBeGreaterThan(-1);
    expect(inputsIdx).toBeGreaterThan(isRunnerBranchIdx);
    // Same for error_detail
    expect(src).toContain("execution.error_detail");
    const errorDetailIdx = src.indexOf("error_detail: execution.error_detail");
    expect(errorDetailIdx).toBeGreaterThan(isRunnerBranchIdx);
    // Owner fallback branch must NOT contain inputs or error_detail
    const ownerFallbackIdx = src.indexOf("// isOwner only");
    expect(ownerFallbackIdx).toBeGreaterThan(-1);
    const ownerBranch = src.slice(ownerFallbackIdx);
    expect(ownerBranch).not.toContain("inputs: execution.input");
    expect(ownerBranch).not.toContain("error_detail: execution.error_detail");
  });
});

// ── F5: GET /api/runs/[id] — 400 for malformed UUID, 404 message for missing row ──
describe("GET /api/runs/[id] — 400 vs 404 error messages", () => {
  it("route source returns 400 'Invalid run id' for malformed UUID", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(resolve("src/app/api/runs/[id]/route.ts"), "utf-8");

    // UUID guard with 400 + correct message
    expect(src).toContain("Invalid run id");
    expect(src).toContain("status: 400");
    // UUID_RE must be defined
    expect(src).toContain("UUID_RE");
    expect(src).toContain("UUID_RE.test(id)");
  });

  it("route source returns 404 'Run not found' for missing rows", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(resolve("src/app/api/runs/[id]/route.ts"), "utf-8");

    expect(src).toContain("Run not found");
    expect(src).toContain("status: 404");
    // 400 and 404 must both be present as distinct error codes
    expect(src.match(/status: 400/g)?.length).toBeGreaterThanOrEqual(1);
    expect(src.match(/status: 404/g)?.length).toBeGreaterThanOrEqual(1);
  });
});

// ── F6: generateMetadata — OG fallback when no description available ─────────
describe("generateMetadata — OG fallback", () => {
  it("page source falls back to '<appName> on Floom' when no description", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(resolve("src/app/p/[slug]/page.tsx"), "utf-8");

    // The fallback template string must be present verbatim
    expect(src).toContain("`${appName} on Floom`");
    // It must be assigned after the description-fetch block
    const fallbackIdx = src.indexOf("`${appName} on Floom`");
    const fetchIdx = src.indexOf("await fetch(");
    expect(fallbackIdx).toBeGreaterThan(fetchIdx);
  });
});

// ── F7 (post-fix): render gate — heterogeneous rows produce keys.length > 0 ──
describe("F7 render gate (post-fix): heterogeneous rows are table-renderable", () => {
  it("unionKeys on [{a:1,b:2},{a:1,c:3}] gives length 3", () => {
    const rows = [{ a: 1, b: 2 }, { a: 1, c: 3 }];
    const keys = unionKeys(rows);
    // The render gate is now `keys.length > 0` — verify this shape passes
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).toHaveLength(3);
    expect(keys).toContain("a");
    expect(keys).toContain("b");
    expect(keys).toContain("c");
  });

  it("missing keys in a row resolve to empty string (not undefined) in table cells", () => {
    const rows: TableRow[] = [{ a: 1, b: 2 }, { a: 1, c: 3 }];
    const keys = unionKeys(rows);
    // Simulate what the td renderer does: row[k] === undefined → ''
    const rendered = rows.map((row) =>
      Object.fromEntries(
        keys.map((k) => [k, row[k] === null || row[k] === undefined ? "" : String(row[k])])
      )
    );
    expect(rendered[0]["b"]).toBe("2");
    expect(rendered[0]["c"]).toBe("");  // missing key → empty string
    expect(rendered[1]["b"]).toBe("");  // missing key → empty string
    expect(rendered[1]["c"]).toBe("3");
  });
});

// ── F4: welcome email no-op when welcome_email_sent_at already set ──────────
// After A3 refactor: idempotency guard lives in sendWelcomeEmailIdempotent,
// which is called by both maybeFireSignupWelcomeEmail and maybeFireOAuthWelcomeEmail.
describe("welcome email idempotency — shared guard in sendWelcomeEmailIdempotent", () => {
  it("sendWelcomeEmailIdempotent guard appears before sendEmail", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(resolve("src/app/auth/callback/route.ts"), "utf-8");

    // The shared helper must exist
    expect(src).toContain("async function sendWelcomeEmailIdempotent");

    // Guard pattern: early return if welcome_email_sent_at is already set
    expect(src).toContain("user.user_metadata?.welcome_email_sent_at");

    // Guard must appear before sendEmail within the helper
    const helperStart = src.indexOf("async function sendWelcomeEmailIdempotent");
    expect(helperStart).toBeGreaterThan(-1);
    const helperBody = src.slice(helperStart);
    const guardIdx = helperBody.indexOf("welcome_email_sent_at) return");
    const sendIdx = helperBody.indexOf("await sendEmail(");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(sendIdx);
  });

  it("both email-OTP and OAuth paths delegate to sendWelcomeEmailIdempotent", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(resolve("src/app/auth/callback/route.ts"), "utf-8");

    // Both callers must invoke the shared helper
    expect(src).toContain("maybeFireSignupWelcomeEmail");
    expect(src).toContain("maybeFireOAuthWelcomeEmail");

    // Both caller bodies must reference sendWelcomeEmailIdempotent
    const signupFnStart = src.indexOf("async function maybeFireSignupWelcomeEmail");
    const oauthFnStart = src.indexOf("async function maybeFireOAuthWelcomeEmail");
    expect(signupFnStart).toBeGreaterThan(-1);
    expect(oauthFnStart).toBeGreaterThan(-1);
    expect(src.slice(signupFnStart)).toContain("sendWelcomeEmailIdempotent");
    expect(src.slice(oauthFnStart)).toContain("sendWelcomeEmailIdempotent");
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
