import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthCaller } from "@/lib/supabase/auth";
import { createAgentToken } from "@/lib/supabase/agent-tokens";
import { hasAgentTokenConfig } from "@/lib/demo-app";

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

  const { token, record } = await createAgentToken(admin, caller.userId, name);

  return NextResponse.json({
    token,
    agent_token: record,
  });
}
