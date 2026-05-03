/**
 * Tests for:
 *   Fix-1a: Async runs section in /docs (DocsContent.tsx)
 *   Fix-1b: async_calling field in get_app_contract MCP response
 *   Fix-2:  Better 404 copy with sign-in CTA
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Fix-1a: /docs async-runs section ─────────────────────────────────────────

describe("DocsContent.tsx — async-runs section", () => {
  const src = readFileSync(resolve("src/app/docs/DocsContent.tsx"), "utf-8");

  it("TOC includes async-runs entry", () => {
    expect(src).toContain('id: "async-runs"');
    expect(src).toContain('label: "Async runs"');
  });

  it("section renders with id async-runs", () => {
    expect(src).toContain('id="async-runs"');
  });

  it("documents the 202 + execution_id response", () => {
    expect(src).toContain("202");
    expect(src).toContain("execution_id");
    expect(src).toContain("queued");
  });

  it("documents polling GET /api/executions/:id", () => {
    expect(src).toContain("/api/executions/");
  });

  it("mentions terminal statuses", () => {
    expect(src).toContain("succeeded");
    expect(src).toContain("failed");
    expect(src).toContain("timed_out");
    expect(src).toContain("cancelled");
  });

  it("mentions ?wait=true for sync style", () => {
    expect(src).toContain("?wait=true");
  });

  it("mentions CLI polling automatically", () => {
    expect(src).toContain("floom run");
    expect(src).toContain("polling automatically");
  });
});

// ── Fix-1b: get_app_contract has async_calling field ─────────────────────────

describe("tools.ts — get_app_contract async_calling field", () => {
  const src = readFileSync(resolve("src/lib/mcp/tools.ts"), "utf-8");

  it("contract object has async_calling key", () => {
    expect(src).toContain("async_calling");
  });

  it("async_calling describes the endpoint shape", () => {
    // Should mention the POST without wait=true pattern
    const idx = src.indexOf("async_calling");
    expect(idx).toBeGreaterThan(-1);
    const slice = src.slice(idx, idx + 600);
    expect(slice).toContain("POST");
    expect(slice).toContain("?wait=true");
    expect(slice).toContain("execution_id");
    expect(slice).toContain("GET /api/executions");
  });

  it("async_calling covers all terminal statuses", () => {
    const idx = src.indexOf("async_calling");
    const slice = src.slice(idx, idx + 600);
    expect(slice).toContain("succeeded");
    expect(slice).toContain("failed");
    expect(slice).toContain("timed_out");
    expect(slice).toContain("cancelled");
  });
});

// ── Fix-2: 404 page copy with sign-in CTA ────────────────────────────────────

describe("not-found.tsx — improved 404 copy", () => {
  const src = readFileSync(resolve("src/app/not-found.tsx"), "utf-8");

  it("heading mentions private app possibility", () => {
    expect(src).toContain("private");
  });

  it("has sign-in link pointing to /login", () => {
    expect(src).toContain('href="/login"');
    expect(src).toContain("Sign in");
  });

  it("has browse public apps CTA pointing to /", () => {
    expect(src).toContain('href="/"');
    expect(src).toContain("Browse public apps");
  });

  it("does not still say the old generic copy", () => {
    expect(src).not.toContain("doesn't exist or has moved");
  });
});
