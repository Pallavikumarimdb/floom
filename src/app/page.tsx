"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-20 text-white">
      <section className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <p className="mb-3 text-xs font-bold uppercase tracking-normal text-emerald-300">
          Floom v0
        </p>
        <h1 className="mb-4 text-5xl font-bold leading-none">
          Localhost to live apps.
        </h1>
        <p className="mb-8 max-w-xl text-lg leading-8 text-neutral-300">
          Ship a tiny function app as a generated UI backed by JSON Schema,
          Supabase records, and sandbox execution.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <a
            href="https://github.com/floomhq/floomit"
            className="rounded-xl border border-white/15 bg-white p-5 text-neutral-950 transition hover:border-emerald-300"
          >
            <span className="mb-3 block text-xs font-bold uppercase tracking-normal text-emerald-700">
              Install
            </span>
            <strong className="block text-2xl">Install floomit skill</strong>
            <span className="mt-2 block text-neutral-600">Floom MCP next</span>
          </a>
          <Link
            href="/p/demo-app"
            className="rounded-xl border border-emerald-400 bg-emerald-600 p-5 text-white transition hover:bg-emerald-500"
          >
            <span className="mb-3 block text-xs font-bold uppercase tracking-normal text-white/80">
              Run
            </span>
            <strong className="block text-2xl">Test live app</strong>
            <span className="mt-2 block text-white/80">Generated UI</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
