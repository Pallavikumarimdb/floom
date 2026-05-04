/**
 * Regression tests for Bundle E security fixes (2026-05-04).
 * Covers:
 *   Fix-1  JSON-LD XSS via app name — safeJsonLd helper
 *   Fix-2  Cache-Control: private, no-store on auth-gated API responses
 *   Fix-3  x-forwarded-host allowlist in resolvePublicOrigin
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { safeJsonLd } from "@/lib/seo/json-ld";

// ── Fix-1: safeJsonLd helper ─────────────────────────────────────────────────

describe("safeJsonLd", () => {
  it("escapes </script> in a string value", () => {
    const result = safeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(result).not.toContain("</script>");
    expect(result).toContain("<\\/script>");
  });

  it("escapes </script> nested in an object", () => {
    const result = safeJsonLd({
      "@context": "https://schema.org",
      name: "</script>XSS",
      nested: { value: "</script>" },
    });
    expect(result).not.toContain("</script>");
  });

  it("produces valid JSON-LD (parseable JSON)", () => {
    const result = safeJsonLd({ name: "</script>test", url: "https://floom.dev" });
    // JSON.parse must not throw. `<\/` is valid JSON — parsers normalise it.
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("does not alter values without </", () => {
    const data = { name: "Safe App Name", url: "https://floom.dev" };
    expect(safeJsonLd(data)).toBe(JSON.stringify(data));
  });

  it("is used in p/[slug]/page.tsx instead of JSON.stringify for JSON-LD", () => {
    const src = readFileSync(resolve("src/app/p/[slug]/page.tsx"), "utf-8");
    expect(src).toContain('safeJsonLd(appJsonLd)');
    expect(src).not.toMatch(/dangerouslySetInnerHTML.*JSON\.stringify\(appJsonLd\)/);
  });

  it("is used in layout.tsx instead of JSON.stringify for JSON-LD", () => {
    const src = readFileSync(resolve("src/app/layout.tsx"), "utf-8");
    expect(src).toContain('safeJsonLd(STRUCTURED_DATA)');
    expect(src).not.toMatch(/dangerouslySetInnerHTML.*JSON\.stringify\(STRUCTURED_DATA\)/);
  });

  it("is used in docs/page.tsx instead of JSON.stringify for JSON-LD", () => {
    const src = readFileSync(resolve("src/app/docs/page.tsx"), "utf-8");
    expect(src).toContain('safeJsonLd(DOCS_STRUCTURED_DATA)');
    expect(src).not.toMatch(/dangerouslySetInnerHTML.*JSON\.stringify\(DOCS_STRUCTURED_DATA\)/);
  });
});

// ── Fix-2: Cache-Control: private, no-store on auth-gated endpoints ──────────

describe("Cache-Control: private, no-store on auth-gated routes", () => {
  const authGatedRoutes = [
    { label: "/api/me/runs", path: "src/app/api/me/runs/route.ts" },
    { label: "/api/agent-tokens (GET)", path: "src/app/api/agent-tokens/route.ts" },
    { label: "/api/runs/[id]", path: "src/app/api/runs/[id]/route.ts" },
    { label: "/api/runs/[id]/logs", path: "src/app/api/runs/[id]/logs/route.ts" },
    { label: "/api/apps/[slug]/secrets", path: "src/app/api/apps/[slug]/secrets/route.ts" },
    { label: "/api/apps/[slug]/runs", path: "src/app/api/apps/[slug]/runs/route.ts" },
  ];

  for (const { label, path } of authGatedRoutes) {
    it(`${label} has Cache-Control: private, no-store`, () => {
      const src = readFileSync(resolve(path), "utf-8");
      expect(src).toContain("private, no-store");
    });
  }
});

// ── Fix-3: x-forwarded-host allowlist ────────────────────────────────────────

describe("resolvePublicOrigin — x-forwarded-host allowlist", () => {
  it("auth/callback/route.ts has ALLOWED_FORWARDED_HOST_RE", () => {
    const src = readFileSync(resolve("src/app/auth/callback/route.ts"), "utf-8");
    expect(src).toContain("ALLOWED_FORWARDED_HOST_RE");
  });

  it("auth/callback/route.ts tests the forwarded host before using it", () => {
    const src = readFileSync(resolve("src/app/auth/callback/route.ts"), "utf-8");
    expect(src).toContain("ALLOWED_FORWARDED_HOST_RE.test(forwardedHost)");
  });

  it("api/cli/device/start/route.ts has ALLOWED_FORWARDED_HOST_RE", () => {
    const src = readFileSync(resolve("src/app/api/cli/device/start/route.ts"), "utf-8");
    expect(src).toContain("ALLOWED_FORWARDED_HOST_RE");
  });

  it("api/cli/device/start/route.ts tests the forwarded host before using it", () => {
    const src = readFileSync(resolve("src/app/api/cli/device/start/route.ts"), "utf-8");
    expect(src).toContain("ALLOWED_FORWARDED_HOST_RE.test(forwardedHost)");
  });

  it("allowlist regex accepts floom.dev", () => {
    const re = /^([a-z0-9-]+\.)*(floom\.dev|vercel\.app)$/i;
    expect(re.test("floom.dev")).toBe(true);
    expect(re.test("staging.floom.dev")).toBe(true);
    expect(re.test("foo-bar.floom.dev")).toBe(true);
  });

  it("allowlist regex accepts vercel.app preview domains", () => {
    const re = /^([a-z0-9-]+\.)*(floom\.dev|vercel\.app)$/i;
    expect(re.test("floom-git-main-fedes-projects.vercel.app")).toBe(true);
  });

  it("allowlist regex rejects arbitrary attacker-controlled hosts", () => {
    const re = /^([a-z0-9-]+\.)*(floom\.dev|vercel\.app)$/i;
    expect(re.test("evil.com")).toBe(false);
    expect(re.test("floom.dev.evil.com")).toBe(false);
    expect(re.test("notfloom.dev")).toBe(false);
    expect(re.test("vercel.app.evil.com")).toBe(false);
    expect(re.test("evilvercel.app")).toBe(false);
  });
});
