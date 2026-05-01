import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const AUTH_CALLBACK_ERROR = "oauth_callback";
const AUTH_CALLBACK_ERROR_MESSAGE = "Authentication failed. Please try again.";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    return redirectToLoginWithAuthError(req);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectToLoginWithAuthError(req);
  }

  return NextResponse.redirect(new URL(safeNext, resolvePublicOrigin(req)));
}

function redirectToLoginWithAuthError(req: NextRequest) {
  const redirectUrl = new URL("/login", resolvePublicOrigin(req));
  redirectUrl.searchParams.set("error", AUTH_CALLBACK_ERROR);
  redirectUrl.searchParams.set("message", AUTH_CALLBACK_ERROR_MESSAGE);
  return NextResponse.redirect(redirectUrl);
}

function resolvePublicOrigin(req: NextRequest) {
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  return new URL(req.url).origin;
}
