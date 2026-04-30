"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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
  owner_id?: string;
  created_at?: string;
  description?: string;
}

function hasBrowserSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function relativeTime(dateStr: string | undefined | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

type PageState =
  | { kind: "loading" }
  | { kind: "private-app" }
  | { kind: "not-found"; message: string }
  | { kind: "ready"; app: AppData };

export default function AppPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState<RunResult>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [formData, setFormData] = useState<RunFormData>({});
  const [runStatus, setRunStatus] = useState<
    "idle" | "running" | "success" | "validation-error" | "runtime-error"
  >("idle");

  const fetchApp = useCallback(async () => {
    setPageState({ kind: "loading" });
    try {
      const res = await fetch(`/api/apps/${slug}`);
      if (res.status === 403) {
        setPageState({ kind: "private-app" });
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPageState({
          kind: "not-found",
          message: (data as { error?: string }).error ?? "App not found",
        });
        return;
      }
      const data = await res.json();
      setPageState({ kind: "ready", app: data as AppData });
    } catch (e: unknown) {
      setPageState({
        kind: "not-found",
        message: e instanceof Error ? e.message : "Failed to load app",
      });
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
    setRunStatus("running");

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
      if (!res.ok) {
        const message = (data as { error?: string }).error ?? "Run failed";
        // Detect validation vs runtime errors
        if (
          res.status === 422 ||
          message.toLowerCase().includes("validation") ||
          message.toLowerCase().includes("schema") ||
          message.toLowerCase().includes("invalid")
        ) {
          setRunStatus("validation-error");
        } else {
          setRunStatus("runtime-error");
        }
        setRunError(message);
        return;
      }
      setRunResult((data as { output?: RunResult }).output ?? null);
      setRunStatus("success");
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : "Run failed");
      setRunStatus("runtime-error");
    } finally {
      setRunLoading(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────
  if (pageState.kind === "loading") {
    return (
      <main className="min-h-screen bg-[#faf9f5]">
        <SiteHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-emerald-600" />
            <p className="mt-4 text-sm text-neutral-500">Loading app…</p>
          </div>
        </div>
      </main>
    );
  }

  // ── Private app state ─────────────────────────────────────────
  if (pageState.kind === "private-app") {
    return (
      <main className="min-h-screen bg-[#faf9f5] text-[#11110f]">
        <SiteHeader />
        <div className="flex min-h-[60vh] items-center justify-center px-5">
          <div className="max-w-md rounded-2xl border border-[#ded8cc] bg-white p-8 text-center shadow-xl shadow-neutral-200/50">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-neutral-400">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h1 className="text-xl font-black">Private app</h1>
            <p className="mt-2 text-sm text-neutral-600">
              This app is private. You need the owner&apos;s authorization to
              run it.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
            >
              Sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ── Not found state ───────────────────────────────────────────
  if (pageState.kind === "not-found") {
    return (
      <main className="min-h-screen bg-[#faf9f5] text-[#11110f]">
        <SiteHeader />
        <div className="flex min-h-[60vh] items-center justify-center px-5">
          <div className="max-w-md text-center">
            <p className="font-mono text-sm text-neutral-400">404</p>
            <h1 className="mt-2 text-2xl font-black">App not found</h1>
            <p className="mt-2 text-neutral-600">{pageState.message}</p>
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-semibold text-emerald-700 underline"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ── Ready ─────────────────────────────────────────────────────
  const { app } = pageState;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#faf9f5] text-[#11110f]">
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

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-5">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-neutral-400">
          <Link href="/" className="transition-colors hover:text-neutral-600">
            Apps
          </Link>
          <span>/</span>
          <span className="truncate text-neutral-600">{app.name}</span>
        </nav>

        {/* App header */}
        <div className="mb-8 rounded-2xl border border-[#ded8cc] bg-white p-6 shadow-xl shadow-neutral-200/50">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {/* App icon */}
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-lg font-black text-white">
                {app.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                  {app.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span>@floom</span>
                  <span>·</span>
                  <span className="font-mono">{app.runtime}</span>
                  {app.created_at && (
                    <>
                      <span>·</span>
                      <span>published {relativeTime(app.created_at)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Status badge */}
            <div className="flex flex-wrap items-center gap-2">
              {app.public && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Public
                </span>
              )}
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  runStatus === "idle"
                    ? "border-neutral-200 bg-neutral-50 text-neutral-600"
                    : runStatus === "running"
                    ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                    : runStatus === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {runStatus === "idle"
                  ? "Ready"
                  : runStatus === "running"
                  ? "Running…"
                  : runStatus === "success"
                  ? "Success"
                  : runStatus === "validation-error"
                  ? "Validation error"
                  : "Runtime error"}
              </span>
            </div>
          </div>

          {app.description && (
            <p className="mt-4 max-w-2xl text-sm text-neutral-600">
              {app.description}
            </p>
          )}

          <p className="mt-3 text-sm text-neutral-500">
            Run this Floom app from the browser. Inputs are validated with JSON
            Schema and executed in an isolated E2B sandbox.
          </p>
        </div>

        {/* Run surface */}
        <AppRunSurface
          inputSchema={app.input_schema}
          formData={formData}
          runError={runError}
          runLoading={runLoading}
          runResult={runResult}
          onFormDataChange={setFormData}
          onReset={() => {
            setFormData({});
            setRunResult(null);
            setRunError(null);
            setRunStatus("idle");
          }}
          onRun={handleRun}
        />

        {/* Footer links */}
        <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-neutral-500">
          <span className="font-mono text-xs">
            {app.slug}
          </span>
          <span>·</span>
          <Link href="/" className="transition-colors hover:text-emerald-700">
            Browse all apps
          </Link>
          <span>·</span>
          <Link
            href="/tokens"
            className="transition-colors hover:text-emerald-700"
          >
            Publish your own
          </Link>
        </div>
      </section>
    </main>
  );
}
