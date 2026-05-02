import { NextRequest, NextResponse } from "next/server";
import { hasAgentTokenConfig } from "@/lib/demo-app";
import {
  ComposioProxyClientError,
  ComposioProxyConfigError,
  executeComposioProxyRequest,
} from "@/lib/composio/proxy";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerHasScope, resolveAuthCaller } from "@/lib/supabase/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOOL_SLUG_RE = /^[A-Za-z0-9_.:-]{1,160}$/;
const MAX_PROXY_BODY_BYTES = 128 * 1024;

export async function POST(req: NextRequest) {
  if (!hasAgentTokenConfig()) {
    return NextResponse.json(
      { error: "Agent tokens are not configured. Set Supabase service-role env and AGENT_TOKEN_PEPPER." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const caller = await resolveAuthCaller(req, admin);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (caller.kind !== "agent_token" || !callerHasScope(caller, "run")) {
    return NextResponse.json({ error: "Agent token with run scope required" }, { status: 403 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_PROXY_BODY_BYTES) {
    return NextResponse.json({ error: "Proxy request body is too large" }, { status: 413 });
  }

  const body = parseJsonObject(rawBody);
  if (!body) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const validation = validateProxyBody(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const result = await executeComposioProxyRequest(admin, {
      userId: caller.userId,
      agentTokenId: caller.agentTokenId,
      connectionId: validation.connectionId,
      toolSlug: validation.toolSlug,
      arguments: validation.arguments,
      text: validation.text,
      version: validation.version,
    });

    if (result.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof ComposioProxyConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    if (error instanceof ComposioProxyClientError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Composio proxy request failed" }, { status: 500 });
  }
}

function parseJsonObject(rawBody: string) {
  try {
    const value = JSON.parse(rawBody);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function validateProxyBody(body: Record<string, unknown>):
  | {
      ok: true;
      connectionId: string;
      toolSlug: string;
      arguments?: Record<string, unknown>;
      text?: string;
      version?: string;
    }
  | { ok: false; error: string } {
  const connectionId = body.connection_id;
  if (typeof connectionId !== "string" || !UUID_RE.test(connectionId)) {
    return { ok: false, error: "connection_id must be a UUID string" };
  }

  const toolSlug = body.tool_slug;
  if (typeof toolSlug !== "string" || !TOOL_SLUG_RE.test(toolSlug)) {
    return { ok: false, error: "tool_slug must be a valid Composio tool slug" };
  }

  const hasArguments = body.arguments !== undefined;
  const hasText = body.text !== undefined;
  if (hasArguments && hasText) {
    return { ok: false, error: "Provide either arguments or text, not both" };
  }

  let argumentsValue: Record<string, unknown> | undefined;
  if (hasArguments) {
    if (!body.arguments || typeof body.arguments !== "object" || Array.isArray(body.arguments)) {
      return { ok: false, error: "arguments must be an object" };
    }
    argumentsValue = body.arguments as Record<string, unknown>;
  }

  let text: string | undefined;
  if (hasText) {
    if (typeof body.text !== "string" || body.text.trim() === "") {
      return { ok: false, error: "text must be a non-empty string" };
    }
    text = body.text;
  }

  let version: string | undefined;
  if (body.version !== undefined) {
    if (typeof body.version !== "string" || body.version.length > 80) {
      return { ok: false, error: "version must be a string no longer than 80 characters" };
    }
    version = body.version;
  }

  return {
    ok: true,
    connectionId,
    toolSlug,
    arguments: argumentsValue,
    text,
    version,
  };
}
