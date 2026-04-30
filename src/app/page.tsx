"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#faf9f5] text-[#11110f]">
      <SiteHeader showProductLinks />

      <section className="mx-auto max-w-5xl px-5 pb-24 pt-20 text-center">
        <p className="mb-4 text-sm font-semibold text-emerald-700">
          Works with Codex, Claude Code, Cursor, and any MCP client
        </p>
        <h1 className="mx-auto max-w-4xl text-6xl font-black leading-none tracking-tight sm:text-7xl">
          Ship AI apps <span className="text-emerald-700">fast</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-neutral-600">
          Localhost to live in 60 seconds. Python functions become shareable
          browser apps backed by Supabase and E2B.
        </p>

        <div className="mx-auto mt-8 flex max-w-xl items-center justify-between rounded-lg border border-[#ded8cc] bg-[#f3f0ea] p-3 text-left font-mono text-sm shadow-sm">
          <span className="text-neutral-700">$ FLOOM_TOKEN=... npx tsx cli/deploy.ts ./app</span>
          <Link
            href="/tokens"
            className="rounded-md border border-emerald-200 bg-white px-3 py-2 font-sans text-xs font-bold text-emerald-700"
          >
            Create token
          </Link>
        </div>

        <div className="mt-5 text-sm text-neutral-500">
          or{" "}
          <Link
            href="/p/smoke-1777538613152"
            className="font-semibold text-emerald-700"
          >
            Run/test live app →
          </Link>
        </div>

        <div className="mx-auto mt-14 overflow-hidden rounded-3xl border border-[#e4ded3] bg-[#f1eee7] text-left shadow-2xl shadow-neutral-200/80">
          <div className="grid grid-cols-3 border-b border-[#e4ded3] px-10 py-5 text-center font-mono text-xs font-bold uppercase tracking-widest text-neutral-500">
            <span>01 Build</span>
            <span>02 Deploy</span>
            <span>03 Run</span>
          </div>
          <div className="grid min-h-[320px] md:grid-cols-[180px_1fr]">
            <aside className="border-r border-[#e4ded3] bg-[#e9e5dc] p-5 font-mono text-xs uppercase tracking-widest text-neutral-500">
              <p className="mb-5">pitch-coach</p>
              <p className="rounded bg-[#f4f1eb] p-2 text-neutral-800">handler.py</p>
              <p className="p-2">floom.yaml</p>
              <p className="p-2">schema.json</p>
            </aside>
            <div className="bg-[#fbfaf7] p-8 font-mono text-sm leading-8">
              <p><span className="text-neutral-400">1</span> <span className="text-orange-700">def</span> run(inputs):</p>
              <p><span className="text-neutral-400">2</span>     pitch = inputs[<span className="text-emerald-700">&quot;pitch&quot;</span>]</p>
              <p><span className="text-neutral-400">3</span>     <span className="text-orange-700">return</span> {"{"}&quot;result&quot;: coach(pitch){"}"}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
