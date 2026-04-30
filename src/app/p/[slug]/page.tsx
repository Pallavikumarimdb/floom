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
import { FloomFooter } from "@/components/FloomFooter";
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

// Tab definitions — only "Run" is wired; others show stub content
type AppTab = "run" | "about" | "install" | "source" | "earlier-runs";

// Shared run-form global CSS — scoped class
const RUN_FORM_STYLES = `
.floom-run-form .form-group { margin-bottom: 1rem; }
.floom-run-form label {
  display: block; margin-bottom: 0.4rem;
  font-size: 0.875rem; font-weight: 700; color: #26221c;
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
.floom-run-form textarea { min-height: 8rem; resize: vertical; }
.floom-run-form input:focus,
.floom-run-form textarea:focus,
.floom-run-form select:focus {
  border-color: #047857;
  box-shadow: 0 0 0 3px rgba(4,120,87,0.14);
}
.floom-run-form .field-description,
.floom-run-form .help-block {
  margin-top: 0.35rem; font-size: 0.8rem; color: #716b61;
}
`;

export default function AppPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [activeTab, setActiveTab] = useState<AppTab>("run");
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

  // ── Loading state ──────────────────────────────────────────────────────────
  if (pageState.kind === "loading") {
    return (
      <div className="min-h-screen bg-[#faf9f5]">
        <SiteHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-emerald-600" />
            <p className="mt-4 text-sm text-neutral-500">Loading app…</p>
          </div>
        </div>
        <FloomFooter />
      </div>
    );
  }

  // ── Private app state ──────────────────────────────────────────────────────
  if (pageState.kind === "private-app") {
    return (
      <div className="min-h-screen bg-[#faf9f5] text-[#11110f]">
        <SiteHeader />
        <div className="flex min-h-[60vh] items-center justify-center px-5">
          <div className="max-w-md rounded-2xl border border-[#ded8cc] bg-white p-8 text-center shadow-xl shadow-neutral-200/50">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-neutral-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h1 className="text-xl font-black">Private app</h1>
            <p className="mt-2 text-sm text-neutral-600">
              This app is private. You need the owner&apos;s authorization to run it.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
            >
              Sign in
            </Link>
          </div>
        </div>
        <FloomFooter />
      </div>
    );
  }

  // ── Not found state ────────────────────────────────────────────────────────
  if (pageState.kind === "not-found") {
    return (
      <div className="min-h-screen bg-[#faf9f5] text-[#11110f]">
        <SiteHeader />
        <div className="flex min-h-[60vh] items-center justify-center px-5">
          <div className="max-w-md text-center">
            <p className="font-mono text-sm text-neutral-400">404</p>
            <h1 className="mt-2 text-2xl font-black">App not found</h1>
            <p className="mt-2 text-neutral-600">{pageState.message}</p>
            <Link href="/" className="mt-6 inline-block text-sm font-semibold text-emerald-700 underline">
              Back to home
            </Link>
          </div>
        </div>
        <FloomFooter />
      </div>
    );
  }

  // ── Ready ──────────────────────────────────────────────────────────────────
  const { app } = pageState;

  const TABS: { id: AppTab; label: string }[] = [
    { id: "run", label: "Run" },
    { id: "about", label: "About" },
    { id: "install", label: "Install" },
    { id: "source", label: "Source" },
    { id: "earlier-runs", label: "Earlier runs" },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#faf9f5] text-[#11110f]">
      <style jsx global>{RUN_FORM_STYLES}</style>
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-5">
        {/* Breadcrumb */}
        <nav className="mb-5 flex items-center gap-2 text-sm text-neutral-400">
          <Link href="/" className="transition-colors hover:text-neutral-600">
            Apps
          </Link>
          <span>/</span>
          <span className="truncate text-neutral-600">{app.name}</span>
        </nav>

        {/* App header card */}
        <div className="mb-0 rounded-2xl border border-[#ded8cc] bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              {/* App icon */}
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-sm font-black text-white">
                {app.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                  {app.name}
                </h1>
                {app.description && (
                  <p className="mt-1 max-w-2xl text-sm text-neutral-600">
                    {app.description}
                  </p>
                )}
                {/* Tag pills */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {app.public && (
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                      public
                    </span>
                  )}
                  {!app.public && (
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                      private
                    </span>
                  )}
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-[10px] text-neutral-500">
                    v0.1.0
                  </span>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-[10px] text-neutral-500">
                    Runtime: {app.runtime}
                  </span>
                  {app.created_at && (
                    <span className="font-mono text-[10px] text-neutral-400">
                      published {relativeTime(app.created_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#ded8cc] bg-white px-3 py-2 text-[13px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Install
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#ded8cc] bg-white px-3 py-2 text-[13px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                Share
              </button>
            </div>
          </div>
        </div>

        {/* Action tabs row */}
        <div className="mb-0 mt-0 border-b border-[#ded8cc] bg-white">
          <div className="flex items-end gap-0 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 border-b-2 px-4 py-3 text-[13px] font-semibold transition-colors ${
                  activeTab === tab.id
                    ? "border-emerald-700 text-emerald-700"
                    : "border-transparent text-neutral-500 hover:text-neutral-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Gemini usage strip — stubbed */}
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-[#e4ded3] bg-white px-4 py-2.5">
          <div className="flex items-center gap-2.5 text-[13px] text-neutral-600">
            <span className="text-emerald-600">✦</span>
            <span>Gemini on us</span>
            <span className="text-neutral-400">·</span>
            <span className="font-semibold">5 of 5 free runs left today</span>
            <div className="ml-1 h-1.5 w-24 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full w-full rounded-full bg-emerald-600" />
            </div>
          </div>
          <button
            type="button"
            className="text-[12px] font-semibold text-neutral-500 transition-colors hover:text-neutral-800"
          >
            Use your own key
          </button>
        </div>

        {/* Tab content */}
        <div className="mt-4">
          {activeTab === "run" && (
            <>
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

              {/* Privacy note */}
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#e4ded3] bg-white px-4 py-3 text-[13px] text-neutral-500">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <span>
                  Your inputs are sent to <strong className="font-semibold text-neutral-700">{app.name}</strong> to produce a result. Floom doesn&apos;t sell or share run data.{" "}
                  <a href="https://floom.dev/privacy" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 no-underline hover:underline">
                    Privacy →
                  </a>
                </span>
              </div>
            </>
          )}

          {activeTab === "about" && (
            <div className="rounded-2xl border border-[#ded8cc] bg-white p-6">
              <h2 className="text-lg font-black">About {app.name}</h2>
              {app.description ? (
                <p className="mt-3 text-sm leading-relaxed text-neutral-600">{app.description}</p>
              ) : (
                <p className="mt-3 text-sm text-neutral-400">No description provided.</p>
              )}
              <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-[#e4ded3] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">Runtime</p>
                  <p className="mt-1 font-semibold">{app.runtime}</p>
                </div>
                <div className="rounded-lg border border-[#e4ded3] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">Visibility</p>
                  <p className="mt-1 font-semibold capitalize">{app.public ? "Public" : "Private"}</p>
                </div>
                {app.created_at && (
                  <div className="rounded-lg border border-[#e4ded3] p-3">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">Published</p>
                    <p className="mt-1 font-semibold">{relativeTime(app.created_at)}</p>
                  </div>
                )}
                <div className="rounded-lg border border-[#e4ded3] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">Slug</p>
                  <p className="mt-1 font-mono text-[13px]">{app.slug}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "install" && (
            <div className="rounded-2xl border border-[#ded8cc] bg-white p-6">
              <h2 className="text-lg font-black">Install</h2>
              <p className="mt-2 text-sm text-neutral-500">Coming soon — install as MCP tool or via CLI.</p>
            </div>
          )}

          {activeTab === "source" && (
            <div className="rounded-2xl border border-[#ded8cc] bg-white p-6">
              <h2 className="text-lg font-black">Source</h2>
              <p className="mt-2 text-sm text-neutral-500">Coming soon — view the app source on GitHub.</p>
            </div>
          )}

          {activeTab === "earlier-runs" && (
            <div className="rounded-2xl border border-[#ded8cc] bg-white p-6">
              <h2 className="text-lg font-black">Earlier runs</h2>
              <p className="mt-2 text-sm text-neutral-500">Coming soon — browse past run outputs.</p>
            </div>
          )}
        </div>

        {/* Run status badge */}
        {runStatus !== "idle" && (
          <div className="mt-4 flex items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                runStatus === "running"
                  ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                  : runStatus === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {runStatus === "running"
                ? "Running…"
                : runStatus === "success"
                ? "Success"
                : runStatus === "validation-error"
                ? "Validation error"
                : "Runtime error"}
            </span>
          </div>
        )}

        {/* Footer links */}
        <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-neutral-500">
          <span className="font-mono text-xs">{app.slug}</span>
          <span>·</span>
          <Link href="/" className="transition-colors hover:text-emerald-700">
            Browse all apps
          </Link>
          <span>·</span>
          <Link href="/tokens" className="transition-colors hover:text-emerald-700">
            Publish your own
          </Link>
        </div>
      </main>

      <FloomFooter />
    </div>
  );
}
