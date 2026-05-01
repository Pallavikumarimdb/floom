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

const MAX_SECRET_VALUE_BYTES = 32 * 1024;

type OwnedApp = {
  id: string;
  owner_id: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireOwnedApp(req, (await params).slug, "read");
  if ("response" in auth) {
    return auth.response;
  }

  const { data, error } = await auth.admin
    .from("app_secrets")
    .select("name, created_at, updated_at")
    .eq("app_id", auth.app.id)
    .eq("owner_id", auth.app.owner_id)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to list app secrets" }, { status: 500 });
  }

  return NextResponse.json({ secrets: (data ?? []) as RuntimeSecretMetadata[] });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireOwnedApp(req, (await params).slug, "publish");
  if ("response" in auth) {
    return auth.response;
  }

  if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const value = typeof body.value === "string" ? body.value : null;

  if (!isValidSecretName(name)) {
    return NextResponse.json(
      { error: "Secret name must be an uppercase environment variable name" },
      { status: 400 }
    );
  }

  if (value === null || value === "") {
    return NextResponse.json({ error: "Secret value is required" }, { status: 400 });
  }

  if (Buffer.byteLength(value, "utf8") > MAX_SECRET_VALUE_BYTES) {
    return NextResponse.json({ error: "Secret value is too large" }, { status: 413 });
  }

  let valueCiphertext: string;
  try {
    valueCiphertext = encryptSecretValue(value);
  } catch {
    return NextResponse.json({ error: "App secrets are not configured" }, { status: 503 });
  }

  const { data, error } = await auth.admin
    .from("app_secrets")
    .upsert(
      {
        app_id: auth.app.id,
        owner_id: auth.app.owner_id,
        name,
        value_ciphertext: valueCiphertext,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "app_id,name" }
    )
    .select("name, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to store app secret" }, { status: 500 });
  }

  return NextResponse.json({ secret: data as RuntimeSecretMetadata });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireOwnedApp(req, (await params).slug, "publish");
  if ("response" in auth) {
    return auth.response;
  }

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

  const { error } = await auth.admin
    .from("app_secrets")
    .delete()
    .eq("app_id", auth.app.id)
    .eq("owner_id", auth.app.owner_id)
    .eq("name", name);

  if (error) {
    return NextResponse.json({ error: "Failed to delete app secret" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, name });
}

async function requireOwnedApp(req: NextRequest, slug: string, scope: "read" | "publish") {
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
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!callerHasScope(caller, scope)) {
    return { response: NextResponse.json({ error: `Missing ${scope} scope` }, { status: 403 }) };
  }

  const { data: app, error } = await admin
    .from("apps")
    .select("id, owner_id")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !app) {
    return { response: NextResponse.json({ error: "App not found" }, { status: 404 }) };
  }

  if ((app as OwnedApp).owner_id !== caller.userId) {
    return { response: NextResponse.json({ error: "App not found" }, { status: 404 }) };
  }

  return { admin, caller, app: app as OwnedApp };
}
