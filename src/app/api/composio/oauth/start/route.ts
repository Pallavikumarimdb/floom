import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { hasAgentTokenConfig } from "@/lib/demo-app";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthCaller } from "@/lib/supabase/auth";
import { getAuthConfigIdForProvider } from "@/lib/composio/auth-configs";

const PROVIDER_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const COMPOSIO_API_BASE = "https://backend.composio.dev";

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

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Composio is not configured on this deployment" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
  if (!PROVIDER_RE.test(provider)) {
    return NextResponse.json({ error: "provider must be a lowercase provider slug" }, { status: 400 });
  }

  // Resolve the auth_config id for this provider from Composio
  const authConfigId = await getAuthConfigIdForProvider(provider, apiKey);
  if (!authConfigId) {
    return NextResponse.json(
      { error: `No Composio auth config found for provider: ${provider}. Ensure a managed auth config is created in your Composio workspace.` },
      { status: 404 }
    );
  }

  // Generate a CSRF state nonce (32 random bytes = 64 hex chars)
  const stateNonce = randomBytes(32).toString("hex");

  // Determine the callback URL (preview vs production)
  const origin = req.headers.get("origin") || req.nextUrl.origin;
  const callbackUrl = `${origin}/api/composio/oauth/callback`;

  // Create the connected account in Composio, passing state nonce for CSRF
  let composioResponse: Response;
  try {
    composioResponse = await fetch(`${COMPOSIO_API_BASE}/api/v3/connected_accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        user_id: `user:${caller.userId}`,
        auth_config: { id: authConfigId },
        connection: {
          redirect_url: callbackUrl,
          state: stateNonce,
        },
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Failed to reach Composio API" }, { status: 502 });
  }

  if (!composioResponse.ok) {
    const errorBody = await composioResponse.json().catch(() => ({}));
    const message = (errorBody as { error?: { message?: string } })?.error?.message ?? "Composio API error";
    return NextResponse.json({ error: message }, { status: composioResponse.status });
  }

  const composioData = await composioResponse.json() as {
    id: string;
    redirect_url?: string;
    redirect_uri?: string;
    status: string;
  };

  const redirectUrl = composioData.redirect_url ?? composioData.redirect_uri;
  if (!redirectUrl) {
    return NextResponse.json({ error: "Composio did not return a redirect URL" }, { status: 502 });
  }

  // Insert a pending composio_connections row with the state nonce
  const now = new Date().toISOString();
  const { data: connectionRow, error: insertError } = await admin
    .from("composio_connections")
    .insert({
      user_id: caller.userId,
      provider,
      composio_account_id: composioData.id,
      scopes: [],
      status: "pending",
      state_nonce: stateNonce,
      created_at: now,
      updated_at: now,
      revoked_at: null,
    })
    .select("id")
    .single();

  if (insertError || !connectionRow) {
    return NextResponse.json({ error: "Failed to record connection" }, { status: 500 });
  }

  return NextResponse.json({
    provider,
    authorize_url: redirectUrl,
    connection_id: connectionRow.id as string,
  });
}
