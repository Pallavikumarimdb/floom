import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";
import { PageToC } from "@/components/PageToC";
import { SITE_URL, siteOrigin } from "@/lib/config/origin";

const STATUS_API_ORIGIN = siteOrigin();

export const metadata: Metadata = {
  title: "Status",
  description: "Live system health for floom.dev — database, app runtime, queue, email delivery, and API.",
  alternates: { canonical: `${SITE_URL}/status` },
  // Don't index — the page is purely real-time, no canonical content for crawlers.
  robots: { index: false, follow: true },
  openGraph: {
    title: "Status · Floom",
    description: "Live system health for floom.dev.",
    url: `${SITE_URL}/status`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Status · Floom",
  },
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

// User-facing names for each internal subsystem key.
// /api/status JSON uses the internal keys for BetterStack and monitoring tools.
// This mapping is display-only.
const SERVICE_LABEL: Record<string, string> = {
  supabase: "Database",
  e2b: "App runtime",
  "floom-mcp": "API",
  qstash: "Background jobs",
  resend: "Email delivery",
};

// Plain-language status descriptions per subsystem per state.
// Shown below the service name on the status page.
const SERVICE_DETAIL: Record<string, Record<Check["status"], string>> = {
  supabase: {
    ok: "Accounts, data, and sign-in are working normally.",
    degraded: "Accounts and data may be slow to respond.",
    down: "Sign-in and data access may be unavailable.",
  },
  e2b: {
    ok: "Apps are running normally.",
    degraded: "Apps may start or run more slowly than usual.",
    down: "Apps may fail to start or time out.",
  },
  "floom-mcp": {
    ok: "The API is responding normally.",
    degraded: "API responses may be slower than usual.",
    down: "The API may be unreachable.",
  },
  qstash: {
    ok: "Background jobs are running normally.",
    degraded: "Background jobs may run more slowly than usual.",
    down: "Background jobs may be delayed or stuck.",
  },
  resend: {
    ok: "Emails are sending normally.",
    degraded: "Emails may be delayed.",
    down: "Email delivery may be unavailable.",
  },
};

const TOC_ITEMS = [
  { id: "overall-status", label: "Overall status" },
  { id: "subsystems", label: "Subsystems" },
  { id: "incident-updates", label: "Incident updates" },
];

async function fetchStatus(): Promise<StatusPayload | null> {
  try {
    const res = await fetch(`${STATUS_API_ORIGIN}/api/status`, { cache: "no-store" });
    if (!res.ok && res.status !== 503) return null;
    return (await res.json()) as StatusPayload;
  } catch {
    return null;
  }
}

export default async function StatusPage() {
  const data = await fetchStatus();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)", display: "flex", flexDirection: "column" }}>
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-5 py-14 w-full flex-1">
        <div className="flex gap-14">
          <PageToC items={TOC_ITEMS} />
          <main id="main" style={{ minWidth: 0, flex: 1, maxWidth: 720 }}>

            <section id="overall-status" style={{ marginBottom: 40 }}>
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
              <p style={{ fontSize: 14, color: "var(--muted)", margin: 0, lineHeight: 1.55 }}>
                {data
                  ? `Last checked ${new Date(data.checked_at).toLocaleString()}. Refresh to re-probe.`
                  : "Could not reach the Floom status endpoint just now. Refresh to retry."}
              </p>
            </section>

            <section id="subsystems" style={{ marginBottom: 40 }}>
              <div
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {(data?.checks ?? []).map((check, i) => {
                  const userDetail =
                    SERVICE_DETAIL[check.name]?.[check.status] ?? check.detail;
                  return (
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
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                            {userDetail}
                          </div>
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
                  );
                })}
              </div>
            </section>

            <section id="incident-updates">
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
                For incident updates, follow{" "}
                <a
                  href="https://github.com/floomhq/floom"
                  style={{ fontWeight: 600, color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
                >
                  floomhq/floom
                </a>{" "}
                on GitHub or watch our Discord. Programmatic monitoring can poll{" "}
                <code style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 5px" }}>
                  /api/status
                </code>{" "}
                (returns 200 / 503 + JSON checks array).
              </p>
            </section>

          </main>
        </div>
      </div>
      <FloomFooter />
    </div>
  );
}
