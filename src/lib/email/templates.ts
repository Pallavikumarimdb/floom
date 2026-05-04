// Transactional email templates for Floom.
//
// Lifted directly from floomhq/floom (apps/server/src/lib/email.ts) and
// adapted to floom-minimal's module structure.
//
// All templates are table-based inline-style HTML — no flexbox, no
// external CSS — for broad email client compatibility (Gmail strips
// <style> tags; Outlook ignores half the CSS spec).
//
// Palette mirrors src/app/globals.css tokens:
//   --bg:          #fafaf8  (warm off-white page background)
//   --line-soft:   #f1efe9  (header band — same family as --studio #f5f4f0)
//   --card:        #ffffff
//   --line:        #e8e6e0
//   --ink:         #0e0e0c  (near-black, never pure #000)
//   --muted:       #585550
//
// Typography: Inter for all text — matches --font-display on the site.
// Georgia is intentionally NOT used; the site brand is Inter everywhere.

// ─────────────────────────────────────────────────────────────────────────
// Palette + typography constants
// ─────────────────────────────────────────────────────────────────────────

// Synced to globals.css :root tokens — update both together if palette changes.
const EMAIL_BG = "#fafaf8";    // --bg
const EMAIL_BAND = "#f1efe9";  // --line-soft (warm header band)
const EMAIL_CARD = "#ffffff";  // --card
const EMAIL_LINE = "#e8e6e0";  // --line
const EMAIL_INK = "#0e0e0c";   // --ink
const EMAIL_MUTED = "#585550"; // --muted
const SANS =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Origin for hosted brand assets. Defaults to floom.dev so preview
 * deployments still show the real logo.
 */
function getAssetBaseUrl(): string {
  const raw =
    process.env.FLOOM_EMAIL_ASSET_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://floom.dev";
  return raw.replace(/\/+$/, "");
}

// ─────────────────────────────────────────────────────────────────────────
// Shared chrome (header + footer)
// ─────────────────────────────────────────────────────────────────────────

interface BaseLayoutOpts {
  heading: string;
  body: string;
  preheader?: string;
  /** Rendered as a subtle unsubscribe link in the footer when present. */
  unsubscribeUrl?: string;
}

function baseLayout({
  heading,
  body,
  preheader,
  unsubscribeUrl,
}: BaseLayoutOpts): string {
  const preheaderBlock = preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>`
    : "";

  const assetBase = getAssetBaseUrl();
  // Cache-bust via COMMIT_SHA so Gmail's image proxy picks up logo changes.
  const cacheBust = process.env.COMMIT_SHA ?? "dev";
  const logoPng = `${assetBase}/brand/logo-email.png?v=${cacheBust}`;
  const logoPng2x = `${assetBase}/brand/logo-email@2x.png?v=${cacheBust}`;

  // logo-email.png is 200×60px; @2x is 400×120px.
  const logoBlock = `<img src="${escapeHtml(logoPng)}" srcset="${escapeHtml(logoPng)} 1x, ${escapeHtml(logoPng2x)} 2x" width="200" height="60" alt="Floom" style="display:block;border:0;outline:none;text-decoration:none;width:200px;height:60px;max-width:100%;">`;

  const unsubscribeBlock = unsubscribeUrl
    ? `<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:${EMAIL_MUTED};text-decoration:underline;">Unsubscribe</a>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Floom</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL_BG};font-family:${SANS};color:${EMAIL_INK};-webkit-font-smoothing:antialiased;">
${preheaderBlock}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_BG};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

<tr><td style="background:${EMAIL_BAND};border:1px solid ${EMAIL_LINE};border-bottom:none;border-radius:14px 14px 0 0;padding:28px 32px;">
${logoBlock}
</td></tr>

<tr><td style="background:${EMAIL_CARD};border:1px solid ${EMAIL_LINE};border-top:none;border-radius:0 0 14px 14px;padding:40px 40px 44px;">
<h1 style="margin:0 0 24px;font-family:${SANS};font-size:28px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:${EMAIL_INK};">${heading}</h1>
${body}
</td></tr>

<tr><td style="padding:28px 4px 4px;font-family:${SANS};font-size:12px;line-height:1.6;color:${EMAIL_MUTED};">
<a href="https://floom.dev" style="color:${EMAIL_INK};font-weight:600;text-decoration:none;">Floom</a> &middot; <a href="mailto:team@floom.dev" style="color:${EMAIL_MUTED};text-decoration:underline;">team@floom.dev</a>${unsubscribeBlock}
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;"><tr><td style="border-radius:8px;background:${EMAIL_INK};"><a href="${safeHref}" style="display:inline-block;background:${EMAIL_INK};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-family:${SANS};font-size:15px;font-weight:600;letter-spacing:-0.01em;">${safeLabel}</a></td></tr></table>`;
}

function fallbackLink(href: string): string {
  const safe = escapeHtml(href);
  return `<p style="font-family:${SANS};font-size:13px;line-height:1.55;margin:0 0 16px;color:${EMAIL_MUTED};">Or paste this link into your browser:<br><a href="${safe}" style="color:${EMAIL_MUTED};word-break:break-all;">${safe}</a></p>`;
}

