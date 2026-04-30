import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoApp, hasSupabaseConfig } from "@/lib/demo-app";

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
  const authHeader = req.headers.get("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    userId = userData.user?.id ?? null;
  }

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

  if (!app.public && app.owner_id !== userId) {
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
