import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerHasScope, resolveAuthCaller } from "@/lib/supabase/auth";
import yaml from "js-yaml";
import { v4 as uuidv4 } from "uuid";
import { hasSupabaseConfig } from "@/lib/demo-app";
import {
  parseManifest,
  validatePythonSourceForManifest,
  type FloomManifest,
} from "@/lib/floom/manifest";
import {
  MAX_REQUEST_BYTES,
  MAX_REQUIREMENTS_BYTES,
  MAX_SCHEMA_BYTES,
  MAX_SOURCE_BYTES,
} from "@/lib/floom/limits";
import { validatePythonRequirementsText } from "@/lib/floom/requirements";
import { parseAndValidateJsonSchemaText } from "@/lib/floom/schema";

export async function POST(req: NextRequest) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 }
    );
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  }

  const form = await req.formData();
  const manifestFile = form.get("manifest") as File | null;
  const bundleFile = form.get("bundle") as File | null;
  const inputSchemaFile = form.get("input_schema") as File | null;
  const outputSchemaFile = form.get("output_schema") as File | null;
  const requirementsFile = form.get("requirements") as File | null;

  if (!manifestFile || !bundleFile) {
    return NextResponse.json({ error: "Missing manifest or bundle" }, { status: 400 });
  }

  if (manifestFile.size > MAX_SCHEMA_BYTES) {
    return NextResponse.json({ error: "Manifest is too large" }, { status: 413 });
  }

  if (bundleFile.size > MAX_SOURCE_BYTES) {
    return NextResponse.json({ error: "App source is too large" }, { status: 413 });
  }

  if (
    (inputSchemaFile && inputSchemaFile.size > MAX_SCHEMA_BYTES) ||
    (outputSchemaFile && outputSchemaFile.size > MAX_SCHEMA_BYTES) ||
    (requirementsFile && requirementsFile.size > MAX_REQUIREMENTS_BYTES)
  ) {
    return NextResponse.json({ error: "Upload metadata is too large" }, { status: 413 });
  }

  const manifestText = await manifestFile.text();
  let manifest: FloomManifest;
  try {
    manifest = parseManifest(yaml.load(manifestText));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid floom.yaml" },
      { status: 400 }
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

  const ownerId = caller.userId;

  // Fetch existing app so owners can publish updates to their slug.
  const { data: existing } = await admin
    .from("apps")
    .select("id, owner_id, name, runtime, entrypoint, handler, public")
    .eq("slug", manifest.slug)
    .maybeSingle();

  if (existing && existing.owner_id !== ownerId) {
    return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
  }

  let inputSchema = {};
  let outputSchema = {};

  if (inputSchemaFile) {
    const inputResult = parseAndValidateJsonSchemaText(
      await inputSchemaFile.text(),
      "input_schema"
    );
    if (!inputResult.ok) {
      return NextResponse.json({ error: inputResult.error }, { status: 400 });
    }
    inputSchema = inputResult.schema;
  }

  if (outputSchemaFile) {
    const outputResult = parseAndValidateJsonSchemaText(
      await outputSchemaFile.text(),
      "output_schema"
    );
    if (!outputResult.ok) {
      return NextResponse.json({ error: outputResult.error }, { status: 400 });
    }
    outputSchema = outputResult.schema;
  }

  let pythonRequirements: string | undefined;
  if (manifest.dependencies?.python) {
    if (!requirementsFile) {
      return NextResponse.json({ error: "requirements.txt is required by floom.yaml" }, { status: 400 });
    }

    try {
      pythonRequirements = validatePythonRequirementsText(await requirementsFile.text());
    } catch (requirementsError) {
      return NextResponse.json(
        {
          error: requirementsError instanceof Error
            ? requirementsError.message
            : "Invalid requirements.txt",
        },
        { status: 400 }
      );
    }
  } else if (requirementsFile) {
    return NextResponse.json(
      { error: "requirements.txt requires dependencies.python in floom.yaml" },
      { status: 400 }
    );
  }

  const bundleBuffer = Buffer.from(await bundleFile.arrayBuffer());
  const bundleText = bundleBuffer.toString("utf8");
  try {
    validatePythonSourceForManifest(bundleText, manifest);
  } catch (sourceError) {
    return NextResponse.json(
      { error: sourceError instanceof Error ? sourceError.message : "Invalid app source" },
      { status: 400 }
    );
  }

  const bundlePath = `${ownerId}/${manifest.slug}/${uuidv4()}-${manifest.entrypoint}`;
  const { error: uploadError } = await admin.storage
    .from("app-bundles")
    .upload(bundlePath, bundleBuffer, { contentType: "application/octet-stream" });

  if (uploadError) {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const appMutation = {
    name: manifest.name,
    runtime: manifest.runtime,
    entrypoint: manifest.entrypoint,
    handler: manifest.handler,
    public: manifest.public ?? false,
  };

  const { data: app, error: appError } = existing
    ? await admin
        .from("apps")
        .update(appMutation)
        .eq("id", existing.id)
        .select()
        .single()
    : await admin
        .from("apps")
        .insert({
          ...appMutation,
          slug: manifest.slug,
          owner_id: ownerId,
        })
        .select()
        .single();

  if (appError || !app) {
    await admin.storage.from("app-bundles").remove([bundlePath]);
    return NextResponse.json({ error: "Failed to create app" }, { status: 500 });
  }

  const { data: latestVersion, error: latestVersionError } = await admin
    .from("app_versions")
    .select("version")
    .eq("app_id", app.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestVersionError) {
    await rollbackPublish(admin, existing, app.id, bundlePath);
    return NextResponse.json({ error: "Failed to create app version" }, { status: 500 });
  }

  const version = (latestVersion?.version ?? 0) + 1;

  const { error: versionError } = await admin.from("app_versions").insert({
    app_id: app.id,
    version,
    bundle_path: bundlePath,
    input_schema: inputSchema,
    output_schema: outputSchema,
    dependencies: pythonRequirements ? { python_requirements: pythonRequirements } : {},
    secrets: manifest.secrets ?? [],
  });

  if (versionError) {
    await rollbackPublish(admin, existing, app.id, bundlePath);
    return NextResponse.json({ error: "Failed to create app version" }, { status: 500 });
  }

  return NextResponse.json({
    app: {
      id: app.id,
      slug: app.slug,
      name: app.name,
      url: new URL(`/p/${app.slug}`, req.url).toString(),
    },
  });
}

async function rollbackPublish(
  admin: ReturnType<typeof createAdminClient>,
  existing:
    | {
        id: string;
        name: string;
        runtime: string;
        entrypoint: string;
        handler: string;
        public: boolean;
      }
    | null,
  appId: string,
  bundlePath: string
) {
  if (existing) {
    await admin
      .from("apps")
      .update({
        name: existing.name,
        runtime: existing.runtime,
        entrypoint: existing.entrypoint,
        handler: existing.handler,
        public: existing.public,
      })
      .eq("id", existing.id);
  } else {
    await admin.from("apps").delete().eq("id", appId);
  }

  await admin.storage.from("app-bundles").remove([bundlePath]);
}
