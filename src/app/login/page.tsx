"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode: Mode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/tokens");
      }
    });
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=/tokens`;
    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo,
            },
          });

    setLoading(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (result.data.session) {
      router.replace("/tokens");
      return;
    }

    setMessage("Check your email to finish signing in.");
  }

  async function signInWithGoogle() {
    setGoogleLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=/tokens`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      setGoogleLoading(false);
      setError(error.message);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <SiteHeader />
      {/* v11: Apple-style centered login card */}
      <section
        style={{
          maxWidth: 400,
          margin: '0 auto',
          padding: '64px 24px 80px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/floom-mark-glow.svg" alt="Floom" width={40} height={40} style={{ marginBottom: 16, display: 'inline-block' }} />
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 8px', color: 'var(--ink)' }}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
            {mode === "signin"
              ? "Sign in to manage your Floom agent tokens."
              : "Publish local Python apps as live URLs."}
          </p>
        </div>

        <form
          onSubmit={submit}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            padding: '24px',
            boxShadow: 'var(--shadow-3)',
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <label
              style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}
              htmlFor="email"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input-field"
              placeholder="you@example.com"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}
              htmlFor="password"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input-field"
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Error callout */}
          {error && (
            <div
              role="alert"
              style={{
                marginBottom: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                borderRadius: 8,
                border: '1px solid var(--danger-border)',
                background: 'var(--danger-soft)',
                padding: '10px 14px',
              }}
            >
              <svg className="mt-0.5" width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--danger)', marginTop: 2 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--danger)', margin: 0 }}>{error}</p>
            </div>
          )}

          {/* Success callout */}
          {message && (
            <div
              role="status"
              style={{
                marginBottom: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                borderRadius: 8,
                border: '1px solid var(--accent-border)',
                background: 'var(--accent-soft)',
                padding: '10px 14px',
              }}
            >
              <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--accent)', marginTop: 2 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)', margin: 0 }}>{message}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="btn-primary full"
            style={{ opacity: (loading || googleLoading) ? 0.6 : 1, width: '100%', height: 46, fontSize: 15 }}
          >
            {loading
              ? "Working…"
              : mode === "signin"
              ? "Sign in"
              : "Create account"}
          </button>

          <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase text-neutral-400">
            <span className="h-px flex-1 bg-[#ded8cc]" />
            or
            <span className="h-px flex-1 bg-[#ded8cc]" />
          </div>

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={loading || googleLoading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#cfc7b8] bg-white px-5 py-3 font-semibold text-[#11110f] shadow-sm disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86a5.35 5.35 0 0 1-5.02-3.7H.96v2.34A9 9 0 0 0 9 18Z"
              />
              <path
                fill="#FBBC05"
                d="M3.98 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34Z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.66 8.66 0 0 0 9 0 9 9 0 0 0 .96 4.94l3.02 2.34A5.35 5.35 0 0 1 9 3.58Z"
              />
            </svg>
            <span>{googleLoading ? "Redirecting..." : "Continue with Google"}</span>
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setMessage(null);
          }}
          className="btn-outline"
          style={{ width: '100%', marginTop: 10, justifyContent: 'center', height: 42 }}
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Have an account? Sign in"}
        </button>

        <p style={{ marginTop: 24, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
          Want to see Floom first?{" "}
          <Link
            href="/p/meeting-action-items"
            style={{ fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
          >
            Try the live app
          </Link>
          .
        </p>
      </section>
      <FloomFooter />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#faf9f5]">
          <SiteHeader />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
