"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// GitHub stars badge — localStorage-cached (10-min TTL), fallback = 60.
const FALLBACK_STARS = 60;
const CACHE_KEY = "floom:gh-stars";
const TTL_MS = 10 * 60 * 1000;

function readStarsCache(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { count?: number; ts?: number };
    if (typeof parsed.count !== "number" || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return parsed.count;
  } catch {
    return null;
  }
}

function writeStarsCache(count: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ count, ts: Date.now() }));
  } catch {
    /* ignore */
  }
}

function formatStars(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function GitHubStarsBadge() {
  const [count, setCount] = useState<number>(FALLBACK_STARS);

  useEffect(() => {
    const cached = readStarsCache();
    if (cached !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCount(cached);
      return;
    }
    let cancelled = false;
    fetch("/api/gh-stars", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count?: number } | null) => {
        if (cancelled || !d || typeof d.count !== "number") return;
        setCount(d.count);
        writeStarsCache(d.count);
      })
      .catch(() => {
        /* keep fallback */
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <a
      href="https://github.com/floomhq/floom"
      target="_blank"
      rel="noreferrer"
      aria-label={`floomhq/floom on GitHub (${count} stars)`}
      title={`${count} stars on GitHub`}
      className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(14,14,12,0.18)] bg-[#fafaf8] px-2.5 py-[5px] text-[12px] font-semibold leading-none text-[#0e0e0c] no-underline transition-colors hover:border-neutral-400"
    >
      {/* GitHub mark — SimpleIcons path */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
      <span>
        <span aria-hidden="true" className="mr-0.5">★</span>
        {formatStars(count)}
      </span>
    </a>
  );
}

// Copy-for-Claude / install snippet button
function GetInstallSnippetButton() {
  const [copied, setCopied] = useState(false);
  const cmd = "npx @floomhq/cli@latest setup";

  async function handleClick() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(cmd);
      } else {
        const ta = document.createElement("textarea");
        ta.value = cmd;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(14,14,12,0.18)] bg-[#fafaf8] px-3 py-[6px] text-[12px] font-semibold leading-none text-[#0e0e0c] transition-colors hover:border-neutral-400 hover:bg-white"
      title={cmd}
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Get install snippet
        </>
      )}
    </button>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#e7e2d8] bg-[#faf9f5]/95 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        {/* Logo */}
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-2 text-[17px] font-black leading-none tracking-tight text-[#0e0e0c] no-underline"
          aria-label="floom — home"
        >
          <span className="h-[18px] w-[18px] rounded-[4px] bg-emerald-500" aria-hidden="true" />
          floom<span className="text-emerald-500" aria-hidden="true">.</span>
        </Link>

        {/* Centered nav — hidden on mobile */}
        <nav
          className="hidden items-center gap-0.5 lg:flex"
          aria-label="Primary"
        >
          {[
            { label: "Apps", href: "https://floom.dev/apps" },
            { label: "Docs", href: "https://floom.dev/docs" },
            { label: "Pricing", href: "https://floom.dev/pricing" },
            { label: "Changelog", href: "https://floom.dev/changelog" },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-2.5 py-[7px] text-[13px] font-medium leading-none text-neutral-500 no-underline transition-colors hover:text-[#0e0e0c]"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Right cluster */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:flex items-center gap-2">
            <GitHubStarsBadge />
            <GetInstallSnippetButton />
          </div>
          <a
            href="https://floom.dev"
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-[#0e0e0c] px-3.5 py-[7px] text-[13px] font-semibold leading-none text-white no-underline transition-opacity hover:opacity-80"
          >
            Join waitlist
          </a>
        </div>
      </nav>
    </header>
  );
}
