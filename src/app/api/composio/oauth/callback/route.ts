import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthCaller } from "@/lib/supabase/auth";

/**
 * Timing-safe comparison for hex-encoded nonces.
 * Returns false for any length mismatch or invalid hex input.
 */
function safeCompareHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

// Composio redirects here after the user completes (or cancels) OAuth.
// Query params from Composio: connectedAccountId (the composio account id), status, state (nonce)
// We match by composio_account_id and update the row accordingly.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;

  // Composio sends either connectedAccountId or connected_account_id
  const composioAccountId =
    searchParams.get("connectedAccountId") ??
    searchParams.get("connected_account_id") ??
    searchParams.get("connectionId") ??
    searchParams.get("id");

  // The CSRF nonce is carried as ?nonce= in our callback URL (not via Composio's state param,
  // which requires a specific object format in the v3 API).
  const returnedState = searchParams.get("nonce") ?? searchParams.get("state") ?? null;
  const rawStatus = (searchParams.get("status") ?? "").toUpperCase();

  if (!composioAccountId) {
    return NextResponse.redirect(
      `${origin}/connections?error=missing_connection_id`,
      { status: 302 }
    );
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Load the pending connection row to verify state_nonce and user_id
  const { data: pendingRow, error: lookupError } = await admin
    .from("composio_connections")
    .select("id, user_id, state_nonce")
    .eq("composio_account_id", composioAccountId)
    .eq("status", "pending")
    .maybeSingle();

  if (lookupError || !pendingRow) {
    return NextResponse.redirect(
      `${origin}/connections?error=invalid_callback`,
      { status: 302 }
    );
  }

  // Verify CSRF state nonce when it was set on the pending row.
  // Use a timing-safe comparison to prevent timing-based nonce enumeration.
  if (pendingRow.state_nonce !== null && pendingRow.state_nonce !== undefined) {
    if (!returnedState || !safeCompareHex(returnedState, pendingRow.state_nonce)) {
      // Delete the pending row to prevent reuse and log the attempt
      await admin
        .from("composio_connections")
        .delete()
        .eq("id", pendingRow.id);
      console.error(
        `[composio/oauth/callback] CSRF mismatch for composio_account_id=${composioAccountId}: ` +
          `expected nonce (masked), got state=${returnedState ?? "(none)"}`
      );
      return NextResponse.redirect(
        `${origin}/connections?error=invalid_callback`,
        { status: 302 }
      );
    }
  }

  // Verify the session user matches the connection owner (when a session is available)
  const caller = await resolveAuthCaller(req, admin);
  if (caller && caller.kind === "user" && caller.userId !== pendingRow.user_id) {
    await admin
      .from("composio_connections")
      .delete()
      .eq("id", pendingRow.id);
    console.error(
      `[composio/oauth/callback] User mismatch for composio_account_id=${composioAccountId}: ` +
        `session user=${caller.userId}, connection owner=${pendingRow.user_id}`
    );
    return NextResponse.redirect(
      `${origin}/connections?error=invalid_callback`,
      { status: 302 }
    );
  }

  const isSuccess = rawStatus === "ACTIVE" || rawStatus === "" || rawStatus === "SUCCESS";

  if (isSuccess) {
    // Verify with Composio that the account is actually active
    const apiKey = process.env.COMPOSIO_API_KEY;
    let verifiedStatus = "active";

    if (apiKey) {
      try {
        const composioRes = await fetch(
          `https://backend.composio.dev/api/v3/connected_accounts/${encodeURIComponent(composioAccountId)}`,
          {
            headers: { "x-api-key": apiKey },
            cache: "no-store",
          }
        );

        if (composioRes.ok) {
          const data = await composioRes.json() as { status?: string };
          const status = (data.status ?? "").toUpperCase();
          if (status === "ACTIVE") {
            verifiedStatus = "active";
          } else if (status === "FAILED" || status === "ERROR") {
            verifiedStatus = "failed";
          }
          // INITIATED means still in progress — keep as pending
          else if (status === "INITIATED") {
            verifiedStatus = "pending";
          }
        }
      } catch {
        // If verification fails, trust the callback status and mark active
      }
    }

    const { error } = await admin
      .from("composio_connections")
      .update({
        status: verifiedStatus,
        revoked_at: null,
        updated_at: now,
      })
      .eq("id", pendingRow.id);

    if (error) {
      return NextResponse.redirect(
        `${origin}/connections?error=db_update_failed`,
        { status: 302 }
      );
    }

    if (verifiedStatus === "active") {
      return NextResponse.redirect(
        `${origin}/connections?connected=1`,
        { status: 302 }
      );
    }

    // Still pending or failed — show appropriate state
    return NextResponse.redirect(
      `${origin}/connections?status=${verifiedStatus}`,
      { status: 302 }
    );
  }

  // Failed / cancelled
  const { error } = await admin
    .from("composio_connections")
    .update({
      status: "failed",
      updated_at: now,
    })
    .eq("id", pendingRow.id);

  if (error) {
    return NextResponse.redirect(
      `${origin}/connections?error=db_update_failed`,
      { status: 302 }
    );
  }

  return NextResponse.redirect(
    `${origin}/connections?error=oauth_failed`,
    { status: 302 }
  );
}
