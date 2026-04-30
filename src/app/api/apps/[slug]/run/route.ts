import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoApp, hasSupabaseConfig, runDemoApp } from "@/lib/demo-app";
import { runInSandbox } from "@/lib/runner";
import Ajv from "ajv";
import { createHash } from "crypto";

const ajv = new Ajv({ strict: false });

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const { inputs, share_token } = body as { inputs: Record<string, unknown>; share_token?: string };

  if (!hasSupabaseConfig() && slug === demoApp.slug) {
    const validateDemoInput = ajv.compile(demoApp.input_schema);
    if (!validateDemoInput(inputs)) {
      return NextResponse.json(
        { error: "Invalid input", details: validateDemoInput.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({
      execution_id: "demo-local",
      status: "success",
      output: runDemoApp(inputs),
    });
  }

  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured. Only the demo app is available without Supabase env." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();

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

  const latestVersion = app.app_versions?.[0];
  if (!latestVersion) {
    return NextResponse.json({ error: "No version found" }, { status: 400 });
  }

  // Auth / sharing check
  const authHeader = req.headers.get("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    userId = userData.user?.id ?? null;
  }

  const isOwner = userId === app.owner_id;
  const isPublic = app.public;
  let isShared = false;

  if (share_token) {
    const { data: share } = await admin
      .from("app_share_links")
      .select("id")
      .eq("app_id", app.id)
      .eq("token_hash", sha256(share_token))
      .maybeSingle();
    isShared = !!share;
  }

  if (!isOwner && !isPublic && !isShared) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate input
  const validateInput = ajv.compile(latestVersion.input_schema ?? {});
  if (!validateInput(inputs)) {
    return NextResponse.json(
      { error: "Invalid input", details: validateInput.errors },
      { status: 400 }
    );
  }

  // Create execution record
  const { data: execution, error: execError } = await admin
    .from("executions")
    .insert({
      app_id: app.id,
      version_id: latestVersion.id,
      input: inputs,
      status: "running",
    })
    .select()
    .single();

  if (execError || !execution) {
    return NextResponse.json({ error: "Failed to create execution" }, { status: 500 });
  }

  // Fetch bundle
  const { data: bundleData, error: bundleError } = await admin.storage
    .from("app-bundles")
    .download(latestVersion.bundle_path);

  if (bundleError || !bundleData) {
    await admin
      .from("executions")
      .update({
        status: "error",
        error: "Failed to download app bundle",
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

    return NextResponse.json(
      {
        execution_id: execution.id,
        status: "error",
        output: {},
        error: "Failed to download app bundle",
      },
      { status: 500 }
    );
  }

  const bundleText = bundleData ? await bundleData.text() : "";

  // Run
  const result = await runInSandbox(
    bundleText,
    inputs,
    app.runtime,
    app.entrypoint,
    app.handler,
    latestVersion.dependencies as Record<string, string[]>
  );

  // Validate output
  const validateOutput = ajv.compile(latestVersion.output_schema ?? {});
  const outputValid = validateOutput(result.output);

  // Update execution
  await admin
    .from("executions")
    .update({
      status: result.error ? "error" : outputValid ? "success" : "error",
      output: result.error ? null : result.output,
      error: result.error || (!outputValid ? "Output validation failed" : null),
      completed_at: new Date().toISOString(),
    })
    .eq("id", execution.id);

  const status = result.error ? "error" : outputValid ? "success" : "error";

  return NextResponse.json({
    execution_id: execution.id,
    status,
    output: result.error ? null : result.output,
    error: result.error || (!outputValid ? "Output validation failed" : null),
  });
}
