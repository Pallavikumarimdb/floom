import { NextRequest, NextResponse } from "next/server";
import { hasCliDeviceAuthConfig } from "@/lib/demo-app";
import { CLI_DEVICE_AUTH_POLL_INTERVAL_SECONDS, hashDeviceCode, isExpired } from "@/lib/floom/cli-device";
import { decryptSecretValue } from "@/lib/floom/runtime-secrets";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  if (!hasCliDeviceAuthConfig()) {
    return NextResponse.json(
      {
        error:
          "CLI browser authorization is not configured. Set Supabase env, AGENT_TOKEN_PEPPER, and FLOOM_SECRET_ENCRYPTION_KEY.",
      },
      { status: 503 }
    );
  }

  const deviceCode = req.nextUrl.searchParams.get("device_code") ?? "";
  if (!deviceCode) {
    return NextResponse.json({ error: "Missing device_code" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cli_device_authorizations")
    .select("id, status, expires_at, token_ciphertext, agent_token_id")
    .eq("device_code_hash", hashDeviceCode(deviceCode))
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to poll CLI authorization" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Invalid device_code" }, { status: 400 });
  }

  if (data.status === "pending" && isExpired(String(data.expires_at))) {
    await admin
      .from("cli_device_authorizations")
      .update({ status: "expired" })
      .eq("id", data.id)
      .eq("status", "pending");
    return NextResponse.json({ error: "Authorization expired" }, { status: 410 });
  }

  if (data.status === "pending") {
    return NextResponse.json(
      { status: "pending", interval: CLI_DEVICE_AUTH_POLL_INTERVAL_SECONDS },
      { status: 202 }
    );
  }

  if (data.status === "expired") {
    return NextResponse.json({ error: "Authorization expired" }, { status: 410 });
  }

  if (data.status === "consumed") {
    return NextResponse.json({ error: "Authorization already consumed" }, { status: 409 });
  }

  if (data.status !== "approved" || !data.token_ciphertext) {
    return NextResponse.json({ error: "Authorization is not ready" }, { status: 409 });
  }

  let token: string;
  try {
    token = decryptSecretValue(String(data.token_ciphertext));
  } catch {
    return NextResponse.json({ error: "Failed to decrypt CLI token" }, { status: 500 });
  }

  const { data: consumedRows, error: consumeError } = await admin
    .from("cli_device_authorizations")
    .update({
      status: "consumed",
      token_ciphertext: null,
      consumed_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .eq("status", "approved")
    .select("id");

  if (consumeError) {
    return NextResponse.json({ error: "Failed to consume CLI authorization" }, { status: 500 });
  }
  if (!consumedRows || consumedRows.length !== 1) {
    return NextResponse.json({ error: "Authorization already consumed" }, { status: 409 });
  }

  return NextResponse.json({
    status: "approved",
    token,
    agent_token_id: data.agent_token_id,
  });
}
