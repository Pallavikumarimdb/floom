import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthCaller } from "@/lib/supabase/auth";
import { createAgentToken } from "@/lib/supabase/agent-tokens";
import { hasAgentTokenConfig } from "@/lib/demo-app";

const MAX_AGENT_TOKEN_NAME_LENGTH = 80;
const DEFAULT_MAX_ACTIVE_AGENT_TOKENS_PER_USER = 10;

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

  return NextResponse.json({ agent_tokens: data ?? [] });
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

  const { token, record } = await createAgentToken(admin, caller.userId, name);

  return NextResponse.json({
    token,
    agent_token: record,
  });
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
