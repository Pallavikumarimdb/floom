import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthCaller } from "@/lib/supabase/auth";
import { revokeAgentToken } from "@/lib/supabase/agent-tokens";
import { hasAgentTokenConfig } from "@/lib/demo-app";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  if (caller.kind === "agent_token" && caller.agentTokenId !== id) {
    return NextResponse.json({ error: "Agent tokens can only revoke themselves" }, { status: 403 });
  }

  const revoked = await revokeAgentToken(admin, caller.userId, id);
  if (!revoked) {
    return NextResponse.json({ error: "Active token not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
