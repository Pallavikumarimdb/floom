import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const AUTH_CALLBACK_ERROR = "oauth_callback";
const AUTH_CALLBACK_ERROR_MESSAGE = "Authentication failed. Please try again.";
const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const supabase = await createClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && isEmailOtpType(type)
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing auth callback verifier") };

  if (error) {
    return redirectToLoginWithAuthError(req);
  }

  return NextResponse.redirect(new URL(safeNext, resolvePublicOrigin(req)));
}

function isEmailOtpType(type: string | null): type is EmailOtpType {
  return Boolean(type && EMAIL_OTP_TYPES.has(type as EmailOtpType));
}

function redirectToLoginWithAuthError(req: NextRequest) {
  const redirectUrl = new URL("/login", resolvePublicOrigin(req));
  redirectUrl.searchParams.set("error", AUTH_CALLBACK_ERROR);
  redirectUrl.searchParams.set("message", AUTH_CALLBACK_ERROR_MESSAGE);
  return NextResponse.redirect(redirectUrl);
}

function resolvePublicOrigin(req: NextRequest) {
  const configuredOrigin = configuredPublicOrigin();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  return new URL(req.url).origin;
}

function configuredPublicOrigin() {
  const rawOrigin =
    process.env.FLOOM_ORIGIN ||
    process.env.NEXT_PUBLIC_FLOOM_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (!rawOrigin) {
    return null;
  }

  try {
    return new URL(rawOrigin).origin;
  } catch {
    return null;
  }
}
