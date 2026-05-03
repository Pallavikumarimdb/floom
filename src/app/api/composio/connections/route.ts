import { NextRequest, NextResponse } from "next/server";
import { hasAgentTokenConfig } from "@/lib/demo-app";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerHasScope, resolveAuthCaller } from "@/lib/supabase/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set(["pending", "active", "revoked", "expired"]);

type ConnectionRow = {
  id: string;
  provider: string;
  composio_account_id: string;
  scopes: string[];
  status: string;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
};

export async function GET(req: NextRequest) {
  if (!hasAgentTokenConfig()) {
    return NextResponse.json(
      { error: "Agent tokens are not configured. Set Supabase service-role env and AGENT_TOKEN_PEPPER." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const caller = await resolveAuthCaller(req, admin);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!callerHasScope(caller, "read")) {
    return NextResponse.json({ error: "Read scope required" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status");
  if (status && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  let query = admin
    .from("composio_connections")
    .select("id, provider, composio_account_id, scopes, status, created_at, updated_at, revoked_at")
    .eq("user_id", caller.userId)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query.returns<ConnectionRow[]>();
  if (error) {
    return NextResponse.json({ error: "Failed to list Composio connections" }, { status: 500 });
  }

  return NextResponse.json({ connections: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  if (!hasAgentTokenConfig()) {
    return NextResponse.json(
      { error: "Agent tokens are not configured. Set Supabase service-role env and AGENT_TOKEN_PEPPER." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const caller = await resolveAuthCaller(req, admin);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!callerHasScope(caller, "publish")) {
    return NextResponse.json({ error: "Publish scope required" }, { status: 403 });
  }

  const connectionId = await readConnectionId(req);
  if (!connectionId || !UUID_RE.test(connectionId)) {
    return NextResponse.json({ error: "connection id must be provided as ?id=<uuid> or JSON { id }" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("composio_connections")
    .update({
      status: "revoked",
      revoked_at: now,
      updated_at: now,
    })
    .eq("id", connectionId)
    .eq("user_id", caller.userId)
    .select("id, provider, composio_account_id, scopes, status, created_at, updated_at, revoked_at")
    .maybeSingle<ConnectionRow>();

  if (error) {
    return NextResponse.json({ error: "Failed to disconnect Composio connection" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, connection: data });
}

async function readConnectionId(req: NextRequest) {
  const queryId = req.nextUrl.searchParams.get("id") ?? req.nextUrl.searchParams.get("connection_id");
  if (queryId) {
    return queryId;
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const value = (body as Record<string, unknown>).id ?? (body as Record<string, unknown>).connection_id;
  return typeof value === "string" ? value : null;
}
