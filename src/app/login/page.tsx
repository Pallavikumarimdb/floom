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
  const modeParam = searchParams.get("mode");
  const mode: Mode = modeParam === "signup" ? "signup" : "signin";
  const nextParam = searchParams.get("next");
  const safeNext = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : "/tokens";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function sendPasswordReset() {
    if (!email.trim()) {
      setError("Enter your email above first, then click Forgot password.");
      return;
    }
    setResetLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo },
    );
    setResetLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setMessage(
      "Password reset email sent if the address exists. Check your inbox.",
    );
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace(safeNext);
      }
    });
  }, [router, safeNext]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
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
      router.replace(safeNext);
      return;
    }

    setMessage(
      "Check your email to finish signing in. The link can take up to a minute. If nothing arrives, signups are rate-limited during alpha — try again in a bit.",
    );
  }

  async function signInWithGoogle() {
    setGoogleLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
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
      <main
        id="main"
        style={{
          maxWidth: 400,
          margin: '0 auto',
          padding: '64px 24px 80px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
          {/* Google sign-in lives ABOVE email — most users have a Google
              account; surfacing it first lowers signup friction. The
              email/password form is the fallback path. */}
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={loading || googleLoading}
            style={{
              width: '100%',
              height: 46,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink)',
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              cursor: (loading || googleLoading) ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 1px 2px rgba(22,21,18,0.04)',
              opacity: (loading || googleLoading) ? 0.6 : 1,
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            {/* Google G icon — original 4-colour mark, simplified path */}
            <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.616z" fill="#4285F4" />
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
              <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" fill="#EA4335" />
            </svg>
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              margin: '18px 0',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            or
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

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
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <label
                style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}
                htmlFor="password"
              >
                Password
              </label>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => void sendPasswordReset()}
                  disabled={resetLoading}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: 'var(--accent)',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: resetLoading ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {resetLoading ? 'Sending…' : 'Forgot password?'}
                </button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input-field"
                placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                style={{ width: '100%', boxSizing: 'border-box', paddingRight: 56 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--muted)',
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
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
        </form>

        <button
          type="button"
          onClick={() => {
            const nextMode = mode === "signin" ? "signup" : "signin";
            router.replace(nextMode === "signup" ? "/login?mode=signup" : "/login", { scroll: false });
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
          Have an agent token already? Use it with the CLI, or{" "}
          <Link
            href="/p/meeting-action-items"
            style={{ fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
          >
            try the live demo
          </Link>
          .
        </p>
      </main>
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
