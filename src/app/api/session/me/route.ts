import { NextRequest, NextResponse } from "next/server";
import { hasAgentTokenConfig } from "@/lib/demo-app";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBearerToken, resolveAuthCaller } from "@/lib/supabase/auth";

export async function GET(req: NextRequest) {
  if (!hasAgentTokenConfig()) {
    return NextResponse.json(
      { error: "Agent tokens are not configured. Set Supabase service-role env and AGENT_TOKEN_PEPPER." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const caller = await resolveAuthCaller(req, admin);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (caller.kind === "user") {
    const token = getBearerToken(req);
    const { data } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    return NextResponse.json({
      user: {
        id: caller.userId,
        email: data.user?.email ?? null,
      },
      user_id: caller.userId,
      token_type: "supabase_user",
    });
  }

  return NextResponse.json({
    user: {
      id: caller.userId,
      email: null,
    },
    user_id: caller.userId,
    token_type: "agent_token",
    agent_token: {
      id: caller.agentTokenId,
      scopes: caller.scopes,
    },
  });
}
