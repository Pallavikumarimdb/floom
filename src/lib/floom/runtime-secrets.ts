const SERVER_SECRET_PREFIX = "FLOOM_APP_SECRET_";
const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

export type RuntimeSecrets = Record<string, string>;

export function resolveRuntimeSecrets(secretNames: unknown, ownerId = "shared"): {
  envs: RuntimeSecrets;
  missing: string[];
} {
  if (!Array.isArray(secretNames)) {
    return { envs: {}, missing: [] };
  }

  const envs: RuntimeSecrets = {};
  const missing: string[] = [];

  for (const item of secretNames) {
    if (typeof item !== "string" || !SECRET_NAME_RE.test(item)) {
      missing.push("invalid");
      continue;
    }

    const value = process.env[serverSecretEnvName(ownerId, item)];
    if (value === undefined || value === "") {
      missing.push(item);
      continue;
    }

    envs[item] = value;
  }

  return { envs, missing };
}

export function serverSecretEnvName(ownerId: string, secretName: string) {
  return `${SERVER_SECRET_PREFIX}${safeEnvSegment(ownerId)}_${secretName}`;
}

function safeEnvSegment(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "_").toUpperCase();
}
