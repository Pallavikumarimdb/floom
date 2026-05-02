import { createHmac, randomBytes } from "node:crypto";

export const CLI_DEVICE_AUTH_TTL_SECONDS = 10 * 60;
export const CLI_DEVICE_AUTH_POLL_INTERVAL_SECONDS = 2;
export const CLI_DEVICE_AUTH_NAME = "Floom CLI setup";

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const USER_CODE_LENGTH = 8;

export function generateDeviceCode() {
  return randomBytes(32).toString("base64url");
}

export function generateUserCode() {
  let code = "";
  const bytes = randomBytes(USER_CODE_LENGTH);
  for (const byte of bytes) {
    code += USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length];
  }
  return code.slice(0, 4) + "-" + code.slice(4);
}

export function hashDeviceCode(deviceCode: string) {
  const pepper = process.env.AGENT_TOKEN_PEPPER;
  if (!pepper) {
    throw new Error("AGENT_TOKEN_PEPPER is not configured");
  }
  return createHmac("sha256", pepper).update(deviceCode, "utf8").digest("hex");
}

export function normalizeUserCode(userCode: string) {
  return userCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.+)$/, "$1-$2");
}

export function cliDeviceAuthExpiresAt() {
  return new Date(Date.now() + CLI_DEVICE_AUTH_TTL_SECONDS * 1000).toISOString();
}

export function isExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() <= Date.now();
}
