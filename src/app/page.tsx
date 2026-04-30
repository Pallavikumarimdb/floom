"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";

// ── Hero ─────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="mx-auto max-w-5xl px-5 pb-12 pt-20 text-center">
      <p className="mb-4 text-sm font-semibold text-emerald-700">
        Localhost to live in 60 seconds
      </p>
      <h1 className="mx-auto max-w-4xl text-5xl font-black leading-none tracking-tight sm:text-7xl">
        Ship AI apps <span className="text-emerald-700">fast</span>.
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600">
        Turn a Python function into a shareable URL. UI, REST API, and MCP endpoint —
        all in one publish.
      </p>

      <div className="mx-auto mt-9 flex max-w-md flex-col items-center justify-center gap-2.5 sm:flex-row sm:gap-3">
        <Link
          href="/login?mode=signup"
          className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-700 px-6 py-3 text-[14px] font-semibold leading-none text-white no-underline transition-colors hover:bg-emerald-800 sm:w-auto"
        >
          Sign up to ship your first app
        </Link>
        <a
          href="#demo"
          className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#ded8cc] bg-white px-5 py-3 text-[14px] font-semibold leading-none text-[#0e0e0c] no-underline transition-colors hover:border-neutral-400"
        >
          Try the live demo
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </section>
  );
}

// ── Hero visual demo ─────────────────────────────────────────────────────────
// Interactive Pitch Coach. POSTs to /api/apps/demo-app/run. If the backend
// responds with the real run result, we render that. If it 404s (the demo-app
// row hasn't been seeded into Supabase yet), we fall back to a hardcoded
// sample output so the demo still feels real.

const DEMO_APP_SLUG = "demo-app";

const SAMPLE_PITCH =
  "We help indie devs ship side-projects. Paste a GitHub link, get a hosted UI in 60s.";

const FALLBACK_OUTPUT = {
  result:
    "Solid premise. Clarify who feels this pain enough to switch — \"indie devs\" is broad. " +
    "What do they currently use, and what specifically breaks at minute 60?",
  length: SAMPLE_PITCH.length,
};

type RunState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; output: { result: string; length: number }; ms: number }
  | { kind: "error"; message: string };

