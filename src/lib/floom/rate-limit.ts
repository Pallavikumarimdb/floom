import { createHash } from "crypto";
import type { AuthCaller } from "@/lib/supabase/auth";

const PUBLIC_ANONYMOUS_RATE_LIMIT_ID = "anonymous";
const RATE_LIMIT_KEY_PART_RE = /[^a-zA-Z0-9_-]/g;

// Composio proxy rate limit keys
export function getComposioProxyTokenRateLimitKey(agentTokenId: string) {
  return `composio-proxy-token:${safeRateLimitPart(agentTokenId)}`;
}

export function getComposioProxyUserDayRateLimitKey(userId: string) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `composio-proxy-user-day:${safeRateLimitPart(userId)}:${day}`;
}

export function getPublicRunRateLimitKey(appId: string, callerKey = PUBLIC_ANONYMOUS_RATE_LIMIT_ID) {
  return `public-run:${safeRateLimitPart(appId)}:${safeRateLimitPart(callerKey)}`;
}

export function getPublicRunAppRateLimitKey(appId: string) {
  return `public-run-app:${safeRateLimitPart(appId)}`;
}

export function getPublicRunCallerKey(headers: Headers) {
  // x-vercel-forwarded-for is set by Vercel infrastructure and is NOT
  // client-overridable, unlike x-forwarded-for which clients can spoof.
  const vercelFwd = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const cfIp = headers.get("cf-connecting-ip"); // future Cloudflare-in-front scenario
  const realIp = headers.get("x-real-ip");
  const directIp = vercelFwd || cfIp || realIp;
  // Deliberately exclude x-forwarded-for: clients can set it and bypass rate limits.
  const userAgent = headers.get("user-agent") || "";
  if (!directIp && !userAgent) {
    return PUBLIC_ANONYMOUS_RATE_LIMIT_ID;
  }

  return createHash("sha256")
    .update(`${directIp || "unknown-ip"}|${userAgent}`)
    .digest("hex")
    .slice(0, 32);
}

export function getRunCallerKey(caller: AuthCaller | null, headers: Headers) {
  if (!caller) {
    return getPublicRunCallerKey(headers);
  }

  const identity =
    caller.kind === "agent_token"
      ? `agent:${caller.agentTokenId}`
      : `user:${caller.userId}`;

  return createHash("sha256").update(identity).digest("hex").slice(0, 32);
}

function safeRateLimitPart(value: string) {
  const safe = value.replace(RATE_LIMIT_KEY_PART_RE, "-").slice(0, 96);
  return safe || PUBLIC_ANONYMOUS_RATE_LIMIT_ID;
}
