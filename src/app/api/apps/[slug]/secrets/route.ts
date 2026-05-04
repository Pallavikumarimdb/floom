import { NextRequest, NextResponse } from "next/server";
import { hasSupabaseConfig } from "@/lib/demo-app";
import { MAX_REQUEST_BYTES } from "@/lib/floom/limits";
import {
  encryptSecretValue,
  isValidSecretName,
  type RuntimeSecretMetadata,
} from "@/lib/floom/runtime-secrets";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerHasScope, resolveAuthCaller } from "@/lib/supabase/auth";
import type { AuthCaller } from "@/lib/supabase/auth";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_SECRET_VALUE_BYTES = 32 * 1024;

// Prevents shared/CDN caches from storing user-private secret metadata.
const PRIVATE_CACHE = { "Cache-Control": "private, no-store" } as const;

type OwnedApp = {
  id: string;
  owner_id: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAuthForApp(req, (await params).slug, "read");
  if ("response" in auth) {
    return auth.response;
  }

  const { admin, caller, app } = auth;

  // Owner sees: shared secrets + their own per_runner secrets.
  // Non-owner sees: only their own per_runner secrets.
  const isOwner = caller.userId === app.owner_id;

  let query = admin
    .from("app_secrets")
    .select("name, scope, created_at, updated_at")
    .eq("app_id", app.id);

  if (isOwner) {
    // Return shared secrets OR this caller's own per_runner secrets.
    query = query.or(
      `scope.eq.shared,and(scope.eq.per_runner,runner_user_id.eq.${caller.userId})`
    );
  } else {
    // Non-owner: only their own per_runner secrets.
    query = query
      .eq("scope", "per_runner")
      .eq("runner_user_id", caller.userId);
  }

  const { data, error } = await query.order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to list app secrets" }, { status: 500 });
  }

  return NextResponse.json(
    { secrets: (data ?? []) as RuntimeSecretMetadata[] },
    { headers: PRIVATE_CACHE },
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAuthForApp(req, (await params).slug, "publish");
  if ("response" in auth) {
    return auth.response;
  }

  const { admin, caller, app } = auth;

  if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const value = typeof body.value === "string" ? body.value : null;

  // Accept scope from body; normalize "per-runner" (hyphen) legacy alias.
  const rawScope = typeof body.scope === "string" ? body.scope.trim() : null;
  const scope =
    rawScope === "shared"
      ? "shared"
      : rawScope === "per_runner" || rawScope === "per-runner"
      ? "per_runner"
      : null; // will default below after validation

  if (!isValidSecretName(name)) {
    return NextResponse.json(
      { error: "Secret name must be an uppercase environment variable name" },
      { status: 400 }
    );
  }

  if (scope !== null && scope !== "shared" && scope !== "per_runner") {
    return NextResponse.json(
      { error: 'scope must be "shared" or "per_runner"' },
      { status: 400 }
    );
  }

  if (value === null || value === "") {
    return NextResponse.json({ error: "Secret value is required" }, { status: 400 });
  }

  if (Buffer.byteLength(value, "utf8") > MAX_SECRET_VALUE_BYTES) {
    return NextResponse.json({ error: "Secret value is too large" }, { status: 413 });
  }

  // Permission check:
  //   shared:     only the app owner can set
  //   per_runner: any authenticated caller can set their own value
  // Default: if no scope supplied, owner defaults to shared, non-owner defaults to per_runner.
  const isOwner = caller.userId === app.owner_id;
  const resolvedScope: "shared" | "per_runner" =
    scope !== null ? scope : isOwner ? "shared" : "per_runner";

  if (resolvedScope === "shared" && !isOwner) {
    return NextResponse.json(
      { error: "Only the app owner can set shared secrets" },
      { status: 403, headers: PRIVATE_CACHE }
    );
  }

  const runner_user_id = resolvedScope === "per_runner" ? caller.userId : null;

  let valueCiphertext: string;
  try {
    valueCiphertext = encryptSecretValue(value);
  } catch {
    return NextResponse.json({ error: "App secrets are not configured" }, { status: 503 });
  }

  // Build the upsert record. For per_runner rows the unique index is on
  // (app_id, name, COALESCE(runner_user_id, '00000000-0000-0000-0000-000000000000')).
  // PostgREST onConflict only supports a plain constraint name or comma-separated
  // columns when no expression is involved. Because this index uses COALESCE,
  // we do a manual select-then-upsert to avoid the HTTP 500 from the bad
  // onConflict parameter that was here before.
  const upsertError = await upsertSecret(admin, {
    app_id: app.id,
    owner_id: app.owner_id,
    name,
    scope: resolvedScope,
    runner_user_id,
    value_ciphertext: valueCiphertext,
  });

  if (upsertError) {
    return NextResponse.json({ error: "Failed to store app secret" }, { status: 500 });
  }

  // RLS on app_secrets blocks SELECT even for service_role (using: false policy).
  // Return a synthesised metadata record; the secret was written if no error above.
  const now = new Date().toISOString();
  return NextResponse.json(
    { secret: { name, created_at: now, updated_at: now } as RuntimeSecretMetadata },
    { headers: PRIVATE_CACHE },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAuthForApp(req, (await params).slug, "publish");
  if ("response" in auth) {
    return auth.response;
  }

  const { admin, caller, app } = auth;

  if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!isValidSecretName(name)) {
    return NextResponse.json(
      { error: "Secret name must be an uppercase environment variable name" },
      { status: 400 }
    );
  }

  const rawScope = typeof body.scope === "string" ? body.scope.trim() : null;
  const scope =
    rawScope === "shared"
      ? "shared"
      : rawScope === "per_runner" || rawScope === "per-runner"
      ? "per_runner"
      : null;

  const isOwner = caller.userId === app.owner_id;
  // Default: owner defaults to shared, non-owner to per_runner.
  const resolvedScope: "shared" | "per_runner" =
    scope !== null ? scope : isOwner ? "shared" : "per_runner";

  if (resolvedScope === "shared" && !isOwner) {
    return NextResponse.json(
      { error: "Only the app owner can delete shared secrets" },
      { status: 403, headers: PRIVATE_CACHE }
    );
  }

  let query = admin
    .from("app_secrets")
    .delete()
    .eq("app_id", app.id)
    .eq("name", name)
    .eq("scope", resolvedScope);

  if (resolvedScope === "per_runner") {
    query = query.eq("runner_user_id", caller.userId);
  } else {
    query = query.is("runner_user_id", null);
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to delete app secret" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, name });
}

/**
 * Manually upsert a secret row, avoiding PostgREST's onConflict limitation
 * with expression-based unique indexes (COALESCE in this case).
 *
 * Strategy: try INSERT, if it fails with a unique violation (23505) do UPDATE.
 * This is safe under the admin client (bypasses RLS) and is idempotent.
 */
async function upsertSecret(
  admin: SupabaseClient,
  row: {
    app_id: string;
    owner_id: string;
    name: string;
    scope: "shared" | "per_runner";
    runner_user_id: string | null;
    value_ciphertext: string;
  }
): Promise<{ message: string } | null> {
  const now = new Date().toISOString();

  // Try INSERT first. On a unique violation (23505 — row already exists),
  // fall through to UPDATE. On any other error, surface it immediately.
  // We avoid PostgREST's onConflict because the unique index uses COALESCE()
  // (an expression), which onConflict cannot resolve by column names alone.
  const { error: insertError } = await admin.from("app_secrets").insert({
    app_id: row.app_id,
    owner_id: row.owner_id,
    name: row.name,
    scope: row.scope,
    runner_user_id: row.runner_user_id,
    value_ciphertext: row.value_ciphertext,
    created_at: now,
    updated_at: now,
  });

  if (!insertError) {
    return null; // inserted successfully
  }

  if (insertError.code !== "23505") {
    return insertError; // unexpected error
  }

  // 23505 unique_violation: row already exists — UPDATE the ciphertext.
  let updateQuery = admin
    .from("app_secrets")
    .update({ value_ciphertext: row.value_ciphertext, updated_at: now })
    .eq("app_id", row.app_id)
    .eq("name", row.name)
    .eq("scope", row.scope);

  if (row.runner_user_id !== null) {
    updateQuery = updateQuery.eq("runner_user_id", row.runner_user_id);
  } else {
    updateQuery = updateQuery.is("runner_user_id", null);
  }

  const { error: updateError } = await updateQuery;
  return updateError ?? null;
}

/**
 * Resolve auth + app for any authenticated caller.
 *
 * Unlike the old requireOwnedApp, this allows non-owners through.
 * Callers must do their own owner check for operations that require it (shared secrets).
 */
async function requireAuthForApp(
  req: NextRequest,
  slug: string,
  scope: "read" | "publish"
): Promise<
  | { response: NextResponse }
  | { admin: SupabaseClient; caller: AuthCaller; app: OwnedApp }
> {
  if (!hasSupabaseConfig()) {
    return {
      response: NextResponse.json(
        { error: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
        { status: 503 }
      ),
    };
  }

  const admin = createAdminClient();
  const caller = await resolveAuthCaller(req, admin);
  if (!caller) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_CACHE }) };
  }

  if (!callerHasScope(caller, scope)) {
    return { response: NextResponse.json({ error: `Missing ${scope} scope` }, { status: 403, headers: PRIVATE_CACHE }) };
  }

  const { data: app, error } = await admin
    .from("apps")
    .select("id, owner_id")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !app) {
    return { response: NextResponse.json({ error: "App not found" }, { status: 404, headers: PRIVATE_CACHE }) };
  }

  // Note: we no longer block non-owners here. The caller object is returned
  // so each handler can check isOwner = caller.userId === app.owner_id.
  return { admin, caller, app: app as OwnedApp };
}
