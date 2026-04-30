"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4">
      <h1 className="text-4xl font-bold mb-4">Floom</h1>
      <p className="text-lg text-slate-600 mb-8 text-center max-w-md">
        From localhost to live and secure in 60 seconds.
      </p>
      <div className="flex gap-4">
        <Link
          href="/p/demo-app"
          className="px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition"
        >
          Try a demo app
        </Link>
      </div>
    </main>
  );
}
