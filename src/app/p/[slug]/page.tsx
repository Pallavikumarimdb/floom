"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
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
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-slate-500">Loading app...</p>
      </main>
    );
  }

  if (error || !app) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">{error || "App not found"}</p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{app.name}</h1>
        <p className="text-slate-500">
          {app.runtime} · {app.slug}
        </p>
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-semibold mb-4">Inputs</h2>
        <Form
          schema={app.input_schema}
          validator={validator}
          formData={formData}
          onChange={(e) => setFormData((e.formData ?? {}) as FormData)}
          onSubmit={handleRun}
        >
          <button
            type="submit"
            disabled={runLoading}
            className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {runLoading ? "Running..." : "Run"}
          </button>
        </Form>
      </div>

      {runError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8">
          <p className="text-red-700 font-medium">Error</p>
          <pre className="text-sm text-red-600 mt-1 whitespace-pre-wrap">
            {runError}
          </pre>
        </div>
      )}

      {runResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-green-800 font-medium mb-2">Output</p>
          <pre className="text-sm text-green-700 whitespace-pre-wrap overflow-auto">
            {JSON.stringify(runResult, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
