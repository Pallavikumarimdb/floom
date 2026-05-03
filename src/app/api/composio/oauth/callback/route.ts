import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Composio redirects here after the user completes (or cancels) OAuth.
// Query params from Composio: connectedAccountId (the composio account id), status
// We match by composio_account_id and update the row accordingly.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;

  // Composio sends either connectedAccountId or connected_account_id
  const composioAccountId =
    searchParams.get("connectedAccountId") ??
    searchParams.get("connected_account_id") ??
    searchParams.get("connectionId") ??
    searchParams.get("id");

  const rawStatus = (searchParams.get("status") ?? "").toUpperCase();

  if (!composioAccountId) {
    return NextResponse.redirect(
      `${origin}/connections?error=missing_connection_id`,
      { status: 302 }
    );
  }

  const isSuccess = rawStatus === "ACTIVE" || rawStatus === "" || rawStatus === "SUCCESS";

  const admin = createAdminClient();
  const now = new Date().toISOString();

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
      .eq("composio_account_id", composioAccountId);

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
    .eq("composio_account_id", composioAccountId);

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
