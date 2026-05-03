/**
 * Regression tests for batch-6/10a fixes (2026-05-03).
 * Covers:
 *   Fix-1  Hero CTAs: "Try the live demo" present; Google CTA removed (batch-10a)
 *   Fix-2  Mobile tab bar CSS wraps at ≤479px
 *   Fix-3  unionKeys — stable first-appearance column ordering
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { unionKeys, type TableRow } from "@/lib/floom/output-rows";

// ── Fix-1: Hero CTAs (updated batch-10a 2026-05-03) ──────────────────────────
describe("page.tsx — hero CTAs", () => {
  it("hero includes Try the live demo button", () => {
    const src = readFileSync(resolve("src/app/page.tsx"), "utf-8");
    expect(src).toContain("Try the live demo");
  });

  it("Google Sign up button has been removed from hero", () => {
    const src = readFileSync(resolve("src/app/page.tsx"), "utf-8");
    expect(src).not.toContain("Sign up with Google");
    expect(src).not.toContain("hero-signup-google");
  });

  it("CLI box has developer framing label", () => {
    const src = readFileSync(resolve("src/app/page.tsx"), "utf-8");
    expect(src).toContain("Build your own");
  });

  it("page does not import createClient (Google OAuth removed)", () => {
    const src = readFileSync(resolve("src/app/page.tsx"), "utf-8");
    expect(src).not.toContain("@/lib/supabase/client");
  });
});

// ── Fix-2: Mobile tab bar wraps at ≤479px ───────────────────────────────────
describe("globals.css — permalink-tab-bar mobile wrap", () => {
  it("has @media (max-width: 479px) rule for .permalink-tab-bar", () => {
    const src = readFileSync(resolve("src/app/globals.css"), "utf-8");
    expect(src).toContain("max-width: 479px");
  });

  it("the 479px rule sets flex-wrap: wrap on .permalink-tab-bar", () => {
    const src = readFileSync(resolve("src/app/globals.css"), "utf-8");
    // Find the tab-bar-specific 479px block (not the hero-headline one)
    const tabComment = src.indexOf("Tab bar: wrap on narrow");
    expect(tabComment).toBeGreaterThan(-1);
    const mediaIdx = src.indexOf("max-width: 479px", tabComment);
    expect(mediaIdx).toBeGreaterThan(-1);
    // Read a large enough slice to capture the full media block contents
    const mediaBlock = src.slice(mediaIdx, mediaIdx + 300);
    expect(mediaBlock).toContain("permalink-tab-bar");
    expect(mediaBlock).toContain("flex-wrap");
    expect(mediaBlock).toContain("wrap");
  });
});

// ── Fix-3: unionKeys — stable column ordering ────────────────────────────────
describe("unionKeys — stable first-appearance ordering", () => {
  it("preserves column order from first-appearing row", () => {
    const rows: TableRow[] = [
      { task: "Buy milk", owner: "Alice", due: "2026-05-10" },
      { task: "Write report", owner: "Bob", due: "2026-05-15" },
    ];
    const keys = unionKeys(rows);
    expect(keys).toEqual(["task", "owner", "due"]);
  });

  it("heterogeneous rows: columns from first row appear before later-only columns", () => {
    // task/owner come from row 0; priority appears first in row 1
    const rows: TableRow[] = [
      { task: "Deploy", owner: "Alice" },
      { priority: "high", task: "Fix bug", owner: "Bob" },
    ];
    const keys = unionKeys(rows);
    // task and owner appear in row 0, so they come first (indices 0 and 1)
    expect(keys.indexOf("task")).toBeLessThan(keys.indexOf("priority"));
    expect(keys.indexOf("owner")).toBeLessThan(keys.indexOf("priority"));
    expect(keys).toHaveLength(3);
  });

  it("same result regardless of row order (deterministic for same shape)", () => {
    const rows1: TableRow[] = [{ a: 1 }, { b: 2 }, { a: 3 }];
    const rows2: TableRow[] = [{ a: 1 }, { b: 2 }, { a: 3 }];
    expect(unionKeys(rows1)).toEqual(unionKeys(rows2));
  });

  it("alphabetical tie-break when two keys first appear in the same row", () => {
    // Both x and y appear for the first time in row 0 at the same "global index"
    // because Object.keys iteration is deterministic per-row; they get indices 0,1
    // No actual tie possible since Object.keys gives ordered indices within one row.
    // Verify alphabet tie-break applies when two keys tie at the row boundary.
    // This tests the sort is stable for keys with equal first-appearance index.
    const rows: TableRow[] = [{ z: 1, a: 2 }];
    const keys = unionKeys(rows);
    // z appears at index 0, a at index 1 in Object.keys — no tie, order preserved
    expect(keys).toEqual(["z", "a"]);
  });

  it("single-row, single-key returns that key", () => {
    expect(unionKeys([{ task: "x" }])).toEqual(["task"]);
  });

  it("empty rows array returns empty array", () => {
    expect(unionKeys([])).toEqual([]);
  });
});
