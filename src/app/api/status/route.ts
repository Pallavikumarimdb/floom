import { NextResponse } from "next/server";

// /api/status — health probe surface used by /status page + external monitoring.
// Returns { overall: "ok" | "degraded" | "down", checks: [...] } as JSON.
// Each check is fast (timeout-bounded) and best-effort. Never throws.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Check {
  name: string;
  status: "ok" | "degraded" | "down";
  latency_ms: number | null;
  detail: string;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function probe(name: string, url: string, timeoutMs = 3000): Promise<Check> {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    const latency = Date.now() - t0;
    if (res.ok) {
      return {
        name,
        status: latency > 1500 ? "degraded" : "ok",
        latency_ms: latency,
        detail: latency > 1500 ? `slow (${latency}ms)` : `ok (${latency}ms)`,
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
  const checks: Check[] = [];

  // Supabase Auth health endpoint (returns 200 when reachable).
  if (SUPABASE_URL) {
    checks.push(await probe("supabase", `${SUPABASE_URL}/auth/v1/health`));
  } else {
    checks.push({
      name: "supabase",
      status: "down",
      latency_ms: null,
      detail: "NEXT_PUBLIC_SUPABASE_URL not configured",
    });
  }

  // E2B sandbox public status page — they expose /api/status. Keep timeout
  // tight; if E2B is slow our run path is already slow.
  checks.push(await probe("e2b", "https://e2b.dev/api/health", 2500));

  // Self check — make sure our own MCP endpoint serves a tools/list at all.
  // Uses an absolute URL so this works in serverless invocations.
  // Skip in dev where we'd hit our own loopback awkwardly.
  if (process.env.VERCEL_URL) {
    checks.push(await probe("floom-mcp", `https://${process.env.VERCEL_URL}/mcp?probe=1`, 2000));
  }

  const downCount = checks.filter((c) => c.status === "down").length;
  const degradedCount = checks.filter((c) => c.status === "degraded").length;
  const overall: "ok" | "degraded" | "down" =
    downCount > 0 ? "down" : degradedCount > 0 ? "degraded" : "ok";

  return NextResponse.json(
    {
      overall,
      checks,
      checked_at: new Date().toISOString(),
    },
    {
      status: overall === "down" ? 503 : 200,
      headers: { "cache-control": "no-store" },
    },
  );
}
