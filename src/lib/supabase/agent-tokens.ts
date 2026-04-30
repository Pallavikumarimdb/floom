import { randomBytes, createHmac } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentTokenRecord = {
  id: string;
  owner_id: string;
  scopes: string[];
};

function tokenPepper() {
  const pepper = process.env.AGENT_TOKEN_PEPPER;
  if (!pepper) {
    throw new Error("AGENT_TOKEN_PEPPER is not configured");
  }
  return pepper;
}

export function hashAgentToken(token: string) {
  return createHmac("sha256", tokenPepper()).update(token, "utf8").digest("hex");
}

export function generateAgentToken() {
  const prefix = randomBytes(6).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  return `flm_live_${prefix}_${secret}`;
}

export async function resolveAgentToken(
  admin: SupabaseClient,
  token: string
): Promise<AgentTokenRecord | null> {
  const tokenHash = hashAgentToken(token);
  const { data, error } = await admin
    .from("agent_tokens")
    .select("id, owner_id, scopes")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  await admin
    .from("agent_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return data as AgentTokenRecord;
}

export async function createAgentToken(
  admin: SupabaseClient,
  ownerId: string,
  name: string,
  scopes: string[] = ["read", "run", "publish"]
) {
  const token = generateAgentToken();
  const { data, error } = await admin
    .from("agent_tokens")
    .insert({
      owner_id: ownerId,
      name,
      token_hash: hashAgentToken(token),
      token_prefix: token.slice(0, 12),
      scopes,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString(),
    })
    .select("id, token_prefix, scopes, expires_at, created_at")
    .single();

  if (error || !data) {
    throw new Error("Failed to create agent token");
  }

  return { token, record: data };
}

export function agentTokenHasScope(record: AgentTokenRecord, scope: string) {
  return record.scopes.includes(scope);
}

export async function revokeAgentToken(
  admin: SupabaseClient,
  ownerId: string,
  tokenId: string
) {
  const { error } = await admin
    .from("agent_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("owner_id", ownerId)
    .is("revoked_at", null);

  if (error) {
    throw new Error("Failed to revoke agent token");
  }
}
