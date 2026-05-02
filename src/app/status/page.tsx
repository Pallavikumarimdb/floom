import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";

const SITE_URL = "https://floom.dev";
const STATUS_API_ORIGIN =
  cleanOrigin(process.env.FLOOM_ORIGIN) ??
  cleanOrigin(process.env.NEXT_PUBLIC_FLOOM_ORIGIN) ??
  cleanOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
  SITE_URL;

export const metadata: Metadata = {
  title: "Status",
  description: "Live status of Floom services — Supabase auth, E2B sandbox runtime, and the Floom MCP endpoint.",
  alternates: { canonical: `${SITE_URL}/status` },
  // Don't index — the page is purely real-time, no canonical content for crawlers.
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Check {
  name: string;
  status: "ok" | "degraded" | "down";
  latency_ms: number | null;
  detail: string;
}

interface StatusPayload {
  overall: "ok" | "degraded" | "down";
  checks: Check[];
  checked_at: string;
}

const STATUS_LABEL: Record<Check["status"], string> = {
  ok: "Operational",
  degraded: "Degraded",
  down: "Down",
};

const STATUS_COLOR: Record<Check["status"], string> = {
  ok: "var(--accent)",
  degraded: "#c2791c",
  down: "var(--danger)",
};

const SERVICE_LABEL: Record<string, string> = {
  supabase: "Supabase Auth + Postgres",
  e2b: "E2B Sandbox Runtime",
  "floom-mcp": "Floom MCP endpoint",
};

async function fetchStatus(): Promise<StatusPayload | null> {
  try {
    const res = await fetch(`${STATUS_API_ORIGIN}/api/status`, { cache: "no-store" });
    if (!res.ok && res.status !== 503) return null;
    return (await res.json()) as StatusPayload;
  } catch {
    return null;
  }
}

function cleanOrigin(rawOrigin: string | undefined): string | null {
  if (!rawOrigin) return null;
  try {
    const origin = new URL(rawOrigin);
    if (!["https:", "http:"].includes(origin.protocol)) return null;
    return origin.origin;
  } catch {
    return null;
  }
}

export default async function StatusPage() {
  const data = await fetchStatus();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)", display: "flex", flexDirection: "column" }}>
      <SiteHeader />
      <main id="main" style={{ flex: 1, maxWidth: 720, margin: "0 auto", padding: "56px 24px 80px", width: "100%" }}>
        <p
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--accent)",
            margin: 0,
          }}
        >
          Floom status
        </p>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.025em", margin: "10px 0 8px" }}>
          {data?.overall === "ok" && "All systems operational."}
          {data?.overall === "degraded" && "Some services are degraded."}
          {data?.overall === "down" && "We're investigating an outage."}
          {!data && "Status check failed."}
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 28px", lineHeight: 1.55 }}>
          {data
            ? `Last checked ${new Date(data.checked_at).toLocaleString()}. Refresh to re-probe.`
            : "Could not reach the Floom status endpoint just now. Refresh to retry."}
        </p>

        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {(data?.checks ?? []).map((check, i) => (
            <div
              key={check.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
                gap: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    background: STATUS_COLOR[check.status],
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                    {SERVICE_LABEL[check.name] ?? check.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{check.detail}</div>
                </div>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: STATUS_COLOR[check.status],
                  whiteSpace: "nowrap",
                }}
              >
                {STATUS_LABEL[check.status]}
              </span>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 28, fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
          For incident updates, follow{" "}
          <a
            href="https://github.com/floomhq/floom-minimal"
            style={{ fontWeight: 600, color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            floomhq/floom-minimal
          </a>{" "}
          on GitHub or watch our Discord. Programmatic monitoring can poll{" "}
          <code style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 5px" }}>
            /api/status
          </code>{" "}
          (returns 200 / 503 + JSON checks array).
        </p>
      </main>
      <FloomFooter />
    </div>
  );
}
