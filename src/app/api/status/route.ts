import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/config/origin";

// /api/status — health probe surface used by /status page + external monitoring.
// Returns { overall: "ok" | "degraded" | "down", checks: [...] } as JSON.
// Each check is fast (timeout-bounded) and best-effort. Never throws.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory cache per Vercel instance. Resets on cold start.
// With multiple instances each gets its own cache — BetterStack still
// detects outages within ~30-60s (one TTL window).
interface StatusCacheEntry {
  result: { overall: string; checks: Check[]; checked_at: string };
  ts: number;
}
let statusCache: StatusCacheEntry | null = null;
const STATUS_CACHE_MS = 30_000;

interface Check {
  name: string;
  status: "ok" | "degraded" | "down";
  latency_ms: number | null;
  detail: string;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const FLOOM_ORIGIN = siteOrigin();

interface ProbeOptions {
  timeoutMs?: number;
  headers?: HeadersInit;
  okStatuses?: number[];
}

async function probe(name: string, url: string, options: ProbeOptions = {}): Promise<Check> {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 3000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: options.headers,
    });
    clearTimeout(timer);
    const latency = Date.now() - t0;
    if (res.ok || options.okStatuses?.includes(res.status)) {
      return {
        name,
        status: latency > 1500 ? "degraded" : "ok",
        latency_ms: latency,
        detail:
          res.ok
            ? latency > 1500
              ? `slow (${latency}ms)`
              : `ok (${latency}ms)`
            : `reachable (HTTP ${res.status}, ${latency}ms)`,
      };
    }
    return {
      name,
      status: "down",
      latency_ms: latency,
      detail: `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      name,
      status: "down",
      latency_ms: Date.now() - t0,
      detail: err instanceof Error ? err.message : "unreachable",
    };
  }
}

export async function GET() {
  const now = Date.now();
  if (statusCache && now - statusCache.ts < STATUS_CACHE_MS) {
    return NextResponse.json(statusCache.result, {
      status: statusCache.result.overall === "down" ? 503 : 200,
      headers: { "Cache-Control": "public, max-age=30" },
    });
  }

  const checks: Check[] = [];

  // Supabase Auth health requires the anon API key on hosted Supabase.
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    checks.push(
      await probe("supabase", `${SUPABASE_URL}/auth/v1/health`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        okStatuses: [401],
      }),
    );
  } else {
    checks.push({
      name: "supabase",
      status: "down",
      latency_ms: null,
      detail: "Supabase URL or anon key not configured",
    });
  }

  // E2B sandbox public status page — they expose /api/status. Keep timeout
  // tight; if E2B is slow our run path is already slow.
  checks.push(await probe("e2b", "https://e2b.dev/api/health", { timeoutMs: 2500 }));

  // Self check via the public origin. Vercel deployment URLs can require SSO,
  // while the canonical origin is the user-facing surface we launch.
  checks.push(await probe("floom-mcp", `${FLOOM_ORIGIN}/mcp`, { timeoutMs: 2000 }));

  // QStash — upstash message queue used by every async run path.
  // A 401 means the key is present but we're on a restricted endpoint; that's fine —
  // it proves the service is reachable. Only skip the probe if the env var is missing.
  if (process.env.QSTASH_TOKEN) {
    const qstashBase = process.env.QSTASH_URL ?? "https://qstash-us-east-1.upstash.io";
    checks.push(
      await probe("qstash", `${qstashBase.replace(/\/$/, "")}/v2/topics`, {
        headers: { Authorization: `Bearer ${process.env.QSTASH_TOKEN}` },
        timeoutMs: 2500,
        okStatuses: [200, 401, 403],
      }),
    );
  }

  // Resend — transactional email for quota warnings and notifications.
  // Same logic: 401/403 means reachable.
  if (process.env.RESEND_API_KEY) {
    checks.push(
      await probe("resend", "https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        timeoutMs: 2500,
        okStatuses: [200, 401, 403],
      }),
    );
  }

  const downCount = checks.filter((c) => c.status === "down").length;
  const degradedCount = checks.filter((c) => c.status === "degraded").length;
  const overall: "ok" | "degraded" | "down" =
    downCount > 0 ? "down" : degradedCount > 0 ? "degraded" : "ok";

  const result = { overall, checks, checked_at: new Date().toISOString() };
  statusCache = { result, ts: Date.now() };

  return NextResponse.json(result, {
    status: overall === "down" ? 503 : 200,
    headers: { "Cache-Control": "public, max-age=30" },
  });
}
