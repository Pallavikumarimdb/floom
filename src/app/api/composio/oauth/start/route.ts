import { NextRequest, NextResponse } from "next/server";
import { hasAgentTokenConfig } from "@/lib/demo-app";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthCaller } from "@/lib/supabase/auth";

const PROVIDER_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export async function POST(req: NextRequest) {
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

  if (caller.kind !== "user") {
    return NextResponse.json({ error: "User session required to start OAuth" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
  if (!PROVIDER_RE.test(provider)) {
    return NextResponse.json({ error: "provider must be a lowercase provider slug" }, { status: 400 });
  }

  const authorizeUrl = new URL("https://composio.dev/oauth/start");
  authorizeUrl.searchParams.set("provider", provider);
  authorizeUrl.searchParams.set("floom_user_id", caller.userId);

  return NextResponse.json({
    provider,
    authorize_url: authorizeUrl.toString(),
    stub: true,
  });
}
