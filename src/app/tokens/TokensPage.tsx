"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";
import { createClient } from "@/lib/supabase/client";

type AgentToken = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
};

const PRODUCTION_FLOOM_URL = "https://floom.dev";

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

export default function TokensPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [name, setName] = useState("Launch token");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const origin =
    typeof window === "undefined" ? PRODUCTION_FLOOM_URL : window.location.origin;

  const publishCommand = useMemo(
    () =>
      `FLOOM_TOKEN=YOUR_FLOOM_AGENT_TOKEN FLOOM_API_URL=${origin} npx @floomhq/cli@latest deploy`,
    [origin]
  );

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${accessToken}`,
    }),
    [accessToken]
  );

  const loadTokens = useCallback(async (token: string) => {
    const res = await fetch("/api/agent-tokens", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to load tokens");
    }
    setTokens(data.agent_tokens ?? []);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session) {
        router.replace("/login");
        return;
      }

      setAccessToken(session.access_token);
      setEmail(session.user.email ?? null);
      try {
        await loadTokens(session.access_token);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load tokens"
        );
      } finally {
        setLoading(false);
      }
    });
  }, [loadTokens, router]);

  async function createToken() {
    if (!accessToken) return;
    setWorking(true);
    setError(null);
    setNewToken(null);

    const res = await fetch("/api/agent-tokens", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setWorking(false);

    if (!res.ok) {
      setError(data.error || "Failed to create token");
      return;
    }

    setNewToken(data.token);
    await loadTokens(accessToken);
  }

  async function revokeToken(id: string) {
    if (!accessToken) return;
    setWorking(true);
    setError(null);
    setConfirmRevoke(null);

    const res = await fetch(`/api/agent-tokens/${id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    const data = await res.json();
    setWorking(false);

    if (!res.ok) {
      setError(data.error || "Failed to revoke token");
      return;
    }

    await loadTokens(accessToken);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1600);
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
        <SiteHeader />
        <main id="main" style={{ maxWidth: 900, margin: '0 auto', padding: '56px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 14 }}>
            <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--line)', borderTopColor: 'var(--accent)', animation: 'spin 0.7s linear infinite' }} />
            Loading tokens…
          </div>
        </main>
        <FloomFooter />
      </div>
    );
  }

  const cardStyle = {
    background: 'var(--card)',
    border: '1px solid var(--line)',
    borderRadius: 16,
    padding: '24px',
    boxShadow: 'var(--shadow-2)',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <SiteHeader />
      <main id="main" style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 8 }}>
          <div>
            <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
              Builder token
            </p>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', margin: 0, color: 'var(--ink)' }}>
              Publish apps from your agent
            </h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>
              Create a Floom agent token, then use it with the CLI to publish a local Python function as a live app page.
            </p>
            {email && (
              <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}>
                Signed in as{" "}
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{email}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={signOut}
            className="btn-outline sm"
          >
            Sign out
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            style={{
              marginTop: 20,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              borderRadius: 8,
              border: '1px solid var(--danger-border)',
              background: 'var(--danger-soft)',
              padding: '10px 14px',
            }}
          >
            <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--danger)', marginTop: 2 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--danger)', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* When no tokens: create form is the hero, publish command below */}
        {tokens.length === 0 ? (
          <>
            {/* First-time hint: only shown before any token exists AND before newToken is revealed */}
            {!newToken && (
              <div
                style={{
                  marginTop: 32,
                  padding: '20px 24px',
                  background: 'var(--accent-soft)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: 14,
                  maxWidth: 620,
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 14px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                  Your first 60 seconds
                </p>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  {[
                    { n: 1, text: 'Mint a token below.' },
                    { n: 2, text: <>Run <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>npx @floomhq/cli setup</code> and paste it.</> },
                    { n: 3, text: 'Drop a Python file in. Floom does the rest.' },
                  ].map(({ n, text }) => (
                    <div
                      key={n}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        flex: '1 1 180px',
                        minWidth: 160,
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: "'JetBrains Mono', monospace",
                          marginTop: 1,
                        }}
                      >
                        {n}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 24, maxWidth: 460, ...cardStyle }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.015em' }}>Create your first token</h2>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px', lineHeight: 1.55 }}>
                The raw token is shown once. Store it in your local secret manager.
              </p>
              <label
                style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}
                htmlFor="token-name"
              >
                Token name
              </label>
              <input
                id="token-name"
                ref={nameInputRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="input-field"
                placeholder="e.g. Launch token"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 16 }}
              />
              <button
                type="button"
                disabled={working}
                onClick={createToken}
                className="btn-primary"
                style={{ opacity: working ? 0.6 : 1 }}
              >
                {working ? "Working…" : "Create agent token"}
              </button>

              {newToken && (
                <div
                  role="status"
                  style={{
                    marginTop: 20,
                    borderRadius: 10,
                    border: '2px solid var(--accent-border)',
                    background: 'var(--accent-soft)',
                    padding: 16,
                  }}
                >
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', margin: '0 0 10px' }}>
                    Copy this token now — it will not be shown again
                  </p>
                  <pre style={{ maxHeight: 120, overflow: 'auto', borderRadius: 8, border: '1px solid var(--accent-border)', background: 'var(--card)', padding: '10px 12px', fontSize: 11.5, margin: '0 0 10px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--ink)', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                    {newToken}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copy(newToken, "token")}
                    className="btn-primary sm"
                  >
                    {copied === "token" ? "✓ Copied" : "Copy token"}
                  </button>
                </div>
              )}
            </div>

            <div style={{ marginTop: 24, maxWidth: 640, ...cardStyle }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.01em' }}>Publish command</h2>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.55 }}>
                Replace <code style={{ fontFamily: "'JetBrains Mono', monospace", background: 'var(--studio)', padding: '1px 5px', borderRadius: 4, fontSize: 11.5 }}>YOUR_FLOOM_AGENT_TOKEN</code> with the token you just copied.
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--terminal-bg)', borderRadius: 8, padding: '12px 14px' }}>
                <pre style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: 'var(--terminal-ink)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.7 }}>
                  {publishCommand}
                </pre>
                <button
                  type="button"
                  onClick={() => copy(publishCommand, "command")}
                  style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: copied === 'command' ? '#fff' : 'var(--code-accent)', background: 'transparent', border: `1px solid ${copied === 'command' ? 'var(--code-accent)' : 'rgba(110,231,183,0.3)'}`, borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.1s', whiteSpace: 'nowrap' }}
                >
                  {copied === "command" ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>
          </>
        ) : (
          /* When tokens exist: table leads, create form demoted */
          <>
            {/* Token table — '+ New token' button removed; the Create card
                below is the single token-minting affordance. Two buttons in
                close visual proximity doing the same thing read as
                duplication. */}
            <div style={{ marginTop: 32, ...cardStyle }}>
              <div style={{ marginBottom: 18 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.015em' }}>Agent tokens</h2>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                  <thead>
                    <tr>
                      {['Name', 'Prefix', 'Scopes', 'Status', 'Created', 'Last used', 'Expires', ''].map((h) => (
                        <th key={h} style={{ borderBottom: '1px solid var(--line)', padding: '6px 12px 10px 0', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((token) => (
                      <tr key={token.id}>
                        <td style={{ borderBottom: '1px solid var(--line)', padding: '10px 12px 10px 0', fontWeight: 600, color: 'var(--ink)' }}>
                          {token.name}
                        </td>
                        <td style={{ borderBottom: '1px solid var(--line)', padding: '10px 12px 10px 0', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: 'var(--muted)' }}>
                          {token.token_prefix}…
                        </td>
                        <td style={{ borderBottom: '1px solid var(--line)', padding: '10px 12px 10px 0', color: 'var(--muted)' }}>
                          {token.scopes.join(", ")}
                        </td>
                        <td style={{ borderBottom: '1px solid var(--line)', padding: '10px 12px 10px 0' }}>
                          {token.revoked_at ? (
                            <span style={{ borderRadius: 999, background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', padding: '2px 8px', fontSize: 11, fontWeight: 600, color: 'var(--danger)' }}>
                              Revoked
                            </span>
                          ) : (
                            <span style={{ borderRadius: 999, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', padding: '2px 8px', fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
                              Active
                            </span>
                          )}
                        </td>
                        <td style={{ borderBottom: '1px solid var(--line)', padding: '10px 12px 10px 0', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {relative(token.created_at)}
                        </td>
                        <td style={{ borderBottom: '1px solid var(--line)', padding: '10px 12px 10px 0', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {relative(token.last_used_at)}
                        </td>
                        <td style={{ borderBottom: '1px solid var(--line)', padding: '10px 12px 10px 0', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {token.expires_at ? new Date(token.expires_at).toLocaleDateString() : "Never"}
                        </td>
                        <td style={{ borderBottom: '1px solid var(--line)', padding: '10px 0 10px 0', textAlign: 'right' }}>
                          {!token.revoked_at && (
                            confirmRevoke === token.id ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <button
                                  type="button"
                                  disabled={working}
                                  onClick={() => revokeToken(token.id)}
                                  style={{ background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: working ? 0.6 : 1 }}
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRevoke(null)}
                                  style={{ background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={working}
                                onClick={() => setConfirmRevoke(token.id)}
                                style={{ background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger-border)', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: working ? 0.6 : 1 }}
                              >
                                Revoke
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Demoted create form */}
            <div style={{ marginTop: 24, display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)' }}>
              <div style={cardStyle}>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.01em' }}>Create token</h2>
                <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.55 }}>
                  The raw token is shown once. Store it in your local secret manager.
                </p>
                <label
                  style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}
                  htmlFor="token-name"
                >
                  Token name
                </label>
                <input
                  id="token-name"
                  ref={nameInputRef}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="input-field"
                  placeholder="e.g. Launch token"
                  style={{ width: '100%', boxSizing: 'border-box', marginBottom: 14 }}
                />
                <button
                  type="button"
                  disabled={working}
                  onClick={createToken}
                  className="btn-primary sm"
                  style={{ opacity: working ? 0.6 : 1 }}
                >
                  {working ? "Working…" : "Create agent token"}
                </button>
                {newToken && (
                  <div
                    role="status"
                    style={{
                      marginTop: 16,
                      borderRadius: 10,
                      border: '2px solid var(--accent-border)',
                      background: 'var(--accent-soft)',
                      padding: 14,
                    }}
                  >
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', margin: '0 0 8px' }}>
                      Copy now — not shown again
                    </p>
                    <pre style={{ maxHeight: 80, overflow: 'auto', borderRadius: 6, border: '1px solid var(--accent-border)', background: 'var(--card)', padding: '8px 10px', fontSize: 11, margin: '0 0 8px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--ink)', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                      {newToken}
                    </pre>
                    <button
                      type="button"
                      onClick={() => copy(newToken, "token")}
                      className="btn-primary sm"
                    >
                      {copied === "token" ? "✓ Copied" : "Copy token"}
                    </button>
                  </div>
                )}
              </div>

              <div style={cardStyle}>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.01em' }}>Publish command</h2>
                <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.55 }}>
                  Replace <code style={{ fontFamily: "'JetBrains Mono', monospace", background: 'var(--studio)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>YOUR_FLOOM_AGENT_TOKEN</code> with the token.
                </p>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--terminal-bg)', borderRadius: 8, padding: '10px 12px' }}>
                  <pre style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: 'var(--terminal-ink)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.7 }}>
                    {publishCommand}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copy(publishCommand, "command")}
                    style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: copied === 'command' ? '#fff' : 'var(--code-accent)', background: 'transparent', border: `1px solid ${copied === 'command' ? 'var(--code-accent)' : 'rgba(110,231,183,0.3)'}`, borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                  >
                    {copied === "command" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Production URL line removed — the user
            is already on that URL; showing it as a link opens-in-new-tab to
            the same page is noise, not signal. */}
      </main>
      <FloomFooter />
    </div>
  );
}