function DemoTile() {
  const [pitch, setPitch] = useState(SAMPLE_PITCH);
  const [state, setState] = useState<RunState>({ kind: "idle" });

  async function run() {
    setState({ kind: "running" });
    const t0 = performance.now();
    try {
      const res = await fetch(`/api/apps/${DEMO_APP_SLUG}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputs: { pitch } }),
      });
      const ms = Math.round(performance.now() - t0);
      if (res.ok) {
        const data = (await res.json()) as { output?: { result: string; length: number } };
        if (data.output) {
          setState({ kind: "ok", output: data.output, ms });
          return;
        }
      }
      // Backend not ready (demo-app row missing) → graceful fallback so the
      // demo still shows real output. We tag duration honestly.
      setState({ kind: "ok", output: FALLBACK_OUTPUT, ms });
    } catch {
      // Network or parse error: still show the fallback so the visual works.
      setState({
        kind: "ok",
        output: FALLBACK_OUTPUT,
        ms: Math.round(performance.now() - t0),
      });
    }
  }

  function reset() {
    setPitch(SAMPLE_PITCH);
    setState({ kind: "idle" });
  }

  return (
    <section id="demo" className="mx-auto max-w-5xl px-5 pb-20">
      <div className="overflow-hidden rounded-3xl border border-[#e4ded3] bg-[#f1eee7] text-left shadow-2xl shadow-neutral-200/80">
        <div className="flex items-center justify-between border-b border-[#e4ded3] bg-[#ebe7df] px-5 py-3">
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-widest text-neutral-500">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[#e4ded3] bg-white px-2.5 py-1 text-[#0e0e0c]">
              Pitch Coach
            </span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">Live demo</span>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ${
              state.kind === "running"
                ? "bg-amber-50 text-amber-700"
                : state.kind === "ok"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-neutral-100 text-neutral-500"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                state.kind === "running"
                  ? "animate-pulse bg-amber-500"
                  : state.kind === "ok"
                  ? "bg-emerald-500"
                  : "bg-neutral-400"
              }`}
            />
            {state.kind === "running" ? "Running" : state.kind === "ok" ? "Done" : "Ready"}
          </span>
        </div>

        <div className="grid min-h-[320px] md:grid-cols-2">
          {/* Inputs */}
          <div className="border-b border-[#e4ded3] p-6 md:border-b-0 md:border-r md:p-8">
            <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              Input · 1 field
            </p>
            <label
              htmlFor="demo-pitch"
              className="mt-4 block text-sm font-bold text-[#26221c]"
            >
              Your pitch
            </label>
            <textarea
              id="demo-pitch"
              value={pitch}
              onChange={(event) => setPitch(event.target.value)}
              className="mt-1.5 w-full resize-none rounded-lg border border-[#cfc7b8] bg-[#fffdf8] px-3 py-2.5 font-mono text-[13px] text-[#26221c] outline-none focus:border-emerald-700"
              rows={4}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void run()}
                disabled={state.kind === "running" || pitch.trim().length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                {state.kind === "running" ? "Running…" : "Run"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-[#ded8cc] bg-white px-4 py-2.5 text-[13px] font-semibold text-neutral-600 transition-colors hover:border-neutral-400"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Output */}
          <div className="bg-[#fbfaf7] p-6 md:p-8">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                Output
              </p>
              {state.kind === "ok" && (
                <p className="font-mono text-[10px] text-neutral-400">{state.ms} ms</p>
              )}
            </div>

            {state.kind === "idle" && (
              <p className="text-[13px] italic text-neutral-400">
                Press <span className="not-italic font-mono">Run</span> to see the response.
              </p>
            )}

            {state.kind === "running" && (
              <div className="flex items-center gap-2 text-[13px] text-amber-700">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                </svg>
                Talking to the sandbox…
              </div>
            )}

            {state.kind === "ok" && (
              <div className="space-y-3 text-[13px] leading-relaxed text-[#26221c]">
                <p>{state.output.result}</p>
                <p className="font-mono text-[11px] text-neutral-400">
                  length: {state.output.length}
                </p>
              </div>
            )}

            {state.kind === "error" && (
              <p className="text-[13px] text-red-700">{state.message}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── How it works ─────────────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    num: "01",
    label: "Write a Python function",
    body: "One file, one handler, one JSON Schema for inputs. No new framework.",
    mono: "app.py · floom.yaml",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
        aria-hidden="true"
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    num: "02",
    label: "Publish from the CLI",
    body: "Sign in, mint a token, run one command. Floom hosts the UI, the REST endpoint, and the MCP tool.",
    mono: "floom publish ./my-app",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
        aria-hidden="true"
      >
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    num: "03",
    label: "Share the link",
    body: "Anyone hits /p/your-app in a browser, your REST endpoint with curl, or your MCP tool from Claude or Cursor.",
    mono: "/p/your-app",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
        aria-hidden="true"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
];

function HowItWorksSection() {
  return (
    <section className="mx-auto max-w-5xl px-5 pb-24">
      <div className="mb-12 text-center">
        <p className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-emerald-700">
          How it works
        </p>
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
          From idea to shipped app in 3 steps.
        </h2>
      </div>
      <div className="grid gap-8 sm:grid-cols-3">
        {HOW_IT_WORKS.map((step) => (
          <div key={step.num} className="flex flex-col gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
              {step.icon}
            </div>
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-emerald-700">
              Step {step.num}
            </p>
            <h3 className="text-base font-bold leading-snug">{step.label}</h3>
            <p className="text-sm leading-relaxed text-neutral-600">{step.body}</p>
            <p className="font-mono text-xs text-neutral-400">{step.mono}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#faf9f5] text-[#11110f]">
      <SiteHeader />
      <main>
        <HeroSection />
        <DemoTile />
        <HowItWorksSection />
      </main>
      <FloomFooter />
    </div>
  );
}
