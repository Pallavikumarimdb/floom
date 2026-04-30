"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import type { RJSFSchema } from "@rjsf/utils";
import {
  AppRunSurface,
  type RunFormData,
  type RunResult,
} from "@/components/AppRunSurface";
import { SiteHeader } from "@/components/SiteHeader";
import { createClient } from "@/lib/supabase/client";

interface AppData {
  id: string;
  slug: string;
  name: string;
  runtime: string;
  input_schema: RJSFSchema;
  output_schema: object;
  public: boolean;
}

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
  const [formData, setFormData] = useState<RunFormData>({});

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
      <style jsx global>{`
        .floom-run-form .form-group {
          margin-bottom: 1rem;
        }

        .floom-run-form label {
          display: block;
          margin-bottom: 0.4rem;
          font-size: 0.875rem;
          font-weight: 700;
          color: #26221c;
        }

        .floom-run-form input,
        .floom-run-form textarea,
        .floom-run-form select {
          width: 100%;
          border: 1px solid #cfc7b8;
          border-radius: 0.5rem;
          background: #fffdf8;
          padding: 0.75rem 0.85rem;
          color: #11110f;
          outline: none;
        }

        .floom-run-form textarea {
          min-height: 8rem;
          resize: vertical;
        }

        .floom-run-form input:focus,
        .floom-run-form textarea:focus,
        .floom-run-form select:focus {
          border-color: #047857;
          box-shadow: 0 0 0 3px rgba(4, 120, 87, 0.14);
        }

        .floom-run-form .field-description,
        .floom-run-form .help-block {
          margin-top: 0.35rem;
          font-size: 0.8rem;
          color: #716b61;
        }
      `}</style>
      <SiteHeader />

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

        <AppRunSurface
          inputSchema={app.input_schema}
          formData={formData}
          runError={runError}
          runLoading={runLoading}
          runResult={runResult}
          onFormDataChange={setFormData}
          onReset={() => setFormData({})}
          onRun={handleRun}
        />
      </section>
    </main>
  );
}
