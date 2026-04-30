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
    };

export function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function resolveAuthCaller(
  req: NextRequest,
  admin: SupabaseClient
): Promise<AuthCaller | null> {
  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  const { data: userData } = await admin.auth.getUser(token);
  if (userData.user) {
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
