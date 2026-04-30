"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#faf9f5] text-[#11110f]">
      <header className="border-b border-[#e7e2d8] bg-[#faf9f5]/95">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2 text-xl font-black">
            <span className="h-3 w-3 rounded-sm bg-emerald-500" />
            floom<span className="text-emerald-600">.</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-neutral-600 sm:flex">
            <a href="https://floom.dev/apps">Apps</a>
            <a href="https://floom.dev/docs">Docs</a>
            <a href="https://floom.dev/changelog">Changelog</a>
          </div>
          <a
            href="https://floom.dev"
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            Join waitlist
          </a>
        </nav>
      </header>

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
          <span className="text-neutral-700">$ npx @floomhq/cli@latest setup</span>
          <a
            href="https://github.com/floomhq/floomit"
            className="rounded-md border border-emerald-200 bg-white px-3 py-2 font-sans text-xs font-bold text-emerald-700"
          >
            Install skill
          </a>
        </div>

        <div className="mt-5 text-sm text-neutral-500">
          or{" "}
          <Link
            href="/p/pitch-live-1777527051784"
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
