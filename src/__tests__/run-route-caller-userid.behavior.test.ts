/**
 * Regression test: caller_user_id must be persisted for agent_token callers.
 *
 * Bug (2026-05-04): agent_token callers had userId stripped at execution
 * INSERT time because the original guard was `caller?.kind === "user"`.
 * The async worker then couldn't resolve Composio connections → 412.
 *
 * Fix: `caller?.userId ?? null` — both caller kinds share the userId field.
 * Audit distinction (kind=user vs agent_token) is preserved by the separate
 * caller_agent_token_id column.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const routeSrc = readFileSync(
  resolve("src/app/api/apps/[slug]/run/route.ts"),
  "utf-8"
);

describe("run/route.ts — caller_user_id persistence", () => {
  it("does NOT use kind === 'user' guard for p_caller_user_id (the bug)", () => {
    // The buggy pattern must not appear anywhere in the file
    expect(routeSrc).not.toContain(
      `caller?.kind === "user" ? caller.userId : null`
    );
  });

  it("uses caller?.userId ?? null for p_caller_user_id (async path)", () => {
    // Async path: claim_app_queue_slot with p_status: "queued"
    const asyncIdx = routeSrc.indexOf(`p_status: "queued"`);
    expect(asyncIdx).toBeGreaterThan(-1);
    // The p_caller_user_id line must appear just before the status line
    const asyncSlice = routeSrc.slice(
      Math.max(0, asyncIdx - 200),
      asyncIdx
    );
    expect(asyncSlice).toContain(`p_caller_user_id: caller?.userId ?? null`);
  });

  it("uses caller?.userId ?? null for p_caller_user_id (sync path)", () => {
    // Sync path: claim_app_queue_slot with p_status: "running"
    const syncIdx = routeSrc.indexOf(`p_status: "running"`);
    expect(syncIdx).toBeGreaterThan(-1);
    const syncSlice = routeSrc.slice(
      Math.max(0, syncIdx - 200),
      syncIdx
    );
    expect(syncSlice).toContain(`p_caller_user_id: caller?.userId ?? null`);
  });

  it("still persists caller_agent_token_id for agent_token callers (audit trail)", () => {
    expect(routeSrc).toContain(
      `p_caller_agent_token_id: caller?.kind === "agent_token" ? caller.agentTokenId : null`
    );
  });

  it("p_caller_user_id and p_caller_agent_token_id are set on both paths", () => {
    const userIdMatches = routeSrc.match(/p_caller_user_id: caller\?\.userId \?\? null/g);
    const agentTokenMatches = routeSrc.match(/p_caller_agent_token_id: caller\?\.kind === "agent_token"/g);
    // Both must appear in BOTH the async and sync claim_app_queue_slot calls
    expect(userIdMatches).not.toBeNull();
    expect(userIdMatches?.length).toBe(2);
    expect(agentTokenMatches).not.toBeNull();
    expect(agentTokenMatches?.length).toBe(2);
  });
});
