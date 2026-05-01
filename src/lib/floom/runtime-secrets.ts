import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
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

export async function resolveRuntimeSecrets(
  admin: SupabaseClient,
  secretNames: unknown,
  appId: string,
  ownerId: string
): Promise<RuntimeSecretResolution> {
  const parsedNames = parseSecretNames(secretNames);
  if (!parsedNames.ok) {
    return { ok: false, error: "Invalid configured app secret name" };
  }

  if (parsedNames.names.length === 0) {
    return { ok: true, envs: {}, missing: [] };
  }

  try {
    readSecretEncryptionKey();
  } catch {
    return { ok: false, error: "App secrets are not configured" };
  }

  const { data, error } = await admin
    .from("app_secrets")
    .select("name, value_ciphertext")
    .eq("app_id", appId)
    .eq("owner_id", ownerId)
    .in("name", parsedNames.names);

  if (error) {
    return { ok: false, error: "Failed to load app secrets" };
  }

  const rows = new Map(
    (data ?? []).map((row) => [
      String(row.name),
      String(row.value_ciphertext),
    ])
  );
  const envs: RuntimeSecrets = {};
  const missing: string[] = [];

  for (const name of parsedNames.names) {
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

  return { ok: true, envs, missing };
}

export function parseSecretNames(
  secretNames: unknown
): { ok: true; names: string[] } | { ok: false } {
  if (!Array.isArray(secretNames)) {
    return { ok: true, names: [] };
  }

  const names: string[] = [];
  for (const item of secretNames) {
    if (typeof item !== "string" || !isValidSecretName(item)) {
      return { ok: false };
    }
    names.push(item);
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
