import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import yaml from "js-yaml";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const manifestFile = form.get("manifest") as File | null;
  const bundleFile = form.get("bundle") as File | null;
  const inputSchemaFile = form.get("input_schema") as File | null;
  const outputSchemaFile = form.get("output_schema") as File | null;

  if (!manifestFile || !bundleFile) {
    return NextResponse.json({ error: "Missing manifest or bundle" }, { status: 400 });
  }

  const manifestText = await manifestFile.text();
  let manifest: any;
  try {
    manifest = yaml.load(manifestText);
  } catch {
    return NextResponse.json({ error: "Invalid floom.yaml" }, { status: 400 });
  }

  const required = ["name", "slug", "runtime", "entrypoint", "handler"];
  for (const key of required) {
    if (!manifest[key]) {
      return NextResponse.json({ error: `Missing ${key} in manifest` }, { status: 400 });
    }
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const ownerId = userData.user.id;

  // Check slug uniqueness
  const { data: existing } = await admin
    .from("apps")
    .select("id")
    .eq("slug", manifest.slug)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
  }

  // Parse schemas
  let inputSchema = {};
  let outputSchema = {};
  try {
    if (inputSchemaFile) inputSchema = JSON.parse(await inputSchemaFile.text());
    if (outputSchemaFile) outputSchema = JSON.parse(await outputSchemaFile.text());
  } catch {
    return NextResponse.json({ error: "Invalid JSON schema" }, { status: 400 });
  }

  // Upload bundle
  const bundleBuffer = Buffer.from(await bundleFile.arrayBuffer());
  const bundlePath = `${ownerId}/${manifest.slug}/${uuidv4()}.zip`;
  const { error: uploadError } = await admin.storage
    .from("app-bundles")
    .upload(bundlePath, bundleBuffer, { contentType: "application/zip" });

  if (uploadError) {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // Create app
  const { data: app, error: appError } = await admin
    .from("apps")
    .insert({
      slug: manifest.slug,
      name: manifest.name,
      owner_id: ownerId,
      runtime: manifest.runtime,
      entrypoint: manifest.entrypoint,
      handler: manifest.handler,
      public: manifest.public ?? false,
    })
    .select()
    .single();

  if (appError || !app) {
    return NextResponse.json({ error: "Failed to create app" }, { status: 500 });
  }

  // Create version
  await admin.from("app_versions").insert({
    app_id: app.id,
    version: 1,
    bundle_path: bundlePath,
    input_schema: inputSchema,
    output_schema: outputSchema,
    dependencies: manifest.dependencies ?? {},
    secrets: manifest.secrets ?? [],
  });

  return NextResponse.json({
    app: {
      id: app.id,
      slug: app.slug,
      name: app.name,
      url: `${process.env.NEXT_PUBLIC_APP_URL}/p/${app.slug}`,
    },
  });
}
