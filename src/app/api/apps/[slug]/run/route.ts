import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerHasScope, getBearerToken, resolveAuthCaller } from "@/lib/supabase/auth";
import { demoApp, hasSupabaseConfig, runDemoApp } from "@/lib/demo-app";
import { runInSandboxContained } from "@/lib/e2b/runner";
import { MAX_INPUT_BYTES, MAX_REQUEST_BYTES, MAX_SOURCE_BYTES } from "@/lib/floom/limits";
import { getPublicRunRateLimitKey, getRunCallerKey } from "@/lib/floom/rate-limit";
import { redactSecretOutput } from "@/lib/floom/schema";
import Ajv from "ajv";

const ajv = new Ajv({ strict: false });
const DEFAULT_PUBLIC_RUN_RATE_LIMIT_MAX = 20;
const DEFAULT_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  }

  const body = await req.json().catch(() => ({}));
  const { inputs } = body as { inputs: Record<string, unknown> };
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    return NextResponse.json({ error: "Missing inputs object" }, { status: 400 });
  }

  if (Buffer.byteLength(JSON.stringify(inputs), "utf8") > MAX_INPUT_BYTES) {
    return NextResponse.json({ error: "Inputs are too large" }, { status: 413 });
  }

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
  const bearerToken = getBearerToken(req);
  const caller = await resolveAuthCaller(req, admin);
  if (bearerToken && !caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = caller?.userId ?? null;

  const isOwner = userId === app.owner_id;
  const isPublic = app.public;

  if (!isOwner && !isPublic) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (caller?.kind === "agent_token" && !callerHasScope(caller, "run")) {
    return NextResponse.json({ error: "Missing run scope" }, { status: 403 });
  }

  // Validate input
  const validateInput = ajv.compile(latestVersion.input_schema ?? {});
  if (!validateInput(inputs)) {
    return NextResponse.json(
      { error: "Invalid input", details: validateInput.errors },
      { status: 400 }
    );
  }

  const rateLimit = await checkPublicRunRateLimit(
    admin,
    app.id,
    getRunCallerKey(caller, req.headers)
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.error },
      { status: rateLimit.status }
    );
  }

  // Create execution record
  const { data: execution, error: execError } = await admin
    .from("executions")
    .insert({
      app_id: app.id,
      version_id: latestVersion.id,
      caller_user_id: caller?.kind === "user" ? caller.userId : null,
      caller_agent_token_id: caller?.kind === "agent_token" ? caller.agentTokenId : null,
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
  if (Buffer.byteLength(bundleText, "utf8") > MAX_SOURCE_BYTES) {
    await admin
      .from("executions")
      .update({
        status: "error",
        error: "App source is too large",
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

    return NextResponse.json(
      {
        execution_id: execution.id,
        status: "error",
        output: {},
        error: "App source is too large",
      },
      { status: 413 }
    );
  }

  // Run
  const result = await runInSandboxContained(
    bundleText,
    inputs,
    app.runtime,
    app.entrypoint,
    app.handler
  );

  // Validate output
  const validateOutput = ajv.compile(latestVersion.output_schema ?? {});
  const outputValid = validateOutput(result.output);
  const redactedOutput = result.error
    ? null
    : redactSecretOutput(latestVersion.output_schema ?? {}, result.output);

  // Update execution
  await admin
    .from("executions")
    .update({
      status: result.error ? "error" : outputValid ? "success" : "error",
      output: redactedOutput,
      error: result.error || (!outputValid ? "Output validation failed" : null),
      completed_at: new Date().toISOString(),
    })
    .eq("id", execution.id);

  const status = result.error ? "error" : outputValid ? "success" : "error";

  return NextResponse.json({
    execution_id: execution.id,
    status,
    output: redactedOutput,
    error: result.error || (!outputValid ? "Output validation failed" : null),
  });
}

async function checkPublicRunRateLimit(
  admin: ReturnType<typeof createAdminClient>,
  appId: string,
  callerKey: string
): Promise<
  | { allowed: true }
  | {
      allowed: false;
      status: number;
      error: string;
    }
> {
  const { data, error } = await admin.rpc("check_public_run_rate_limit", {
    p_rate_key: getPublicRunRateLimitKey(appId, callerKey),
    p_limit: readPositiveIntegerEnv(
      "FLOOM_PUBLIC_RUN_RATE_LIMIT_MAX",
      DEFAULT_PUBLIC_RUN_RATE_LIMIT_MAX
    ),
    p_window_seconds: readPositiveIntegerEnv(
      "FLOOM_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS",
      DEFAULT_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS
    ),
  });

  if (error) {
    return {
      allowed: false,
      status: 503,
      error: "Run rate limit check failed",
    };
  }

  if (data !== true) {
    return {
      allowed: false,
      status: 429,
      error: "Run rate limit exceeded",
    };
  }

  return { allowed: true };
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
