import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_COMPOSIO_API_BASE_URL = "https://backend.composio.dev";

export type ComposioConnectionRow = {
  id: string;
  user_id: string;
  provider: string;
  composio_account_id: string;
  scopes: string[];
  status: "pending" | "active" | "revoked" | "expired";
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
};

export type ComposioProxyExecution = {
  userId: string;
  agentTokenId: string | null;
  connectionId: string;
  toolSlug: string;
  arguments?: Record<string, unknown>;
  text?: string;
  version?: string;
};

export type ComposioProxyResult = {
  status: number;
  ok: boolean;
  body: unknown;
};

export class ComposioProxyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComposioProxyConfigError";
  }
}

export class ComposioProxyClientError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "ComposioProxyClientError";
    this.status = status;
  }
}

export async function executeComposioProxyRequest(
  admin: SupabaseClient,
  execution: ComposioProxyExecution
): Promise<ComposioProxyResult> {
  const connection = await getActiveConnectionForUser(
    admin,
    execution.userId,
    execution.connectionId
  );

  const result = await callComposioTool(connection, execution);
  await auditProxyAttempt(admin, {
    userId: execution.userId,
    connectionId: connection.id,
    agentTokenId: execution.agentTokenId,
    provider: connection.provider,
    toolSlug: execution.toolSlug,
    statusCode: result.status,
    success: result.ok,
  }).catch((error) => {
    console.error("[composio] failed to write proxy audit row", error);
  });

  return result;
}

export async function getActiveConnectionForUser(
  admin: SupabaseClient,
  userId: string,
  connectionId: string
): Promise<ComposioConnectionRow> {
  const { data, error } = await admin
    .from("composio_connections")
    .select("id, user_id, provider, composio_account_id, scopes, status, created_at, updated_at, revoked_at")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle<ComposioConnectionRow>();

  if (error) {
    throw new ComposioProxyClientError("Failed to load Composio connection", 500);
  }

  if (!data) {
    throw new ComposioProxyClientError("Connection not found", 404);
  }

  if (data.status !== "active") {
    throw new ComposioProxyClientError("Connection is not active", 409);
  }

  return data;
}

async function fetchComposioEntityId(accountId: string, apiKey: string, fallbackUserId: string): Promise<string> {
  try {
    const res = await fetch(
      `${composioApiBase()}/api/v3/connected_accounts/${encodeURIComponent(accountId)}`,
      { headers: { "x-api-key": apiKey }, cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json() as { user_id?: string };
      if (data.user_id) return data.user_id;
    }
  } catch {
    // fall through to fallback
  }
  return fallbackUserId;
}

async function callComposioTool(
  connection: ComposioConnectionRow,
  execution: ComposioProxyExecution
): Promise<ComposioProxyResult> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new ComposioProxyConfigError("COMPOSIO_API_KEY is not configured");
  }

  // Resolve the entity ID that Composio actually stored for this account.
  // The v3 connected_accounts create endpoint ignores the user_id we send and
  // stores its own entity (e.g. "default"), so we must look it up before executing.
  const entityId = await fetchComposioEntityId(connection.composio_account_id, apiKey, composioUserId(execution.userId));

  const body: Record<string, unknown> = {
    connected_account_id: connection.composio_account_id,
    user_id: entityId,
  };

  if (execution.version) {
    body.version = execution.version;
  }

  if (execution.text !== undefined) {
    body.text = execution.text;
  } else {
    body.arguments = execution.arguments ?? {};
  }

  let response: Response;
  try {
    response = await fetch(
      `${composioApiBase()}/api/v3.1/tools/execute/${encodeURIComponent(execution.toolSlug)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      }
    );
  } catch {
    return {
      status: 502,
      ok: false,
      body: { error: "Composio upstream request failed" },
    };
  }

  const responseBody = await readResponseBody(response);
  return {
    status: response.status,
    ok: response.ok,
    body: responseBody,
  };
}

async function auditProxyAttempt(
  admin: SupabaseClient,
  input: {
    userId: string;
    connectionId: string;
    agentTokenId: string | null;
    provider: string;
    toolSlug: string;
    statusCode: number;
    success: boolean;
  }
) {
  const { error } = await admin.from("composio_proxy_audit_log").insert({
    user_id: input.userId,
    connection_id: input.connectionId,
    agent_token_id: input.agentTokenId,
    provider: input.provider,
    tool_slug: input.toolSlug,
    status_code: input.statusCode,
    success: input.success,
  });

  if (error) {
    throw new ComposioProxyClientError("Failed to write Composio proxy audit row", 500);
  }
}

function composioApiBase() {
  return (process.env.COMPOSIO_API_BASE_URL || DEFAULT_COMPOSIO_API_BASE_URL).replace(/\/+$/, "");
}

function composioUserId(userId: string) {
  return `user:${userId}`;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
