import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerHasScope, resolveAuthCaller } from "@/lib/supabase/auth";
import { demoApp, hasSupabaseConfig } from "@/lib/demo-app";

type AppVersionBundle = {
  bundle_path: string | null;
};

type DeletableApp = {
  id: string;
  owner_id: string;
  app_versions?: AppVersionBundle[];
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!hasSupabaseConfig() && slug === demoApp.slug) {
    return NextResponse.json(demoApp);
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured. Only the demo app is available without Supabase env." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const caller = await resolveAuthCaller(req, admin);
  const userId = caller?.userId ?? null;

  const { data: app, error } = await admin
    .from("apps")
    .select("*, app_versions(*)")
    .eq("slug", slug)
    .order("version", { foreignTable: "app_versions", ascending: false })
    .limit(1, { foreignTable: "app_versions" })
    .single();

  if (error || !app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  if (!app.public && (app.owner_id !== userId || !callerHasScope(caller, "read"))) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const latestVersion = app.app_versions?.[0];

  return NextResponse.json({
    id: app.id,
    slug: app.slug,
    name: app.name,
    runtime: app.runtime,
    entrypoint: app.entrypoint,
    handler: app.handler,
    public: app.public,
    input_schema: latestVersion?.input_schema ?? {},
    output_schema: latestVersion?.output_schema ?? {},
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const caller = await resolveAuthCaller(req, admin);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!callerHasScope(caller, "publish")) {
    return NextResponse.json({ error: "Missing publish scope" }, { status: 403 });
  }

  const { data: app, error } = await admin
    .from("apps")
    .select("id, owner_id, app_versions(bundle_path)")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load app" }, { status: 500 });
  }

  if (!app || (app as DeletableApp).owner_id !== caller.userId) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const deletableApp = app as DeletableApp;
  const bundlePaths = Array.from(
    new Set(
      (deletableApp.app_versions ?? [])
        .map((version) => version.bundle_path)
        .filter((path): path is string => Boolean(path))
    )
  );

  if (bundlePaths.length > 0) {
    const { error: storageError } = await admin
      .storage
      .from("app-bundles")
      .remove(bundlePaths);

    if (storageError) {
      return NextResponse.json({ error: "Failed to delete app bundles" }, { status: 500 });
    }
  }

  const { data: deletedRows, error: deleteError } = await admin
    .from("apps")
    .delete()
    .eq("id", deletableApp.id)
    .eq("owner_id", caller.userId)
    .select("id");

  if (deleteError) {
    return NextResponse.json({ error: "Failed to delete app" }, { status: 500 });
  }

  if (!deletedRows || deletedRows.length !== 1) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true, slug });
}
