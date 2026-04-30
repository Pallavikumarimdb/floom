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
  const origin =
    typeof window === "undefined" ? PRODUCTION_FLOOM_URL : window.location.origin;

  const publishCommand = useMemo(
    () => `FLOOM_TOKEN=YOUR_FLOOM_AGENT_TOKEN FLOOM_API_URL=${origin} npx tsx cli/deploy.ts ./fixtures/python-simple`,
    [origin]
  );

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${accessToken}`,
    }),
    [accessToken]
  );

  const loadTokens = useCallback(
    async (token: string) => {
      const res = await fetch("/api/agent-tokens", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load tokens");
      }
      setTokens(data.agent_tokens ?? []);
    },
    []
  );

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
        setError(loadError instanceof Error ? loadError.message : "Failed to load tokens");
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
          <p className="text-neutral-600">Loading tokens...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf9f5] text-[#11110f]">
      <SiteHeader showProductLinks />
      <section className="mx-auto max-w-5xl px-5 py-12">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="mb-3 text-sm font-semibold text-emerald-700">
              Builder token
            </p>
            <h1 className="text-4xl font-black tracking-tight">Publish apps from your agent</h1>
            <p className="mt-3 max-w-2xl text-neutral-600">
              Create a Floom agent token, then use it with the CLI or skill to
              publish a local Python function as a live app page.
            </p>
            {email && <p className="mt-3 text-sm text-neutral-500">Signed in as {email}</p>}
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg border border-[#ded8cc] bg-white px-4 py-2 text-sm font-semibold text-neutral-700"
          >
            Sign out
          </button>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="rounded-2xl border border-[#ded8cc] bg-white p-6 shadow-xl shadow-neutral-200/50">
            <h2 className="text-xl font-black">Create token</h2>
            <p className="mt-2 text-sm text-neutral-600">
              The raw token is shown once. Store it in your local secret manager.
            </p>
            <label className="mt-5 block text-sm font-bold" htmlFor="token-name">
              Token name
            </label>
            <input
              id="token-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-lg border border-[#cfc7b8] bg-[#fffdf8] px-3 py-3 outline-none focus:border-emerald-700"
            />
            <button
              type="button"
              disabled={working}
              onClick={createToken}
              className="mt-5 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              {working ? "Working..." : "Create agent token"}
            </button>

            {newToken && (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-bold text-emerald-900">Copy this token now</p>
                <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-white p-3 text-xs text-emerald-950">
                  {newToken}
                </pre>
                <button
                  type="button"
                  onClick={() => copy(newToken, "token")}
                  className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
                >
                  {copied === "token" ? "Copied" : "Copy token"}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#ded8cc] bg-white p-6 shadow-xl shadow-neutral-200/50">
            <h2 className="text-xl font-black">Publish command</h2>
            <p className="mt-2 text-sm text-neutral-600">
              From this repo, replace `YOUR_FLOOM_AGENT_TOKEN` with the token you just copied.
            </p>
            <pre className="mt-4 overflow-auto rounded-lg bg-[#11110f] p-4 text-xs leading-6 text-white">
              {publishCommand}
            </pre>
            <button
              type="button"
              onClick={() => copy(publishCommand, "command")}
              className="mt-4 rounded-md border border-[#ded8cc] bg-white px-4 py-2 text-sm font-semibold text-neutral-700"
            >
              {copied === "command" ? "Copied" : "Copy command"}
            </button>
            <p className="mt-5 text-sm text-neutral-600">
              Successful publish returns a `/p/:slug` URL. Open that page and run the app in the browser.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-[#ded8cc] bg-white p-6">
          <h2 className="text-xl font-black">Existing tokens</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-widest text-neutral-500">
                <tr>
                  <th className="border-b border-[#ded8cc] py-3 pr-4">Name</th>
                  <th className="border-b border-[#ded8cc] py-3 pr-4">Prefix</th>
                  <th className="border-b border-[#ded8cc] py-3 pr-4">Scopes</th>
                  <th className="border-b border-[#ded8cc] py-3 pr-4">Status</th>
                  <th className="border-b border-[#ded8cc] py-3 pr-4">Expires</th>
                  <th className="border-b border-[#ded8cc] py-3 pr-4" />
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id}>
                    <td className="border-b border-[#eee8dc] py-3 pr-4 font-semibold">
                      {token.name}
                    </td>
                    <td className="border-b border-[#eee8dc] py-3 pr-4 font-mono text-xs">
                      {token.token_prefix}...
                    </td>
                    <td className="border-b border-[#eee8dc] py-3 pr-4">
                      {token.scopes.join(", ")}
                    </td>
                    <td className="border-b border-[#eee8dc] py-3 pr-4">
                      {token.revoked_at ? "Revoked" : "Active"}
                    </td>
                    <td className="border-b border-[#eee8dc] py-3 pr-4">
                      {token.expires_at ? new Date(token.expires_at).toLocaleDateString() : "Never"}
                    </td>
                    <td className="border-b border-[#eee8dc] py-3 pr-4 text-right">
                      {!token.revoked_at && (
                        <button
                          type="button"
                          disabled={working}
                          onClick={() => revokeToken(token.id)}
                          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {tokens.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-500">
                      No tokens yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-8 text-sm text-neutral-500">
          Launch claim: Local Python function to secure live app in 60 seconds after Floom auth/token setup.
          Production URL: {PRODUCTION_FLOOM_URL}
        </p>
      </section>
    </main>
  );
}
