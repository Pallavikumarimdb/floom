"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

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

  return (
    <main className="min-h-screen bg-[#faf9f5] text-[#11110f]">
      <SiteHeader showProductLinks />
      <section className="mx-auto max-w-md px-5 py-14">
        <p className="mb-3 text-sm font-semibold text-emerald-700">
          Floom builder access
        </p>
        <h1 className="text-4xl font-black tracking-tight">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-3 text-neutral-600">
          {mode === "signin"
            ? "Sign in to manage your Floom agent tokens."
            : "Create an account to publish local Python apps as live URLs."}
        </p>

        <form
          onSubmit={submit}
          className="mt-8 rounded-2xl border border-[#ded8cc] bg-white p-6 shadow-xl shadow-neutral-200/50"
        >
          <label
            className="block text-sm font-bold text-neutral-800"
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
            className="mt-2 w-full rounded-lg border border-[#cfc7b8] bg-[#fffdf8] px-4 py-3.5 text-base outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
            placeholder="you@example.com"
          />

          <label
            className="mt-5 block text-sm font-bold text-neutral-800"
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
            className="mt-2 w-full rounded-lg border border-[#cfc7b8] bg-[#fffdf8] px-4 py-3.5 text-base outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
            placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
          />

          {/* Error callout — semantic red */}
          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
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

          {/* Success callout — semantic green */}
          {message && (
            <div
              role="status"
              className="mt-5 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3"
            >
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p className="text-sm font-medium text-emerald-700">{message}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-emerald-700 px-5 py-3.5 text-base font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
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
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setMessage(null);
          }}
          className="mt-5 w-full rounded-lg border border-[#ded8cc] bg-white px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-[#f3f0ea]"
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Have an account? Sign in"}
        </button>

        <p className="mt-8 text-sm text-neutral-500">
          Already have a token? Use the{" "}
          <Link
            href="/p/smoke-1777538613152"
            className="font-semibold text-emerald-700"
          >
            live app
          </Link>{" "}
          or publish with the CLI.
        </p>
      </section>
    </main>
  );
}
