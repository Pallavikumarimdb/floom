import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse, after } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { renderAppPublishedEmail } from "@/lib/email/templates";
import yaml from "js-yaml";
import { v4 as uuidv4 } from "uuid";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerHasScope, resolveAuthCaller } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/demo-app";
import {
  BundleValidationError,
  createBundleFromFileMap,
  validateUploadedTarball,
} from "@/lib/floom/bundle";
import {
  MAX_BUNDLE_BYTES,
  MAX_REQUEST_BYTES,
  MAX_SCHEMA_BYTES,
  MAX_SOURCE_BYTES,
} from "@/lib/floom/limits";
import {
  isLegacyPythonManifest,
  parseManifest,
  type FloomManifest,
} from "@/lib/floom/manifest";
import { resolveMcpForwardOrigin } from "@/lib/mcp/origin";

type ExistingApp = {
  id: string;
  owner_id: string;
  name: string;
  runtime: string;
  entrypoint: string | null;
  handler: string | null;
  public: boolean;
};

export async function GET(req: NextRequest) {
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

  if (!callerHasScope(caller, "read")) {
    return NextResponse.json({ error: "Missing read scope" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("apps")
    .select("id, slug, name, runtime, public, created_at, updated_at")
    .eq("owner_id", caller.userId)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to list apps" }, { status: 500 });
  }

  return NextResponse.json({
    apps: (data ?? []).map((app) => ({
      id: app.id,
      slug: app.slug,
      name: app.name,
      runtime: app.runtime,
      public: app.public,
      visibility: app.public ? "public" : "private",
      created_at: app.created_at,
      updated_at: app.updated_at,
      url: new URL(`/p/${app.slug}`, resolveMcpForwardOrigin(req.url) || req.url).toString(),
    })),
  });
}

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
  const manifestFile = getUploadedFile(form, "manifest");
  const bundleFile = getUploadedFile(form, "bundle");

  if (!manifestFile || !bundleFile) {
    return NextResponse.json({ error: "Missing manifest or bundle" }, { status: 400 });
  }

  if (manifestFile.size > MAX_SCHEMA_BYTES) {
    return NextResponse.json(
      { error: "invalid_manifest", detail: "Manifest is too large" },
      { status: 400 }
    );
  }

  if (bundleFile.size > MAX_BUNDLE_BYTES && bundleFile.size > MAX_SOURCE_BYTES) {
    return NextResponse.json(
      { error: "bundle_too_large", detail: "bundle exceeds the 5 MB compressed limit" },
      { status: 400 }
    );
  }

  const manifestText = await manifestFile.text();
  let uploadedManifest: FloomManifest;
  try {
    uploadedManifest = parseManifest(yaml.load(manifestText));
  } catch (error) {
    return NextResponse.json(
      {
        error: "invalid_manifest",
        detail: error instanceof Error ? error.message : "Invalid floom.yaml",
      },
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

  const { data: existing } = await admin
    .from("apps")
    .select("id, owner_id, name, runtime, entrypoint, handler, public")
    .eq("slug", uploadedManifest.slug)
    .maybeSingle<ExistingApp>();

  if (existing && existing.owner_id !== ownerId) {
    return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
  }

  let tarballBuffer = Buffer.from(new Uint8Array(await bundleFile.arrayBuffer()));
  try {
    if (!looksLikeTarball(bundleFile, tarballBuffer)) {
      if (!isLegacyPythonManifest(uploadedManifest)) {
        return NextResponse.json(
          {
            error: "invalid_manifest",
            detail: "stock-E2B publish requires a .tar.gz bundle rooted at floom.yaml",
          },
          { status: 400 }
        );
      }

      tarballBuffer = Buffer.from(
        new Uint8Array((await createBundleFromLegacyUploads(form, uploadedManifest, manifestText)).buffer)
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "invalid_manifest",
        detail: error instanceof Error ? error.message : "Failed to assemble bundle",
      },
      { status: 400 }
    );
  }

  let validated;
  try {
    validated = await validateUploadedTarball(tarballBuffer, manifestText);
  } catch (error) {
    if (error instanceof BundleValidationError) {
      return NextResponse.json(
        { error: error.code, detail: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "invalid_manifest", detail: "Failed to validate bundle" },
      { status: 400 }
    );
  }

  try {
    const legacyManifest = isLegacyPythonManifest(validated.manifest) ? validated.manifest : null;
    const dependencyPayload = validated.dependencyConfig
      ? { python_require_hashes: validated.dependencyConfig.requireHashes }
      : {};
    const storedBundle = legacyManifest
      ? {
          buffer: await fs.readFile(path.join(validated.extractedDir, legacyManifest.entrypoint)),
          kind: "single_file" as const,
          command: null,
          contentType: "application/octet-stream",
          extension: "py",
          dependencies: validated.dependencyConfig
            ? {
                ...dependencyPayload,
                python_requirements: await fs.readFile(
                  path.join(validated.extractedDir, validated.dependencyConfig.path),
                  "utf8"
                ),
              }
            : {},
        }
      : {
          buffer: tarballBuffer,
          kind: "tarball" as const,
          command: validated.command,
          contentType: "application/octet-stream",
          extension: "tar.gz",
          dependencies: dependencyPayload,
        };

    const bundlePath = `${ownerId}/${validated.manifest.slug}/${uuidv4()}.${storedBundle.extension}`;
    const { error: uploadError } = await admin.storage
      .from("app-bundles")
      .upload(bundlePath, storedBundle.buffer, { contentType: storedBundle.contentType });

    if (uploadError) {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const appMutation = {
      name: validated.manifest.name?.trim() || existing?.name || validated.displayName,
      runtime: validated.runtimeLabel,
      entrypoint: isLegacyPythonManifest(validated.manifest) ? validated.manifest.entrypoint : null,
      handler: isLegacyPythonManifest(validated.manifest) ? validated.manifest.handler : null,
      public: validated.manifest.public ?? false,
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
            slug: validated.manifest.slug,
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
    const versionPayload = {
      app_id: app.id,
      version,
      bundle_path: bundlePath,
      bundle_kind: storedBundle.kind,
      command: storedBundle.command,
      input_schema: validated.inputSchema,
      output_schema: validated.outputSchema,
      dependencies: storedBundle.dependencies,
      secrets: validated.manifest.secrets ?? [],
    };

    const { error: versionError } = await admin.from("app_versions").insert(versionPayload);
    if (versionError) {
      await rollbackPublish(admin, existing, app.id, bundlePath);
      return NextResponse.json({ error: "Failed to create app version" }, { status: 500 });
    }

    const appUrl = new URL(`/p/${app.slug}`, resolveMcpForwardOrigin(req.url) || req.url).toString();

    // Fire app-published email. after() keeps the serverless function alive
    // until the promise settles without blocking the publish response.
    after(fireAppPublishedEmail(admin, app.owner_id, app.name, appUrl, req));

    return NextResponse.json({
      app: {
        id: app.id,
        slug: app.slug,
        name: app.name,
        url: appUrl,
      },
      warnings: validated.warnings,
    });
  } finally {
    await validated.cleanup();
  }
}

async function createBundleFromLegacyUploads(
  form: FormData,
  manifest: FloomManifest,
  manifestText: string
) {
  const bundleFile = getUploadedFile(form, "bundle");
  const inputSchemaFile = getUploadedFile(form, "input_schema");
  const outputSchemaFile = getUploadedFile(form, "output_schema");
  const requirementsFile = getUploadedFile(form, "requirements");

  if (!bundleFile) {
    throw new Error("Missing bundle");
  }

  if (!isLegacyPythonManifest(manifest)) {
    throw new Error("Legacy upload compatibility requires runtime: python + entrypoint + handler");
  }

  if (!inputSchemaFile || !outputSchemaFile) {
    throw new Error("Legacy uploads require input_schema and output_schema files");
  }

  const files: Record<string, string> = {
    "floom.yaml": manifestText,
    [manifest.entrypoint]: Buffer.from(await bundleFile.arrayBuffer()).toString("utf8"),
    [manifest.input_schema ?? "input.schema.json"]: await inputSchemaFile.text(),
    [manifest.output_schema ?? "output.schema.json"]: await outputSchemaFile.text(),
  };

  const dependencyConfig = manifest.dependencies?.python;
  if (dependencyConfig) {
    if (!requirementsFile) {
      throw new Error("requirements.txt is required by floom.yaml");
    }
    files[dependencyConfig.replace(/\s+--require-hashes$/, "").replace(/^\.\//, "")] = await requirementsFile.text();
  } else if (requirementsFile) {
    throw new Error("requirements.txt requires dependencies.python in floom.yaml");
  }

  return createBundleFromFileMap(files);
}

async function rollbackPublish(
  admin: ReturnType<typeof createAdminClient>,
  existing: ExistingApp | null,
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

function getUploadedFile(form: FormData, field: string): File | null {
  const value = form.get(field);
  return value instanceof File ? value : null;
}

function looksLikeTarball(bundleFile: File, buffer: Buffer) {
  return (
    bundleFile.name.endsWith(".tar.gz") ||
    bundleFile.type === "application/gzip" ||
    (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b)
  );
}

async function fireAppPublishedEmail(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  appName: string,
  appUrl: string,
  req: NextRequest,
): Promise<void> {
  try {
    const { data: userData } = await admin.auth.admin.getUserById(ownerId);
    const email = userData?.user?.email;
    if (!email) return;

    const name =
      (userData.user?.user_metadata?.full_name as string | undefined) ??
      (userData.user?.user_metadata?.name as string | undefined) ??
      null;

    const publicUrl =
      process.env.FLOOM_ORIGIN ??
      process.env.NEXT_PUBLIC_FLOOM_ORIGIN ??
      process.env.NEXT_PUBLIC_APP_URL ??
      new URL(req.url).origin;

    const { subject, html, text } = renderAppPublishedEmail({
      name,
      appName,
      appUrl,
      publicUrl,
    });

    await sendEmail({ to: email, subject, html, text });
  } catch (error) {
    console.error("[email] failed to send app-published email", error);
  }
}
