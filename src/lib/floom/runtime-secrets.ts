import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManifestSecret, SecretScope } from "@/lib/floom/manifest";

export const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_VERSION = "v1";
const NONCE_BYTES = 12;
const KEY_BYTES = 32;

export type RuntimeSecrets = Record<string, string>;

export type RuntimeSecretMetadata = {
  name: string;
  created_at: string;
  updated_at: string;
};

export type RuntimeSecretResolution =
  | {
      ok: true;
      envs: RuntimeSecrets;
      missing: string[];
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Returned when an anonymous caller tries to run an app that requires
 * per-runner secrets. The UI uses requiresSignIn to show a sign-in gate.
 */
export type AnonPerRunnerSecretError = {
  ok: false;
  requiresSignIn: string[];
};

export function isAnonPerRunnerError(
  r: RuntimeSecretResolution | AnonPerRunnerSecretError
): r is AnonPerRunnerSecretError {
  return !r.ok && "requiresSignIn" in r;
}

export function isValidSecretName(name: string) {
  return SECRET_NAME_RE.test(name);
}

export function encryptSecretValue(value: string) {
  const key = readSecretEncryptionKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    nonce.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecretValue(encryptedValue: string) {
  const [version, nonceBase64, tagBase64, ciphertextBase64, extra] = encryptedValue.split(":");
  if (
    version !== ENCRYPTION_VERSION ||
    !nonceBase64 ||
    !tagBase64 ||
    !ciphertextBase64 ||
    extra !== undefined
  ) {
    throw new Error("Invalid encrypted secret format");
  }

  const key = readSecretEncryptionKey();
  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(nonceBase64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

/**
 * Resolve runtime secrets for an execution.
 *
 * @param admin    - Supabase admin client
 * @param secretsRaw - raw secrets from app_versions.secrets JSONB (string[] or ManifestSecret[])
 * @param appId    - app id
 * @param ownerId  - app owner user id (used for shared secrets)
 * @param callerId - runner user id (null for anon); used for per-runner secrets
 *
 * Returns AnonPerRunnerSecretError when an anon caller tries to run an app
 * that requires per-runner secrets. The caller (run route / worker) should
 * surface this as a 401 with requires_sign_in=true.
 */
export async function resolveRuntimeSecrets(
  admin: SupabaseClient,
  secretsRaw: unknown,
  appId: string,
  ownerId: string,
  callerId?: string | null
): Promise<RuntimeSecretResolution | AnonPerRunnerSecretError> {
  const secrets = parseManifestSecrets(secretsRaw);

  if (secrets.length === 0) {
    return { ok: true, envs: {}, missing: [] };
  }

  try {
    readSecretEncryptionKey();
  } catch {
    return { ok: false, error: "App secrets are not configured" };
  }

  const sharedSecrets = secrets.filter((s) => s.scope === "shared");
  const perRunnerSecrets = secrets.filter((s) => s.scope === "per-runner");

  // Gate: anon callers cannot use per-runner-secret apps.
  if (perRunnerSecrets.length > 0 && !callerId) {
    return {
      ok: false,
      requiresSignIn: perRunnerSecrets.map((s) => s.name),
    };
  }

  const envs: RuntimeSecrets = {};
  const missing: string[] = [];

  // ── Shared secrets (owner's values) ──────────────────────────────────────
  if (sharedSecrets.length > 0) {
    const { data, error } = await admin
      .from("app_secrets")
      .select("name, value_ciphertext")
      .eq("app_id", appId)
      .eq("owner_id", ownerId)
      .eq("scope", "shared")
      .is("runner_user_id", null)
      .in("name", sharedSecrets.map((s) => s.name));

    if (error) {
      return { ok: false, error: "Failed to load app secrets" };
    }

    const rows = new Map(
      (data ?? []).map((row) => [String(row.name), String(row.value_ciphertext)])
    );

    for (const { name } of sharedSecrets) {
      const encryptedValue = rows.get(name);
      if (!encryptedValue) {
        missing.push(name);
        continue;
      }
      try {
        envs[name] = decryptSecretValue(encryptedValue);
      } catch {
        return { ok: false, error: "Failed to decrypt app secrets" };
      }
    }
  }

  // ── Per-runner secrets (caller's own values) ──────────────────────────────
  if (perRunnerSecrets.length > 0 && callerId) {
    const { data, error } = await admin
      .from("app_secrets")
      .select("name, value_ciphertext")
      .eq("app_id", appId)
      .eq("scope", "per_runner")
      .eq("runner_user_id", callerId)
      .in("name", perRunnerSecrets.map((s) => s.name));

    if (error) {
      return { ok: false, error: "Failed to load runner secrets" };
    }

    const rows = new Map(
      (data ?? []).map((row) => [String(row.name), String(row.value_ciphertext)])
    );

    for (const { name } of perRunnerSecrets) {
      const encryptedValue = rows.get(name);
      if (!encryptedValue) {
        missing.push(name);
        continue;
      }
      try {
        envs[name] = decryptSecretValue(encryptedValue);
      } catch {
        return { ok: false, error: "Failed to decrypt runner secrets" };
      }
    }
  }

  return { ok: true, envs, missing };
}

/**
 * Parse the JSONB secrets column from app_versions into ManifestSecret[].
 * Handles both legacy string[] form and new {name, scope}[] form.
 */
export function parseManifestSecrets(raw: unknown): ManifestSecret[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item): ManifestSecret => {
    if (typeof item === "string") {
      return { name: item, scope: "shared" };
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name : "";
      const scopeRaw = obj.scope as string | undefined;
      const scope: SecretScope =
        scopeRaw === "shared" || scopeRaw === "per-runner" ? scopeRaw : "per-runner";
      return { name, scope };
    }
    return { name: String(item), scope: "shared" };
  });
}

/**
 * Legacy helper for callers that only need secret names.
 * Handles both string[] and object[] forms.
 */
export function parseSecretNames(
  secretNames: unknown
): { ok: true; names: string[] } | { ok: false } {
  if (!Array.isArray(secretNames)) {
    return { ok: true, names: [] };
  }

  const names: string[] = [];
  for (const item of secretNames) {
    if (typeof item === "string") {
      if (!isValidSecretName(item)) return { ok: false };
      names.push(item);
    } else if (item && typeof item === "object" && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name : "";
      if (!isValidSecretName(name)) return { ok: false };
      names.push(name);
    } else {
      return { ok: false };
    }
  }

  if (new Set(names).size !== names.length) {
    return { ok: false };
  }

  return { ok: true, names };
}

function readSecretEncryptionKey() {
  const raw = process.env.FLOOM_SECRET_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("FLOOM_SECRET_ENCRYPTION_KEY is required");
  }

  const encoded = raw.startsWith("base64:") ? raw.slice("base64:".length) : raw;
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("FLOOM_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }

  const unpadded = normalized.replace(/=+$/, "");
  const padded = unpadded + "=".repeat((4 - (unpadded.length % 4)) % 4);
  const key = Buffer.from(padded, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("FLOOM_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }

  return key;
}
