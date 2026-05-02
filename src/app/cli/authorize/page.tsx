"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Terminal } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";
import { createClient } from "@/lib/supabase/client";

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.+)$/, "$1-$2");
}

function CliAuthorizeContent() {
  const searchParams = useSearchParams();
  const code = useMemo(() => normalizeCode(searchParams.get("code") ?? ""), [searchParams]);
  const next = `/cli/authorize${code ? `?code=${encodeURIComponent(code)}` : ""}`;
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setSessionToken(data.session?.access_token ?? null);
      setEmail(data.session?.user.email ?? null);
      setChecking(false);
    });
  }, []);

  async function authorize() {
    if (!sessionToken || !code) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/cli/device/authorize", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ user_code: code }),
    });
    const payload = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(typeof payload.error === "string" ? payload.error : "Failed to authorize CLI");
      return;
    }
    setAuthorized(true);
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <SiteHeader />
      <section className="mx-auto flex max-w-xl flex-col items-center px-6 py-20 text-center">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow-2)]">
          {authorized ? <CheckCircle2 size={24} /> : <Terminal size={24} />}
        </div>
        <h1 className="text-3xl font-black tracking-tight">Authorize Floom CLI</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">
          This creates an agent token for your terminal and sends it back once.
          The token is not shown in the browser.
        </p>

        <div className="mt-8 w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 text-left shadow-[var(--shadow-3)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Terminal code</p>
          <p className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 font-mono text-2xl font-black tracking-[0.12em]">
            {code || "Missing"}
          </p>
          {email ? (
            <p className="mt-4 text-sm text-[var(--muted)]">Signed in as {email}</p>
          ) : null}
        </div>

        {checking ? (
          <p className="mt-6 inline-flex items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="animate-spin" size={16} /> Checking session
          </p>
        ) : !sessionToken ? (
          <Link
            href={`/login?mode=signup&next=${encodeURIComponent(next)}`}
            className="mt-6 rounded-xl bg-[var(--ink)] px-5 py-3 text-sm font-bold text-[var(--bg)]"
          >
            Sign in to authorize
          </Link>
        ) : authorized ? (
          <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">
            Authorized. Return to your terminal.
          </p>
        ) : (
          <button
            type="button"
            onClick={authorize}
            disabled={!code || submitting}
            className="mt-6 rounded-xl bg-[var(--ink)] px-5 py-3 text-sm font-bold text-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Authorizing..." : "Authorize terminal"}
          </button>
        )}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </section>
      <FloomFooter />
    </main>
  );
}

export default function CliAuthorizePage() {
  return (
    <Suspense fallback={null}>
      <CliAuthorizeContent />
    </Suspense>
  );
}
