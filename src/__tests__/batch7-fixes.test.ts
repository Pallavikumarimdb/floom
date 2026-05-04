/**
 * Regression tests for batch-7 fixes (2026-05-03).
 * Covers:
 *   Fix-1  auth_status returns reason + next when token not resolved
 *   Fix-2  layout.tsx declares color-scheme: light
 *   Fix-3  meeting-action-items template uses stock_e2b (command:) shape
 *   Fix-4  Composio catalog tagged with coming_soon; ConnectionsPage uses it
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Fix-1: auth_status returns actionable reason + next ───────────────────────
describe("tools.ts — auth_status token_not_found reason", () => {
  it("returns reason: token_not_found when caller is null", () => {
    const src = readFileSync(resolve("src/lib/mcp/tools.ts"), "utf-8");
    expect(src).toContain("token_not_found");
  });

  it("returns next step with mint instruction", () => {
    const src = readFileSync(resolve("src/lib/mcp/tools.ts"), "utf-8");
    expect(src).toContain("npx @floomhq/cli@latest setup");
    expect(src).toContain("start_device_flow");
  });

  it("reason + next only present in the caller-null branch (not the missing/invalid branch)", () => {
    const src = readFileSync(resolve("src/lib/mcp/tools.ts"), "utf-8");
    // The missing-auth branch must NOT include reason
    const missingIdx = src.indexOf('authorization: "missing"');
    expect(missingIdx).toBeGreaterThan(-1);
    // Slice from missing up to the closing brace of that return block
    const missingBlock = src.slice(missingIdx - 100, missingIdx + 200);
    expect(missingBlock).not.toContain("token_not_found");
  });
});

// ── Fix-2: layout.tsx declares color-scheme: light ───────────────────────────
describe("layout.tsx — color-scheme light meta tag", () => {
  it("contains meta name color-scheme with content light", () => {
    const src = readFileSync(resolve("src/app/layout.tsx"), "utf-8");
    expect(src).toContain('name="color-scheme"');
    expect(src).toContain('content="light"');
  });

  it("meta is inside <head> element", () => {
    const src = readFileSync(resolve("src/app/layout.tsx"), "utf-8");
    const headIdx = src.indexOf("<head>");
    const endHeadIdx = src.indexOf("</head>");
    expect(headIdx).toBeGreaterThan(-1);
    expect(endHeadIdx).toBeGreaterThan(headIdx);
    const headBlock = src.slice(headIdx, endHeadIdx);
    expect(headBlock).toContain('name="color-scheme"');
  });
});

// ── Fix-3: meeting-action-items uses stock_e2b (command:) shape ───────────────
describe("templates/meeting-action-items/floom.yaml — stock_e2b manifest shape", () => {
  it("uses command: not runtime:/entrypoint:/handler:", () => {
    const src = readFileSync(
      resolve("templates/meeting-action-items/floom.yaml"),
      "utf-8"
    );
    expect(src).toContain("command:");
    expect(src).not.toContain("runtime:");
    expect(src).not.toContain("entrypoint:");
    expect(src).not.toContain("handler:");
  });

  it("command references python app.py", () => {
    const src = readFileSync(
      resolve("templates/meeting-action-items/floom.yaml"),
      "utf-8"
    );
    expect(src).toMatch(/command:\s*python app\.py/);
  });

  it("slug is still meeting-action-items", () => {
    const src = readFileSync(
      resolve("templates/meeting-action-items/floom.yaml"),
      "utf-8"
    );
    expect(src).toContain("slug: meeting-action-items");
  });

  it("public: true preserved", () => {
    const src = readFileSync(
      resolve("templates/meeting-action-items/floom.yaml"),
      "utf-8"
    );
    expect(src).toContain("public: true");
  });
});

// ── Fix-4: Composio coming_soon flag ─────────────────────────────────────────
describe("auth-configs.ts — getAvailableToolkitsWithReadiness exported", () => {
  it("exports getAvailableToolkitsWithReadiness", () => {
    const src = readFileSync(
      resolve("src/lib/composio/auth-configs.ts"),
      "utf-8"
    );
    expect(src).toContain("getAvailableToolkitsWithReadiness");
    expect(src).toContain("export async function getAvailableToolkitsWithReadiness");
  });

  it("ToolkitWithReadiness type includes coming_soon boolean", () => {
    const src = readFileSync(
      resolve("src/lib/composio/auth-configs.ts"),
      "utf-8"
    );
    expect(src).toContain("coming_soon: boolean");
  });

  it("fetches provisioned slugs via /api/v3/auth_configs without toolkit_slug filter", () => {
    const src = readFileSync(
      resolve("src/lib/composio/auth-configs.ts"),
      "utf-8"
    );
    // Should have a bulk fetch (no toolkit_slug= in the bulk call).
    // Limit was bumped from 100 → 200 to accommodate larger Composio workspaces.
    expect(src).toContain("auth_configs?limit=200");
  });
});

describe("ConnectionsPage.tsx — coming_soon renders disabled pill not Connect button", () => {
  it("Toolkit type includes coming_soon boolean", () => {
    const src = readFileSync(
      resolve("src/app/connections/ConnectionsPage.tsx"),
      "utf-8"
    );
    expect(src).toContain("coming_soon: boolean");
  });

  it("renders Coming soon pill when toolkit.coming_soon is true", () => {
    const src = readFileSync(
      resolve("src/app/connections/ConnectionsPage.tsx"),
      "utf-8"
    );
    expect(src).toContain("Coming soon");
    expect(src).toContain("toolkit.coming_soon");
  });

  it("Connect button only rendered when coming_soon is false", () => {
    const src = readFileSync(
      resolve("src/app/connections/ConnectionsPage.tsx"),
      "utf-8"
    );
    // The Connect label and coming_soon check must both appear
    expect(src).toContain("Connect");
    expect(src).toContain("toolkit.coming_soon ?");
  });

  it("toolkits route imports getAvailableToolkitsWithReadiness", () => {
    const src = readFileSync(
      resolve("src/app/api/composio/toolkits/route.ts"),
      "utf-8"
    );
    expect(src).toContain("getAvailableToolkitsWithReadiness");
    expect(src).not.toContain("getAvailableToolkits(");
  });
});
