import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Thrown when a run requires Composio connections that are not yet set up
 * for the caller.
 *
 * reason "sign-in"  — caller is anonymous; they need to authenticate first.
 * reason "connect"  — caller is authenticated but has no active connection
 *                     for one or more required toolkits.
 */
export class MissingComposioConnectionError extends Error {
  readonly toolkits: string[];
  readonly reason: "sign-in" | "connect";
  readonly userId: string | undefined;

  constructor(toolkits: string[], reason: "sign-in" | "connect", userId?: string) {
    super(
      reason === "sign-in"
        ? `This app requires Composio connections (${toolkits.join(", ")}). Sign in to continue.`
        : `Missing active Composio connection for: ${toolkits.join(", ")}. Visit /connections to connect.`
    );
    this.name = "MissingComposioConnectionError";
    this.toolkits = toolkits;
    this.reason = reason;
    this.userId = userId;
  }
}

/**
 * Resolve Composio connection env vars for the caller.
 *
 * For each toolkit slug in `toolkits`, looks up an active row in
 * composio_connections for the caller and injects:
 *   COMPOSIO_<TOOLKIT_UPPERCASE>_CONNECTION_ID = composio_account_id
 *   COMPOSIO_CONNECTION_ID = composio_account_id  (last toolkit wins for single-toolkit apps)
 *   COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY (if configured)
 *
 * Throws MissingComposioConnectionError for:
 *   - anon callers (reason: "sign-in")
 *   - authenticated callers with no active connection for a toolkit (reason: "connect")
 *
 * @param admin     Supabase admin client (bypasses RLS)
 * @param callerId  Authenticated user ID, or null/undefined for anon
 * @param toolkits  Provider slugs from the manifest composio: field
 */
export async function resolveComposioConnections(
  admin: SupabaseClient,
  callerId: string | null | undefined,
  toolkits: string[]
): Promise<Record<string, string>> {
  if (toolkits.length === 0) {
    return {};
  }

  if (!callerId) {
    throw new MissingComposioConnectionError(toolkits, "sign-in");
  }

  const env: Record<string, string> = {};
  const missing: string[] = [];

  for (const toolkit of toolkits) {
    const { data: row, error } = await admin
      .from("composio_connections")
      .select("composio_account_id, status")
      .eq("user_id", callerId)
      .eq("provider", toolkit)
      .eq("status", "active")
      .maybeSingle<{ composio_account_id: string; status: string }>();

    if (error) {
      // DB error reading connections — treat as missing rather than crashing the run.
      missing.push(toolkit);
      continue;
    }

    if (!row) {
      missing.push(toolkit);
      continue;
    }

    const upperSlug = toolkit.toUpperCase().replace(/-/g, "_");
    env[`COMPOSIO_${upperSlug}_CONNECTION_ID`] = row.composio_account_id;
    // Also set the generic single-toolkit env var (last one wins for multi-toolkit apps).
    env.COMPOSIO_CONNECTION_ID = row.composio_account_id;
  }

  if (missing.length > 0) {
    throw new MissingComposioConnectionError(missing, "connect", callerId);
  }

  // Inject the Composio API key so the SDK can authenticate against the Composio backend.
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (apiKey) {
    env.COMPOSIO_API_KEY = apiKey;
  }

  return env;
}
