import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerHasScope, resolveAuthCaller } from "@/lib/supabase/auth";
import { demoApp, hasSupabaseConfig } from "@/lib/demo-app";

// Maximum source size to return inline (100 KB). Larger bundles are tarballs
// and shouldn't be diffed in the browser.
const MAX_SOURCE_DISPLAY_BYTES = 100 * 1024;

/**
 * GET /api/apps/[slug]/source
 *
 * Returns the source code for a public app (or an owned private app).
 * For single_file bundles: returns { kind: "single_file", filename, content }.
 * For tarball bundles: returns { kind: "tarball", message } — we don't
 * extract and inline tarballs here; the caller can display the API endpoint
 * or a download link.
 *
 * Access rules (v0.4 — no per-layer visibility yet):
 *   - Public apps: anyone can fetch source.
 *   - Private apps: owner only.
 * Per-layer source visibility (share_source flag) will be added in v0.5.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!hasSupabaseConfig()) {
    if (slug === demoApp.slug) {
      // Return a synthetic source for the demo app so the Source tab works
      // without Supabase configured.
      return NextResponse.json({
        kind: "single_file",
        filename: "app.py",
        content: [
          "# Demo app — no Supabase configured",
          "# This is the handler Floom calls for each run.",
          "",
          "def run(inputs: dict) -> dict:",
          '    name = inputs.get("name", "world")',
          '    return {"greeting": f"Hello, {name}!"}',
        ].join("\n"),
      });
    }
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const caller = await resolveAuthCaller(req, admin);
  const userId = caller?.userId ?? null;

  const { data: app, error } = await admin
    .from("apps")
    .select("id, slug, name, owner_id, public, entrypoint, handler, app_versions(id, bundle_path, bundle_kind)")
    .eq("slug", slug)
    .order("version", { foreignTable: "app_versions", ascending: false })
    .limit(1, { foreignTable: "app_versions" })
    .single();

  if (error || !app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const isOwner = userId === app.owner_id;

  // Access check: public apps are open; private apps need the owner.
  if (!app.public && (!isOwner || !callerHasScope(caller, "read"))) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const latestVersion = (app as typeof app & {
    app_versions?: Array<{ id: string; bundle_path: string | null; bundle_kind: string | null }>;
  }).app_versions?.[0];

  if (!latestVersion?.bundle_path) {
    // Legacy single-file apps store the handler inline on apps.handler.
    const inlineHandler = (app as typeof app & { handler?: string | null }).handler;
    if (inlineHandler) {
      return NextResponse.json({
        kind: "single_file",
        filename: (app as typeof app & { entrypoint?: string | null }).entrypoint ?? "app.py",
        content: inlineHandler,
      });
    }
    return NextResponse.json(
      { error: "Source not available for this app." },
      { status: 404 }
    );
  }

  const bundleKind = latestVersion.bundle_kind ?? "single_file";

  if (bundleKind === "tarball") {
    // Multi-file bundles: we don't extract inline.
    return NextResponse.json({
      kind: "tarball",
      message:
        "This app is deployed as a multi-file bundle. Source cannot be displayed inline.",
    });
  }

  // single_file — download from storage and return.
  const { data: blob, error: dlError } = await admin.storage
    .from("app-bundles")
    .download(latestVersion.bundle_path);

  if (dlError || !blob) {
    return NextResponse.json(
      { error: "Source file could not be retrieved." },
      { status: 502 }
    );
  }

  if (blob.size > MAX_SOURCE_DISPLAY_BYTES) {
    return NextResponse.json({
      kind: "single_file_too_large",
      message: `Source file is ${Math.round(blob.size / 1024)} KB — too large to display inline.`,
    });
  }

  const content = await blob.text();
  const entrypoint = (app as typeof app & { entrypoint?: string | null }).entrypoint ?? "app.py";

  return NextResponse.json({
    kind: "single_file",
    filename: entrypoint,
    content,
  });
}
