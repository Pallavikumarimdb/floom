"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
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

const PRODUCTION_FLOOM_URL = "https://floom-60sec.vercel.app";

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

  const origin =
    typeof window === "undefined" ? PRODUCTION_FLOOM_URL : window.location.origin;

  const publishCommand = useMemo(
    () =>
      `FLOOM_TOKEN=YOUR_FLOOM_AGENT_TOKEN FLOOM_API_URL=${origin} npx tsx cli/deploy.ts ./fixtures/python-simple`,
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
      <main className="min-h-screen bg-[#faf9f5] text-[#11110f]">
        <SiteHeader showProductLinks />
        <section className="mx-auto max-w-4xl px-5 py-14">
          <div className="flex items-center gap-3 text-neutral-500">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-emerald-600" />
            Loading tokens…
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf9f5] text-[#11110f]">
      <SiteHeader showProductLinks />
      <section className="mx-auto max-w-5xl px-5 py-12">
        {/* Header row */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="mb-3 text-sm font-semibold text-emerald-700">
              Builder token
            </p>
            <h1 className="text-4xl font-black tracking-tight">
              Publish apps from your agent
            </h1>
            <p className="mt-3 max-w-2xl text-neutral-600">
              Create a Floom agent token, then use it with the CLI to publish a
              local Python function as a live app page.
            </p>
            {email && (
              <p className="mt-2 text-sm text-neutral-500">
                Signed in as{" "}
                <span className="font-medium text-neutral-700">{email}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={signOut}
            className="shrink-0 rounded-lg border border-[#ded8cc] bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-[#f3f0ea]"
          >
            Sign out
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
          >
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        {/* Create + publish command */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          {/* Create form */}
          <div className="rounded-2xl border border-[#ded8cc] bg-white p-6 shadow-xl shadow-neutral-200/50">
            <h2 className="text-xl font-black">Create token</h2>
            <p className="mt-2 text-sm text-neutral-600">
              The raw token is shown once. Store it in your local secret manager.
            </p>
            <label
              className="mt-5 block text-sm font-bold"
              htmlFor="token-name"
            >
              Token name
            </label>
            <input
              id="token-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-lg border border-[#cfc7b8] bg-[#fffdf8] px-4 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
              placeholder="e.g. Launch token"
            />
            <button
              type="button"
              disabled={working}
              onClick={createToken}
              className="mt-5 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
            >
              {working ? "Working…" : "Create agent token"}
            </button>

            {/* Raw token — shown exactly once, clearly distinct */}
            {newToken && (
              <div
                role="status"
                className="mt-6 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 text-emerald-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path d="M12 2a5 5 0 0 1 5 5c0 2.4-1.7 4.4-4 4.9V13h2v2h-2v2h-2v-2H9v-2h2v-1.1A5 5 0 0 1 7 7a5 5 0 0 1 5-5z" />
                  </svg>
                  <p className="text-sm font-bold text-emerald-900">
                    Copy this token now — it will not be shown again
                  </p>
                </div>
                <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-emerald-200 bg-white p-3 text-xs text-emerald-950">
                  {newToken}
                </pre>
                <button
                  type="button"
                  onClick={() => copy(newToken, "token")}
                  className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
                >
                  {copied === "token" ? "Copied!" : "Copy token"}
                </button>
              </div>
            )}
          </div>

          {/* Publish command */}
          <div className="rounded-2xl border border-[#ded8cc] bg-white p-6 shadow-xl shadow-neutral-200/50">
            <h2 className="text-xl font-black">Publish command</h2>
            <p className="mt-2 text-sm text-neutral-600">
              From this repo, replace{" "}
              <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs">
                YOUR_FLOOM_AGENT_TOKEN
              </code>{" "}
              with the token you just copied.
            </p>
            <pre className="mt-4 overflow-auto rounded-lg bg-[#11110f] p-4 text-xs leading-6 text-white">
              {publishCommand}
            </pre>
            <button
              type="button"
              onClick={() => copy(publishCommand, "command")}
              className="mt-4 rounded-md border border-[#ded8cc] bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-[#f3f0ea]"
            >
              {copied === "command" ? "Copied!" : "Copy command"}
            </button>
            <p className="mt-5 text-sm text-neutral-600">
              Successful publish returns a{" "}
              <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs">
                /p/:slug
              </code>{" "}
              URL. Open that page and run the app in the browser.
            </p>
          </div>
        </div>

        {/* Token table */}
        <div className="mt-8 rounded-2xl border border-[#ded8cc] bg-white p-6">
          <h2 className="text-xl font-black">Existing tokens</h2>
          {tokens.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-[#ded8cc] py-10 text-center">
              <p className="text-sm font-semibold text-neutral-500">
                No tokens yet
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                Create your first token above to start publishing apps.
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-widest text-neutral-500">
                  <tr>
                    <th className="border-b border-[#ded8cc] py-3 pr-4">
                      Name
                    </th>
                    <th className="border-b border-[#ded8cc] py-3 pr-4">
                      Prefix
                    </th>
                    <th className="border-b border-[#ded8cc] py-3 pr-4">
                      Scopes
                    </th>
                    <th className="border-b border-[#ded8cc] py-3 pr-4">
                      Status
                    </th>
                    <th className="border-b border-[#ded8cc] py-3 pr-4">
                      Created
                    </th>
                    <th className="border-b border-[#ded8cc] py-3 pr-4">
                      Last used
                    </th>
                    <th className="border-b border-[#ded8cc] py-3 pr-4">
                      Expires
                    </th>
                    <th className="border-b border-[#ded8cc] py-3" />
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr key={token.id} className="group">
                      <td className="border-b border-[#eee8dc] py-3 pr-4 font-semibold">
                        {token.name}
                      </td>
                      <td className="border-b border-[#eee8dc] py-3 pr-4 font-mono text-xs text-neutral-500">
                        {token.token_prefix}…
                      </td>
                      <td className="border-b border-[#eee8dc] py-3 pr-4 text-neutral-600">
                        {token.scopes.join(", ")}
                      </td>
                      <td className="border-b border-[#eee8dc] py-3 pr-4">
                        {token.revoked_at ? (
                          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                            Revoked
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="border-b border-[#eee8dc] py-3 pr-4 text-neutral-500">
                        {relative(token.created_at)}
                      </td>
                      <td className="border-b border-[#eee8dc] py-3 pr-4 text-neutral-500">
                        {relative(token.last_used_at)}
                      </td>
                      <td className="border-b border-[#eee8dc] py-3 pr-4 text-neutral-500">
                        {token.expires_at
                          ? new Date(token.expires_at).toLocaleDateString()
                          : "Never"}
                      </td>
                      <td className="border-b border-[#eee8dc] py-3 text-right">
                        {!token.revoked_at && (
                          confirmRevoke === token.id ? (
                            <span className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={working}
                                onClick={() => revokeToken(token.id)}
                                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRevoke(null)}
                                className="rounded-md border border-[#ded8cc] bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={working}
                              onClick={() => setConfirmRevoke(token.id)}
                              className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 disabled:opacity-50"
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
          )}
        </div>

        <p className="mt-8 text-sm text-neutral-500">
          Production URL:{" "}
          <a
            href={PRODUCTION_FLOOM_URL}
            className="font-medium text-neutral-700 underline"
            target="_blank"
            rel="noreferrer"
          >
            {PRODUCTION_FLOOM_URL}
          </a>
        </p>
      </section>
    </main>
  );
}
