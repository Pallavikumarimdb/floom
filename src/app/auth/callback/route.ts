import { NextRequest, NextResponse, after } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { renderWelcomeEmail } from "@/lib/email/templates";

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

  // Track whether this is a code-exchange (OAuth) path before the exchange,
  // so we can detect first-time users after the session is established.
  const isCodeExchange = !!code;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && isEmailOtpType(type)
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing auth callback verifier") };

  if (error) {
    return redirectToLoginWithAuthError(req);
  }

  const publicOrigin = resolvePublicOrigin(req);

  // Fire welcome email on first-time email confirmation (type=signup).
  // after() keeps the serverless function alive until the promise settles
  // without blocking the redirect response.
  if (type === "signup") {
    after(fireWelcomeEmail(supabase, publicOrigin));
  }

  // Fire welcome email for Google OAuth (and other provider) first-time signups.
  // The code-exchange path doesn't carry type=signup, so we detect "new user"
  // by checking whether created_at is within the last 30 seconds.
  if (isCodeExchange && type !== "signup") {
    after(maybeFireOAuthWelcomeEmail(supabase, publicOrigin));
  }

  return NextResponse.redirect(new URL(safeNext, publicOrigin));
}

async function fireWelcomeEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  publicOrigin: string,
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return;

    const name =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null;

    const { subject, html, text } = renderWelcomeEmail({
      name,
      publicUrl: publicOrigin,
    });

    await sendEmail({ to: user.email, subject, html, text });
  } catch (err) {
    // Welcome email failures must never surface to the user.
    console.error("[auth:callback] welcome email error:", err);
  }
}

// For OAuth provider signups (Google, GitHub, etc.) the callback arrives via
// the code-exchange path without type=signup. Detect first-time signups by
// checking whether the user's created_at is within the last 30 seconds.
async function maybeFireOAuthWelcomeEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  publicOrigin: string,
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email || !user.created_at) return;

    const createdMs = new Date(user.created_at).getTime();
    const isNewUser = Date.now() - createdMs < 30_000;
    if (!isNewUser) return;

    const name =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null;

    const { subject, html, text } = renderWelcomeEmail({
      name,
      publicUrl: publicOrigin,
    });

    await sendEmail({ to: user.email, subject, html, text });
  } catch (err) {
    console.error("[auth:callback] oauth welcome email error:", err);
  }
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
