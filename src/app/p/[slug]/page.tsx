"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import { createClient } from "@/lib/supabase/client";

interface AppData {
  id: string;
  slug: string;
  name: string;
  runtime: string;
  input_schema: object;
  output_schema: object;
  public: boolean;
}

type RunResult = Record<string, unknown> | null;
type FormData = Record<string, unknown>;

function hasBrowserSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export default function AppPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [app, setApp] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState<RunResult>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({});

  const fetchApp = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/apps/${slug}`);
      if (!res.ok) throw new Error("App not found");
      const data = await res.json();
      setApp(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load app");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    // Initial app fetch is the only client-side data load in this minimal page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchApp();
  }, [fetchApp]);

  const handleRun = async () => {
    setRunLoading(true);
    setRunResult(null);
    setRunError(null);

    let token: string | undefined;
    if (hasBrowserSupabaseConfig()) {
      const supabase = createClient();
      const session = await supabase.auth.getSession();
      token = session.data.session?.access_token;
    }

    try {
      const res = await fetch(`/api/apps/${slug}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ inputs: formData }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Run failed");
      setRunResult(data.output);
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf9f5]">
        <p className="text-slate-500">Loading app...</p>
      </main>
    );
  }

  if (error || !app) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf9f5]">
        <p className="text-red-500">{error || "App not found"}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf9f5] text-[#11110f]">
      <header className="border-b border-[#e7e2d8]">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2 text-xl font-black">
            <span className="h-3 w-3 rounded-sm bg-emerald-500" />
            floom<span className="text-emerald-600">.</span>
          </Link>
          <a
            href="https://floom.dev"
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            Join waitlist
          </a>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <p className="mb-5 text-sm text-neutral-500">Apps / {app.name}</p>
        <div className="mb-8">
          <div>
            <h1 className="text-4xl font-black tracking-tight">{app.name}</h1>
            <p className="mt-2 max-w-2xl text-neutral-600">
              Run this Floom app from the browser. Inputs are validated with JSON
              Schema and executed in an isolated sandbox.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-600">
              <span className="rounded-full border border-[#ded8cc] bg-white px-3 py-1">
                research
              </span>
              <span className="rounded-full border border-[#ded8cc] bg-white px-3 py-1">
                Runtime: {app.runtime}
              </span>
              {app.public && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                  public
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mb-6 flex gap-8 border-b border-[#ded8cc] text-sm font-semibold">
          <span className="border-b-2 border-emerald-700 px-1 pb-4 text-emerald-800">
            Run
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#ded8cc] bg-white shadow-xl shadow-neutral-200/60">
          <div className="border-b border-[#ded8cc] px-6 py-4 font-mono text-xs font-bold uppercase tracking-widest text-neutral-500">
            Run ready
          </div>
          <div className="grid min-h-[420px] md:grid-cols-[380px_1fr]">
            <div className="border-b border-[#ded8cc] p-8 md:border-b-0 md:border-r">
              <p className="mb-5 font-mono text-xs font-bold uppercase tracking-widest text-neutral-500">
                Inputs
              </p>
              <Form
                schema={app.input_schema}
                validator={validator}
                formData={formData}
                onChange={(e) => setFormData((e.formData ?? {}) as FormData)}
                onSubmit={handleRun}
              >
                <div className="mt-6 flex gap-3">
                  <button
                    type="submit"
                    disabled={runLoading}
                    className="rounded-lg bg-emerald-700 px-8 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {runLoading ? "Running..." : "Run"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({})}
                    className="rounded-lg border border-[#ded8cc] bg-white px-5 py-3 font-semibold text-neutral-600"
                  >
                    Reset
                  </button>
                </div>
              </Form>
            </div>

            <div className="flex min-h-[360px] flex-col p-8">
              <p className="mb-5 font-mono text-xs font-bold uppercase tracking-widest text-neutral-500">
                Output
              </p>
              {runError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="font-medium text-red-700">Error</p>
                  <pre className="mt-1 whitespace-pre-wrap text-sm text-red-600">
                    {runError}
                  </pre>
                </div>
              )}
              {!runError && !runResult && (
                <div className="flex flex-1 items-center justify-center text-center">
                  <div>
                    <p className="font-semibold">Output will appear here</p>
                    <p className="mt-2 text-sm text-neutral-500">
                      Fill the form and press Run.
                    </p>
                  </div>
                </div>
              )}
              {runResult && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                  <pre className="overflow-auto whitespace-pre-wrap text-sm leading-7 text-emerald-900">
                    {JSON.stringify(runResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
