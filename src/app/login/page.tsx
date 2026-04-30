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
          Sign in to create a Floom agent token and publish local Python apps.
        </p>

        <form onSubmit={submit} className="mt-8 rounded-2xl border border-[#ded8cc] bg-white p-6 shadow-xl shadow-neutral-200/50">
          <label className="block text-sm font-bold text-neutral-800" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-lg border border-[#cfc7b8] bg-[#fffdf8] px-3 py-3 outline-none focus:border-emerald-700"
          />

          <label className="mt-5 block text-sm font-bold text-neutral-800" htmlFor="password">
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
            className="mt-2 w-full rounded-lg border border-[#cfc7b8] bg-[#fffdf8] px-3 py-3 outline-none focus:border-emerald-700"
          />

          {error && <p className="mt-4 text-sm font-medium text-red-700">{error}</p>}
          {message && <p className="mt-4 text-sm font-medium text-emerald-700">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setMessage(null);
          }}
          className="mt-5 text-sm font-semibold text-emerald-700"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>

        <p className="mt-8 text-sm text-neutral-500">
          Already have a token? Use the{" "}
          <Link href="/p/smoke-1777538613152" className="font-semibold text-emerald-700">
            live app
          </Link>{" "}
          or publish with the CLI.
        </p>
      </section>
    </main>
  );
}
