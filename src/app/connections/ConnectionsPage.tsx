"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";
import { createClient } from "@/lib/supabase/client";

type Connection = {
  id: string;
  provider: string;
  composio_account_id: string;
  scopes: string[];
  status: string;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
};

type Toolkit = {
  name: string;
  slug: string;
  coming_soon: boolean;
  meta: {
    description: string;
    logo: string;
    categories: Array<{ id: string; name: string }>;
  };
};

function relative(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ConnectionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [toolkits, setToolkits] = useState<Toolkit[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null); // slug being connected
  const [disconnecting, setDisconnecting] = useState<string | null>(null); // id being disconnected
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Read flash params from Composio callback
  useEffect(() => {
    const connected = searchParams.get("connected");
    const errorParam = searchParams.get("error");
    const statusParam = searchParams.get("status");

    let nextToast: string | null = null;
    let nextError: string | null = null;

    if (connected === "1") {
      nextToast = "Connection successful.";
    } else if (errorParam === "oauth_failed") {
      nextError = "OAuth was cancelled or failed. Please try again.";
    } else if (errorParam === "missing_connection_id") {
      nextError = "Composio callback was missing the connection identifier. Please try again.";
    } else if (errorParam === "db_update_failed") {
      nextError = "Connection was authorised but failed to save. Please contact support.";
    } else if (statusParam === "pending") {
      nextToast = "Connection is still in progress. Refresh in a moment.";
    } else if (statusParam === "failed") {
      nextError = "Connection failed. Please try again.";
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (nextToast) setToast(nextToast);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (nextError) setError(nextError);
  }, [searchParams]);

  // Dismiss toast after 4s
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadConnections = useCallback(async (token: string) => {
    const res = await fetch("/api/composio/connections", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load connections");
    setConnections(data.connections ?? []);
  }, []);

  const loadToolkits = useCallback(async () => {
    try {
      const res = await fetch("/api/composio/toolkits");
      if (!res.ok) return;
      const data = await res.json();
      setToolkits(data.toolkits ?? []);
    } catch {
      // Non-fatal: toolkit list is optional
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session) {
        router.replace("/login?next=/connections");
        return;
      }
      setAccessToken(session.access_token);
      setEmail(session.user.email ?? null);
      try {
        await Promise.all([
          loadConnections(session.access_token),
          loadToolkits(),
        ]);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    });
  }, [loadConnections, loadToolkits, router]);

  async function connect(providerSlug: string) {
    if (!accessToken) return;
    setWorking(providerSlug);
    setError(null);

    try {
      const res = await fetch("/api/composio/oauth/start", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider: providerSlug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start connection");
        setWorking(null);
        return;
      }
      // Redirect to Composio OAuth hosted page
      window.location.assign(data.authorize_url as string);
    } catch {
      setError("Network error starting connection");
      setWorking(null);
    }
  }

  async function disconnect(id: string) {
    if (!accessToken) return;
    setDisconnecting(id);
    setError(null);

    try {
      const res = await fetch(`/api/composio/connections?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to disconnect");
        setDisconnecting(null);
        return;
      }
      await loadConnections(accessToken);
    } catch {
      setError("Network error disconnecting");
    } finally {
      setDisconnecting(null);
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const activeConnections = connections.filter((c) => c.status === "active");
  const connectedSlugs = new Set(activeConnections.map((c) => c.provider));

  // Show toolkits not yet connected
  const availableToolkits = toolkits.filter((t) => !connectedSlugs.has(t.slug));

  const cardStyle: React.CSSProperties = {
    background: "var(--card)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    padding: "24px",
    boxShadow: "var(--shadow-2)",
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
        <SiteHeader />
        <main id="main" style={{ maxWidth: 900, margin: "0 auto", padding: "56px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 14 }}>
            <span style={{ display: "inline-block", width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--line)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite" }} />
            Loading connections...
          </div>
        </main>
        <FloomFooter hideTagline />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
      <SiteHeader />
      <main id="main" style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Header row */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 8 }}>
          <div>
            <p style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
              Composio integrations
            </p>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.025em", margin: 0, color: "var(--ink)" }}>
              Connected services
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 8, lineHeight: 1.6 }}>
              Connect external tools so your Floom agents can call them via the proxy.
            </p>
            {email && (
              <p style={{ marginTop: 6, fontSize: 12.5, color: "var(--muted)" }}>
                Signed in as <span style={{ fontWeight: 600, color: "var(--ink)" }}>{email}</span>
              </p>
            )}
          </div>
          <button type="button" onClick={signOut} className="btn-outline sm">
            Sign out
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div
            role="status"
            style={{
              marginTop: 20,
              display: "flex",
              alignItems: "center",
              gap: 10,
              borderRadius: 8,
              border: "1px solid var(--accent-border)",
              background: "var(--accent-soft)",
              padding: "10px 14px",
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true" style={{ flexShrink: 0, color: "var(--accent)" }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)", margin: 0 }}>{toast}</p>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            style={{
              marginTop: 20,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              borderRadius: 8,
              border: "1px solid var(--danger-border)",
              background: "var(--danger-soft)",
              padding: "10px 14px",
            }}
          >
            <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, color: "var(--danger)", marginTop: 2 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--danger)", margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Active connections */}
        <div style={{ marginTop: 32, ...cardStyle }}>
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "-0.015em" }}>Active connections</h2>
          </div>
          {activeConnections.length === 0 ? (
            <p style={{ fontSize: 13.5, color: "var(--muted)", margin: 0 }}>
              No active connections yet. Connect a service below.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 540, borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                <thead>
                  <tr>
                    {["Provider", "Status", "Connected", ""].map((h) => (
                      <th key={h} style={{ borderBottom: "1px solid var(--line)", padding: "6px 12px 10px 0", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeConnections.map((conn) => {
                    const toolkit = toolkits.find((t) => t.slug === conn.provider);
                    return (
                      <tr key={conn.id}>
                        <td style={{ borderBottom: "1px solid var(--line)", padding: "10px 12px 10px 0" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {toolkit?.meta.logo && (
                              <img
                                src={toolkit.meta.logo}
                                alt=""
                                width={20}
                                height={20}
                                style={{ borderRadius: 4, objectFit: "contain" }}
                              />
                            )}
                            <span style={{ fontWeight: 600, color: "var(--ink)", textTransform: "capitalize" }}>
                              {toolkit?.name ?? conn.provider}
                            </span>
                          </div>
                        </td>
                        <td style={{ borderBottom: "1px solid var(--line)", padding: "10px 12px 10px 0" }}>
                          <span style={{ borderRadius: 999, background: "var(--accent-soft)", border: "1px solid var(--accent-border)", padding: "2px 8px", fontSize: 11, fontWeight: 600, color: "var(--accent)" }}>
                            Active
                          </span>
                        </td>
                        <td style={{ borderBottom: "1px solid var(--line)", padding: "10px 12px 10px 0", color: "var(--muted)", whiteSpace: "nowrap" }}>
                          {relative(conn.created_at)}
                        </td>
                        <td style={{ borderBottom: "1px solid var(--line)", padding: "10px 0 10px 0", textAlign: "right" }}>
                          <button
                            type="button"
                            disabled={disconnecting === conn.id}
                            onClick={() => disconnect(conn.id)}
                            style={{
                              background: "var(--danger-soft)",
                              color: "var(--danger)",
                              border: "1px solid var(--danger-border)",
                              borderRadius: 6,
                              padding: "4px 10px",
                              fontSize: 11.5,
                              fontWeight: 700,
                              cursor: "pointer",
                              fontFamily: "inherit",
                              opacity: disconnecting === conn.id ? 0.6 : 1,
                            }}
                          >
                            {disconnecting === conn.id ? "Disconnecting..." : "Disconnect"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Available toolkits to connect */}
        {availableToolkits.length > 0 && (
          <div style={{ marginTop: 24, ...cardStyle }}>
            <div style={{ marginBottom: 18 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.015em" }}>Connect a service</h2>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                Authorize a service once, then your agent tokens can call its tools via the Floom proxy.
              </p>
            </div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
              {availableToolkits.slice(0, 24).map((toolkit) => (
                <div
                  key={toolkit.slug}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    background: "var(--bg)",
                  }}
                >
                  {toolkit.meta.logo ? (
                    <img
                      src={toolkit.meta.logo}
                      alt=""
                      width={28}
                      height={28}
                      style={{ borderRadius: 6, objectFit: "contain", flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--line)", flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.2 }}>
                      {toolkit.name}
                    </div>
                    {toolkit.meta.categories?.[0] && (
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, textTransform: "capitalize" }}>
                        {toolkit.meta.categories[0].name}
                      </div>
                    )}
                  </div>
                  {toolkit.coming_soon ? (
                    <span
                      style={{
                        flexShrink: 0,
                        display: "inline-block",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: "var(--muted)",
                        background: "var(--line)",
                        border: "1px solid var(--line)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Coming soon
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={working === toolkit.slug}
                      onClick={() => connect(toolkit.slug)}
                      className="btn-primary sm"
                      style={{ flexShrink: 0, opacity: working === toolkit.slug ? 0.6 : 1 }}
                    >
                      {working === toolkit.slug ? "..." : "Connect"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending connections (in case any are stuck pending) */}
        {connections.filter((c) => c.status === "pending").length > 0 && (
          <div style={{ marginTop: 24, ...cardStyle }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px", letterSpacing: "-0.01em" }}>Pending</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {connections.filter((c) => c.status === "pending").map((conn) => (
                <div
                  key={conn.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: "10px 14px",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--muted)", flex: 1, textTransform: "capitalize" }}>
                    {conn.provider}
                  </span>
                  <span style={{ borderRadius: 999, background: "var(--line)", padding: "2px 8px", fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>
                    Pending
                  </span>
                  <button
                    type="button"
                    disabled={disconnecting === conn.id}
                    onClick={() => disconnect(conn.id)}
                    style={{
                      background: "transparent",
                      color: "var(--muted)",
                      border: "1px solid var(--line)",
                      borderRadius: 6,
                      padding: "3px 8px",
                      fontSize: 11.5,
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Proxy usage hint */}
        <div style={{ marginTop: 24, ...cardStyle }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.01em" }}>Using connections from an agent</h2>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.55 }}>
            Once connected, use the <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, background: "var(--terminal-bg)", padding: "1px 5px", borderRadius: 4 }}>connection_id</code> from <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, background: "var(--terminal-bg)", padding: "1px 5px", borderRadius: 4 }}>list_my_connections</code> to call tools:
          </p>
          <div style={{ background: "var(--terminal-bg)", borderRadius: 8, padding: "12px 14px" }}>
            <pre style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--terminal-ink)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.7 }}>
{`POST /api/composio/proxy
Authorization: Bearer <agent-token>

{
  "connection_id": "<uuid>",
  "tool_slug": "GMAIL_FETCH_EMAILS",
  "arguments": { "max_results": 5 }
}`}
            </pre>
          </div>
        </div>

      </main>
      <FloomFooter hideTagline />
    </div>
  );
}
