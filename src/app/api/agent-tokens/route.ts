import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthCaller } from "@/lib/supabase/auth";
import { createAgentToken } from "@/lib/supabase/agent-tokens";
import { hasAgentTokenConfig } from "@/lib/demo-app";

const MAX_AGENT_TOKEN_NAME_LENGTH = 80;
const DEFAULT_MAX_ACTIVE_AGENT_TOKENS_PER_USER = 10;
const ALLOWED_SCOPES = ["read", "run", "publish"] as const;

// All responses that expose user-private data carry explicit Cache-Control so
// shared caches (CDNs, proxies) never store bearer-auth'd content.
const PRIVATE_CACHE = { "Cache-Control": "private, no-store" } as const;

export async function GET(req: NextRequest) {
  if (!hasAgentTokenConfig()) {
    return NextResponse.json(
      { error: "Agent tokens are not configured. Set Supabase service-role env and AGENT_TOKEN_PEPPER." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const caller = await resolveAuthCaller(req, admin);
  if (!caller || caller.kind !== "user") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await admin
    .from("agent_tokens")
    .select("id, name, token_prefix, scopes, created_at, expires_at, last_used_at, revoked_at")
    .eq("owner_id", caller.userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to list agent tokens" }, { status: 500 });
  }

  return NextResponse.json(
    { agent_tokens: data ?? [] },
    { headers: PRIVATE_CACHE },
  );
}

export async function POST(req: NextRequest) {
  if (!hasAgentTokenConfig()) {
    return NextResponse.json(
      { error: "Agent tokens are not configured. Set Supabase service-role env and AGENT_TOKEN_PEPPER." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const caller = await resolveAuthCaller(req, admin);
  if (!caller || caller.kind !== "user") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Agent token";
  if (name.length > MAX_AGENT_TOKEN_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Token name must be ${MAX_AGENT_TOKEN_NAME_LENGTH} characters or less` },
      { status: 400 }
    );
  }

  // Scope validation: default to full scopes (backward-compatible); reject unknowns.
  let scopes: string[];
  if (Array.isArray(body.scopes)) {
    const invalid = (body.scopes as unknown[]).filter(
      (s) => !ALLOWED_SCOPES.includes(s as (typeof ALLOWED_SCOPES)[number])
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid scope(s): ${invalid.join(", ")}. Allowed: ${ALLOWED_SCOPES.join(", ")}`,
        },
        { status: 400 }
      );
    }
    scopes = body.scopes as string[];
  } else {
    scopes = ["read", "run", "publish"];
  }

  const activeTokenLimit = readPositiveIntegerEnv(
    "FLOOM_MAX_ACTIVE_AGENT_TOKENS_PER_USER",
    DEFAULT_MAX_ACTIVE_AGENT_TOKENS_PER_USER
  );
  const { count, error: countError } = await admin
    .from("agent_tokens")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", caller.userId)
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  if (countError) {
    return NextResponse.json({ error: "Failed to check token limit" }, { status: 500 });
  }

  if ((count ?? 0) >= activeTokenLimit) {
    return NextResponse.json(
      { error: `Active agent token limit reached (${activeTokenLimit})` },
      { status: 429 }
    );
  }

  const { token, record } = await createAgentToken(admin, caller.userId, name, scopes);

  return NextResponse.json(
    { token, agent_token: record },
    { headers: PRIVATE_CACHE },
  );
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
