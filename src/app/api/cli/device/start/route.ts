import { NextRequest, NextResponse } from "next/server";
import { hasCliDeviceAuthConfig } from "@/lib/demo-app";
import {
  CLI_DEVICE_AUTH_POLL_INTERVAL_SECONDS,
  CLI_DEVICE_AUTH_TTL_SECONDS,
  cliDeviceAuthExpiresAt,
  generateDeviceCode,
  generateUserCode,
  hashDeviceCode,
} from "@/lib/floom/cli-device";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const deviceCode = generateDeviceCode();
  const deviceCodeHash = hashDeviceCode(deviceCode);
  const expiresAt = cliDeviceAuthExpiresAt();

  for (let attempt = 0; attempt < 5; attempt++) {
    const userCode = generateUserCode();
    const { error } = await admin.from("cli_device_authorizations").insert({
      device_code_hash: deviceCodeHash,
      user_code: userCode,
      expires_at: expiresAt,
    });

    if (!error) {
      const verificationUri = new URL("/cli/authorize", resolvePublicOrigin(req));
      const verificationUriComplete = new URL(verificationUri);
      verificationUriComplete.searchParams.set("code", userCode);

      return NextResponse.json({
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: verificationUri.toString(),
        verification_uri_complete: verificationUriComplete.toString(),
        expires_in: CLI_DEVICE_AUTH_TTL_SECONDS,
        interval: CLI_DEVICE_AUTH_POLL_INTERVAL_SECONDS,
      });
    }

    if (!isUniqueConflict(error)) {
      return NextResponse.json({ error: "Failed to start CLI authorization" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Failed to generate CLI authorization code" }, { status: 500 });
}

function isUniqueConflict(error: { code?: string }) {
  return error.code === "23505";
}

// Allowlist for x-forwarded-host when FLOOM_ORIGIN is not configured.
// Prevents open-redirect on non-Vercel deploys / staging misconfigs.
const ALLOWED_FORWARDED_HOST_RE = /^([a-z0-9-]+\.)*(floom\.dev|vercel\.app)$/i;

function resolvePublicOrigin(req: NextRequest) {
  const configuredOrigin =
    process.env.FLOOM_ORIGIN ||
    process.env.NEXT_PUBLIC_FLOOM_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      // fall through
    }
  }

  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost && ALLOWED_FORWARDED_HOST_RE.test(forwardedHost)) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  return new URL(req.url).origin;
}