function bodyParagraph(html: string): string {
  return `<p style="font-family:${SANS};font-size:15px;line-height:1.6;margin:0 0 16px;color:${EMAIL_INK};">${html}</p>`;
}

function mutedParagraph(html: string): string {
  return `<p style="font-family:${SANS};font-size:13px;line-height:1.55;margin:16px 0 0;color:${EMAIL_MUTED};">${html}</p>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────


// --- Quota warning (80% soft cap) ---

export interface QuotaWarningTemplateInput {
  name?: string | null;
  publicUrl: string;
  percentUsed: number;
  resetAtUtc: string;
}

export function renderQuotaWarningEmail(input: QuotaWarningTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Floom: ${input.percentUsed}% of today's compute used`;
  const greeting = input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,";
  const safeReset = escapeHtml(input.resetAtUtc);
  const appsUrl = `${input.publicUrl.replace(/\/+$/, "")}/studio`;

  const body = [
    bodyParagraph(greeting),
    bodyParagraph(
      `Your apps have used <strong>${input.percentUsed}%</strong> of your daily E2B compute quota. ` +
      `Your quota resets at midnight UTC on <strong>${safeReset}</strong>.`,
    ),
    bodyParagraph(
      "When you reach 100%, new runs will be blocked until the reset. Review your apps and pause any running over-budget.",
    ),
    ctaButton(appsUrl, "View your apps"),
    mutedParagraph(
      "Need a higher quota? Reply to this email — we can sort it out.",
    ),
  ].join("\n");

  const text = [
    input.name ? `Hi ${input.name},` : "Hi,",
    "",
    `Your apps have used ${input.percentUsed}% of your daily E2B compute quota.`,
    `Quota resets at midnight UTC on ${input.resetAtUtc}.`,
    "",
    "When you reach 100%, new runs will be blocked until the reset.",
    "",
    appsUrl,
    "",
    "Need a higher quota? Reply to this email.",
    "",
    "Floom",
    "team@floom.dev",
  ].join("\n");

  return {
    subject,
    html: baseLayout({
      heading: `${input.percentUsed}% of daily quota used`,
      body,
      preheader: `Your Floom apps have used ${input.percentUsed}% of today's compute budget.`,
    }),
    text,
  };
}

// --- Welcome (first sign-up) ---

export interface WelcomeTemplateInput {
  name?: string | null;
  publicUrl: string;
  unsubscribeUrl?: string;
}

export function renderWelcomeEmail(input: WelcomeTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Your Floom account is live";
  const greeting = input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,";
  // Send new users to root — the authenticated home page shows studio.
  const appsUrl = `${input.publicUrl.replace(/\/+$/, "")}`;

  const body = [
    bodyParagraph(greeting),
    bodyParagraph(
      "Floom turns Claude-built apps into shareable URLs. No servers, no deployment, no setup. Anyone can run your app from a link or call it via API.",
    ),
    ctaButton(appsUrl, "Open Floom"),
    bodyParagraph("Three things you can do in your first 60 seconds:"),
    `<ol style="font-family:${SANS};font-size:15px;line-height:1.7;margin:0 0 16px;padding-left:20px;color:${EMAIL_INK};">` +
      "<li>Open Floom and describe your app</li>" +
      "<li>Click Deploy to get a live URL</li>" +
      "<li>Share the URL or wire it into a workflow</li>" +
      "</ol>",
    mutedParagraph(
      'Want to use the CLI? Run <code style="font-family:monospace;font-size:12px;">npx @floomhq/cli@latest auth login</code> to authenticate.',
    ),
    mutedParagraph(
      "Need help? Reply to this email. A human reads every one.",
    ),
  ].join("\n");

  const text = [
    input.name ? `Hi ${input.name},` : "Hi,",
    "",
    "Floom turns Claude-built apps into shareable URLs. No servers, no deployment, no setup.",
    "",
    "Open Floom: " + appsUrl,
    "",
    "Three things you can do in your first 60 seconds:",
    "1. Open Floom and describe your app",
    "2. Click Deploy to get a live URL",
    "3. Share the URL or wire it into a workflow",
    "",
    "Want to use the CLI? Run: npx @floomhq/cli@latest auth login",
    "",
    "Need help? Reply to this email. A human reads every one.",
    "",
    "Floom",
    "team@floom.dev",
  ].join("\n");

  return {
    subject,
    html: baseLayout({
      heading: "Welcome to Floom",
      body,
      preheader:
        "Open Floom and turn your Claude app idea into a live URL in under a minute.",
      unsubscribeUrl: input.unsubscribeUrl,
    }),
    text,
  };
}

// --- App published ---

export interface AppPublishedTemplateInput {
  name?: string | null;
  appName: string;
  appUrl: string;
  publicUrl: string;
}

