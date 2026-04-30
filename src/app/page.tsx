"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { ThreeSurfacesDiagram } from "@/components/ThreeSurfacesDiagram";

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#faf9f5] text-[#11110f]">
      <SiteHeader showProductLinks />

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pb-16 pt-20 text-center">
        <p className="mb-4 text-sm font-semibold text-emerald-700">
          Works with Codex, Claude Code, Cursor, and any MCP client
        </p>
        <h1 className="mx-auto max-w-4xl text-5xl font-black leading-none tracking-tight sm:text-7xl">
          Ship AI apps <span className="text-emerald-700">fast</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-neutral-600">
          Localhost to live in 60 seconds. Python functions become shareable
          browser apps backed by Supabase and E2B.
        </p>

        {/* Primary CTA cluster — above the fold */}
        <div className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/tokens"
            className="flex-1 rounded-xl bg-emerald-700 px-6 py-3.5 text-center text-base font-semibold text-white transition-colors hover:bg-emerald-800 sm:flex-none sm:px-8"
          >
            Create token / Sign in
          </Link>
          <Link
            href="/p/smoke-1777538613152"
            className="flex-1 rounded-xl border border-[#ded8cc] bg-white px-6 py-3.5 text-center text-base font-semibold text-neutral-700 transition-colors hover:bg-[#f3f0ea] sm:flex-none sm:px-8"
          >
            Run live demo →
          </Link>
        </div>
      </section>

      {/* ── CODE MOCK ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pb-20">
        <div className="overflow-hidden rounded-3xl border border-[#e4ded3] bg-[#f1eee7] text-left shadow-2xl shadow-neutral-200/80">
          <div className="grid grid-cols-3 gap-2 border-b border-[#e4ded3] px-4 py-5 text-center font-mono text-[0.65rem] font-bold uppercase tracking-widest text-neutral-500 sm:px-10 sm:text-xs">
            <span>01 Build</span>
            <span>02 Deploy</span>
            <span>03 Run</span>
          </div>
          <div className="grid min-h-[320px] md:grid-cols-[180px_1fr]">
            <aside className="border-r border-[#e4ded3] bg-[#e9e5dc] p-5 font-mono text-xs uppercase tracking-widest text-neutral-500">
              <p className="mb-5">pitch-coach</p>
              <p className="rounded bg-[#f4f1eb] p-2 text-neutral-800">
                app.py
              </p>
              <p className="p-2">floom.yaml</p>
              <p className="p-2">schema.json</p>
            </aside>
            <div className="min-w-0 overflow-x-auto bg-[#fbfaf7] p-5 font-mono text-sm leading-8 sm:p-8">
              <p>
                <span className="text-neutral-400">1</span>{" "}
                <span className="text-orange-700">def</span> run(inputs):
              </p>
              <p>
                <span className="text-neutral-400">2</span>
                {"     "}pitch = inputs[
                <span className="text-emerald-700">&quot;pitch&quot;</span>]
              </p>
              <p>
                <span className="text-neutral-400">3</span>
                {"     "}
                <span className="text-orange-700">return</span> {"{"}
                &quot;result&quot;: coach(pitch){"}"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
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
              <h3 className="text-lg font-bold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-neutral-600">
                {step.body}
              </p>
              <p className="font-mono text-xs text-neutral-400">{step.mono}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── THREE SURFACES DIAGRAM ───────────────────────────────── */}
      <section className="border-t border-[#e4ded3] py-16">
        <ThreeSurfacesDiagram />
      </section>

      {/* ── CLI SNIPPET ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pb-24 pt-16">
        <div className="mb-10 text-center">
          <p className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-emerald-700">
            CLI
          </p>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            One command to publish.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-neutral-600">
            After creating a token, run this from any repo. Your Python function
            becomes a live URL in seconds.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#e4ded3] bg-[#11110f]">
          <div className="border-b border-white/10 px-5 py-3 font-mono text-xs text-neutral-500">
            Terminal
          </div>
          <div className="p-5 sm:p-8">
            <p className="font-mono text-sm leading-8 text-white">
              <span className="text-neutral-500">$</span>{" "}
              <span className="text-emerald-400">FLOOM_TOKEN</span>
              <span className="text-neutral-400">=</span>
              <span className="text-yellow-300">YOUR_FLOOM_AGENT_TOKEN</span>{" "}
              <span className="text-emerald-400">FLOOM_API_URL</span>
              <span className="text-neutral-400">=</span>
              <span className="text-yellow-300">
                https://floom-60sec.vercel.app
              </span>{" "}
              <span className="text-white">npx tsx cli/deploy.ts</span>{" "}
              <span className="text-neutral-300">./fixtures/python-simple</span>
            </p>
          </div>
        </div>

        {/* Manifest example */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-[#e4ded3] bg-[#f1eee7]">
          <div className="border-b border-[#e4ded3] px-5 py-3 font-mono text-xs text-neutral-500">
            floom.yaml
          </div>
          <div className="p-5 font-mono text-sm leading-7 sm:p-8">
            <p>
              <span className="text-orange-700">name</span>
              <span className="text-neutral-500">:</span>{" "}
              <span className="text-emerald-700">pitch-coach</span>
            </p>
            <p>
              <span className="text-orange-700">runtime</span>
              <span className="text-neutral-500">:</span>{" "}
              <span className="text-emerald-700">python</span>
            </p>
            <p>
              <span className="text-orange-700">entrypoint</span>
              <span className="text-neutral-500">:</span>{" "}
              <span className="text-emerald-700">app.py</span>
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/tokens"
            className="inline-block rounded-xl bg-emerald-700 px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-emerald-800"
          >
            Get your token
          </Link>
        </div>
      </section>

      {/* ── TRY A LIVE APP ───────────────────────────────────────── */}
      <section className="border-t border-[#e4ded3] py-16">
        <div className="mx-auto max-w-5xl px-5 text-center">
          <p className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-emerald-700">
            Live demo
          </p>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            Try a live app right now.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-neutral-600">
            No sign-in needed. See what a Floom-hosted app looks like in the
            browser.
          </p>

          <div className="mx-auto mt-10 max-w-sm overflow-hidden rounded-2xl border border-[#e4ded3] bg-white shadow-xl shadow-neutral-200/60 transition-shadow hover:shadow-2xl">
            <div className="border-b border-[#e4ded3] bg-[#f1eee7] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-white text-sm font-black">
                  S
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold">smoke-1777538613152</p>
                  <p className="text-xs text-neutral-500">@floom · python</p>
                </div>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-neutral-600">
                A smoke-test app that validates the full E2B run pipeline.
              </p>
              <Link
                href="/p/smoke-1777538613152"
                className="mt-4 block rounded-lg bg-emerald-700 px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
              >
                Open app →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="border-t border-[#e4ded3] py-12">
        <div className="mx-auto max-w-5xl px-5">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            <Link href="/" className="flex items-center gap-2 text-xl font-black">
              <span className="h-3 w-3 rounded-sm bg-emerald-500" />
              floom<span className="text-emerald-600">.</span>
            </Link>
            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-neutral-600">
              <a
                href="https://discord.gg/8fXGXjxcRz"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-emerald-700"
              >
                Discord
              </a>
              <a
                href="https://github.com/floomhq/floom"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-emerald-700"
              >
                GitHub
              </a>
              <a
                href="https://floom.dev"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-emerald-700"
              >
                floom.dev
              </a>
            </nav>
            <p className="text-xs text-neutral-400">
              Open source, MIT licensed.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}

const HOW_IT_WORKS = [
  {
    num: "01",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    title: "Write a Python function",
    body: "Create an app.py with a run(inputs) function, a floom.yaml manifest, and a JSON Schema for inputs.",
    mono: "app.py · floom.yaml · schema.json",
  },
  {
    num: "02",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
    title: "Deploy with one command",
    body: "Set your Floom agent token and run the CLI. Your app is published to Floom and a live /p/:slug URL is returned.",
    mono: "npx tsx cli/deploy.ts ./your-app",
  },
  {
    num: "03",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    title: "Share the link",
    body: "Anyone with the URL can run your app from a browser, MCP client, or with curl — no account needed for public apps.",
    mono: "floom-60sec.vercel.app/p/:slug",
  },
];
