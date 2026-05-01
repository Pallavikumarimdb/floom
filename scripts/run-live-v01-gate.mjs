import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const envFile = process.env.FLOOM_VERCEL_ENV_FILE || "/tmp/floom-v01-prod-refresh.env";
const tokenFile = process.env.FLOOM_TOKEN_FILE || "/tmp/floom-v01-agent-token";

const prod = parseEnvFile(envFile);
const token = readFileSync(tokenFile, "utf8").trim();
const result = spawnSync("node", ["scripts/live-v01-gate.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: cleanPlainEnv(prod.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: cleanPlainEnv(prod.SUPABASE_SERVICE_ROLE_KEY),
    AGENT_TOKEN_PEPPER: decodeEscapedEnv(prod.AGENT_TOKEN_PEPPER),
    FLOOM_API_URL: process.env.FLOOM_API_URL || "https://floom.dev",
    FLOOM_TOKEN: token,
    NEXT_TELEMETRY_DISABLED: "1",
  },
  encoding: "utf8",
  timeout: 240000,
});

const redact = (text) => String(text || "").split(token).join("[REDACTED]");
process.stdout.write(redact(result.stdout));
process.stderr.write(redact(result.stderr));
process.exit(result.status ?? 1);

function parseEnvFile(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function cleanPlainEnv(value) {
  return String(value || "").replace(/\\n/g, "").trim();
}

function decodeEscapedEnv(value) {
  return String(value || "").replace(/\\n/g, "\n");
}
