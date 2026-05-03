// Transactional email delivery for Floom (floom-minimal / floom.dev).
//
// Provider: Resend (https://resend.com). Lifted and adapted from the legacy
// floomhq/floom monorepo (apps/server/src/lib/email.ts).
//
// Sender: `Floom <team@send.floom.dev>`. The `send.floom.dev` subdomain
// carries the Resend DKIM key (resend._domainkey.send.floom.dev). Root
// floom.dev SPF already includes amazonses.com, which is what Resend routes
// through.
//
// Graceful degradation: when `RESEND_API_KEY` is unset (local dev, preview,
// self-host), every call logs the intended payload to stdout and returns ok.
// This keeps dev/preview working without requiring provider credentials. Set
// the env var in Production to enable real delivery.

import { Resend } from "resend";

const DEFAULT_FROM = "Floom <team@send.floom.dev>";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailResult {
  ok: boolean;
  /** Provider-assigned message id when ok, or a short reason when not. */
  id?: string;
  reason?: string;
}

let cachedClient: Resend | null | undefined;

function getClient(): Resend | null {
  if (cachedClient !== undefined) return cachedClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(
      "[email] RESEND_API_KEY is not set — transactional emails will be logged " +
        "to stdout instead of delivered. Set the env var to enable real delivery " +
        "via Resend (https://resend.com).",
    );
    cachedClient = null;
    return null;
  }
  cachedClient = new Resend(key);
  return cachedClient;
}

/**
 * Send a transactional email via Resend. Returns `{ ok: true, id }` on
 * success, `{ ok: true, reason: 'stdout_fallback' }` when no API key is
 * configured, and `{ ok: false, reason }` on provider error. Never throws.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const { to, subject, html, text } = payload;
  const client = getClient();
  const from = process.env.RESEND_FROM ?? DEFAULT_FROM;

  if (!client) {
    console.log(
      `[email:stdout] to=${to} subject="${subject}" (set RESEND_API_KEY to deliver)`,
    );
    console.log(`[email:stdout] text:\n${text}`);
    return { ok: true, reason: "stdout_fallback" };
  }

  try {
    const res = await client.emails.send({ from, to, subject, html, text });
    if (res && typeof res === "object" && "error" in res && res.error) {
      const err = res.error as { name?: string; message?: string };
      const reason =
        `resend_error: ${err.name ?? "unknown"} ${err.message ?? ""}`.trim();
      console.error(
        `[email] send failed to=${to} subject="${subject}" ${reason}`,
      );
      return { ok: false, reason };
    }
    const id =
      res &&
      typeof res === "object" &&
      "data" in res &&
      res.data &&
      typeof res.data === "object" &&
      "id" in res.data
        ? String(res.data.id)
        : undefined;
    return { ok: true, id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(
      `[email] send threw to=${to} subject="${subject}" ${reason}`,
    );
    return { ok: false, reason };
  }
}

/** Tests only. Drops the cached client so env-var changes take effect. */
export function _resetEmailForTests(): void {
  cachedClient = undefined;
}