export function renderAppPublishedEmail(input: AppPublishedTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Your app "${input.appName}" is live on Floom`;
  const greeting = input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,";
  const safeAppName = escapeHtml(input.appName);

  const body = [
    bodyParagraph(greeting),
    bodyParagraph(
      `<strong>${safeAppName}</strong> is live. Anyone with the link can run it right now.`,
    ),
    ctaButton(input.appUrl, "Open your app"),
    fallbackLink(input.appUrl),
    mutedParagraph(
      "Need to update it? Push a new version with <code style=\"font-family:monospace;font-size:12px;\">floom deploy</code>; the URL stays the same.",
    ),
  ].join("\n");

  const text = [
    input.name ? `Hi ${input.name},` : "Hi,",
    "",
    `"${input.appName}" is live on Floom:`,
    input.appUrl,
    "",
    "Need to update it? Run `floom deploy`; the URL stays the same.",
    "",
    "Floom",
    "team@floom.dev",
  ].join("\n");

  return {
    subject,
    html: baseLayout({
      heading: "Your app is live",
      body,
      preheader: `${input.appName} is published and ready to run on floom.dev.`,
    }),
    text,
  };
}

// --- Password reset (Supabase auth.resetPasswordForEmail fires this via hook) ---

export interface ResetPasswordTemplateInput {
  name?: string | null;
  resetUrl: string;
}

export function renderResetPasswordEmail(
  input: ResetPasswordTemplateInput,
): { subject: string; html: string; text: string } {
  const subject = "Reset your Floom password";
  const greeting = input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,";

  const body = [
    bodyParagraph(greeting),
    bodyParagraph(
      "We got a request to reset the password on your Floom account. Click the button below to choose a new one.",
    ),
    ctaButton(input.resetUrl, "Reset password"),
    fallbackLink(input.resetUrl),
    mutedParagraph(
      "If you didn't request this, ignore this email. The link expires in 1 hour.",
    ),
  ].join("\n");

  const text = [
    input.name ? `Hi ${input.name},` : "Hi,",
    "",
    "We got a request to reset the password on your Floom account.",
    "Open this link to choose a new one:",
    "",
    input.resetUrl,
    "",
    "If you didn't request this, ignore this email. The link expires in 1 hour.",
    "",
    "Floom",
    "team@floom.dev",
  ].join("\n");

  return {
    subject,
    html: baseLayout({
      heading: "Reset your password",
      body,
      preheader:
        "Set a new password on your Floom account. Link valid for one hour.",
    }),
    text,
  };
}

// --- Email verification ---

export interface VerificationTemplateInput {
  name?: string | null;
  verifyUrl: string;
}

export function renderVerificationEmail(
  input: VerificationTemplateInput,
): { subject: string; html: string; text: string } {
  const subject = "Verify your Floom email";
  const greeting = input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,";

  const body = [
    bodyParagraph(greeting),
    bodyParagraph(
      "Click the button below to verify your email and finish setting up your Floom account.",
    ),
    ctaButton(input.verifyUrl, "Verify email"),
    fallbackLink(input.verifyUrl),
    mutedParagraph(
      "If you did not create this account, you can ignore this email.",
    ),
  ].join("\n");

  const text = [
    input.name ? `Hi ${input.name},` : "Hi,",
    "",
    "Verify your email to finish setting up your Floom account:",
    "",
    input.verifyUrl,
    "",
    "If you did not create this account, you can ignore this email.",
    "",
    "Floom",
    "team@floom.dev",
  ].join("\n");

  return {
    subject,
    html: baseLayout({
      heading: "Verify your email",
      body,
      preheader:
        "One click to confirm this is your address and finish setup.",
    }),
    text,
  };
}

// --- App invite ---

export interface AppInviteTemplateInput {
  appName: string;
  inviterName?: string | null;
  acceptUrl: string;
}

export function renderAppInviteEmail(input: AppInviteTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `You're invited to ${input.appName} on Floom`;
  const inviter = input.inviterName ?? "A Floom user";
  const safeAppName = escapeHtml(input.appName);
  const safeInviter = escapeHtml(inviter);

  const body = [
    bodyParagraph(
      `${safeInviter} invited you to run <strong>${safeAppName}</strong> on Floom.`,
    ),
    bodyParagraph(
      "Create or sign in to your account, then accept the invite to get access.",
    ),
    ctaButton(input.acceptUrl, "Open invite"),
    fallbackLink(input.acceptUrl),
    mutedParagraph(
      "If you were not expecting this invite, you can ignore this email.",
    ),
  ].join("\n");

  const text = [
    `${inviter} invited you to run ${input.appName} on Floom.`,
    "",
    "Create or sign in to your account, then accept the invite to get access:",
    input.acceptUrl,
    "",
    "If you were not expecting this invite, you can ignore this email.",
    "",
    "Floom",
    "team@floom.dev",
  ].join("\n");

  return {
    subject,
    html: baseLayout({
      heading: "You have a Floom invite",
      body,
      preheader: `${inviter} invited you to run ${input.appName}.`,
    }),
    text,
  };
}
