"use client";

import Link from "next/link";

interface SiteHeaderProps {
  showProductLinks?: boolean;
}

export function SiteHeader({ showProductLinks = false }: SiteHeaderProps) {
  return (
    <header className="border-b border-[#e7e2d8] bg-[#faf9f5]/95">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 text-xl font-black">
          <span className="h-3 w-3 rounded-sm bg-emerald-500" />
          floom<span className="text-emerald-600">.</span>
        </Link>
        {showProductLinks && (
          <div className="hidden items-center gap-7 text-sm text-neutral-600 sm:flex">
            <a href="https://floom.dev/apps">Apps</a>
            <a href="https://floom.dev/docs">Docs</a>
            <a href="https://floom.dev/changelog">Changelog</a>
          </div>
        )}
        <a
          href="https://floom.dev"
          className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          Join waitlist
        </a>
      </nav>
    </header>
  );
}
