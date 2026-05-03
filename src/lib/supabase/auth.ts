import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAgentToken } from "./agent-tokens";

export type AuthCaller =
  | {
      kind: "user";
      userId: string;
      agentTokenId: null;
    }
  | {
      kind: "agent_token";
      userId: string;
      agentTokenId: string;
      scopes: string[];
      tokenName: string | null;
    };

export function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

const AUTH_RESOLVE_TIMEOUT_MS = 8000;

export async function resolveAuthCaller(
  req: NextRequest,
  admin: SupabaseClient
): Promise<AuthCaller | null> {
  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  // Supabase auth.getUser() makes an HTTP call to the auth service.
  // Wrap it in a timeout to prevent hung requests from stalling the route
  // handler when the auth service is slow or the JWT is malformed.
  let userData: { user: { id: string } | null } | null = null;
  try {
    const result = await Promise.race([
      admin.auth.getUser(token),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("auth_timeout")), AUTH_RESOLVE_TIMEOUT_MS)
      ),
    ]);
    userData = result.data ?? null;
  } catch {
    // Timeout or network error — treat as unresolvable.
    // Return null so the caller sees bearerToken + null => 401.
    return null;
  }

  if (userData?.user) {
    return {
      kind: "user",
      userId: userData.user.id,
      agentTokenId: null,
    };
  }

  const agentToken = await resolveAgentToken(admin, token);
  if (!agentToken) {
    return null;
  }

  return {
    kind: "agent_token",
    userId: agentToken.owner_id,
    agentTokenId: agentToken.id,
    scopes: agentToken.scopes,
    tokenName: agentToken.name ?? null,
  };
}

export function callerHasScope(caller: AuthCaller | null, scope: string) {
  if (!caller) {
    return false;
  }

  if (caller.kind === "user") {
    return true;
  }

  return caller.scopes.includes(scope);
}
