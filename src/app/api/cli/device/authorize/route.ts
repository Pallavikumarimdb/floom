import { NextRequest, NextResponse } from "next/server";
import { hasCliDeviceAuthConfig } from "@/lib/demo-app";
import { CLI_DEVICE_AUTH_NAME, isExpired, normalizeUserCode } from "@/lib/floom/cli-device";
import { encryptSecretValue } from "@/lib/floom/runtime-secrets";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAgentToken } from "@/lib/supabase/agent-tokens";
import { resolveAuthCaller } from "@/lib/supabase/auth";

const DEFAULT_MAX_ACTIVE_AGENT_TOKENS_PER_USER = 10;

export async function POST(req: NextRequest) {
  if (!hasCliDeviceAuthConfig()) {
    return NextResponse.json(
      {
        error:
          "CLI browser authorization is not configured. Set Supabase env, AGENT_TOKEN_PEPPER, and FLOOM_SECRET_ENCRYPTION_KEY.",
      },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const caller = await resolveAuthCaller(req, admin);
  if (!caller || caller.kind !== "user") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const userCode = typeof body.user_code === "string" ? normalizeUserCode(body.user_code) : "";
  if (!userCode) {
    return NextResponse.json({ error: "Missing user_code" }, { status: 400 });
  }

  const { data: pending, error: lookupError } = await admin
    .from("cli_device_authorizations")
    .select("id, status, expires_at")
    .eq("user_code", userCode)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: "Failed to load CLI authorization" }, { status: 500 });
  }
  if (!pending) {
    return NextResponse.json({ error: "Unknown authorization code" }, { status: 404 });
  }
  if (pending.status !== "pending") {
    return NextResponse.json({ error: "Authorization code already used" }, { status: 409 });
  }
  if (isExpired(String(pending.expires_at))) {
    await admin
      .from("cli_device_authorizations")
      .update({ status: "expired" })
      .eq("id", pending.id)
      .eq("status", "pending");
    return NextResponse.json({ error: "Authorization code expired" }, { status: 410 });
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

  const { token, record } = await createAgentToken(
    admin,
    caller.userId,
    `${CLI_DEVICE_AUTH_NAME} ${new Date().toISOString().slice(0, 10)}`
  );

  const { error: updateError } = await admin
    .from("cli_device_authorizations")
    .update({
      status: "approved",
      token_ciphertext: encryptSecretValue(token),
      agent_token_id: record.id,
      owner_id: caller.userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", pending.id)
    .eq("status", "pending");

  if (updateError) {
    return NextResponse.json({ error: "Failed to approve CLI authorization" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    agent_token: record,
  });
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
