"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { DocsIndexEntry } from "@/lib/docs/buildDocsIndex";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [index, setIndex] = useState<DocsIndexEntry[]>([]);
  const router = useRouter();

  // Load index once
  useEffect(() => {
    fetch("/docs-index.json")
      .then((r) => r.json())
      .then((data: DocsIndexEntry[]) => setIndex(data))
      .catch(() => {/* silently fail */});
  }, []);

  // Cmd+K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Derive filtered results from query + index — pure derivation, no effect needed.
  const results = useMemo(() => {
    if (!query.trim()) return index.slice(0, 8);
    const q = query.toLowerCase();
    return index
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [query, index]);


  const navigate = useCallback(
    (url: string) => {
      setOpen(false);
      setQuery("");
      router.push(url);
    },
    [router]
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((v) => Math.min(v + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((v) => Math.max(v - 1, 0));
    } else if (e.key === "Enter" && results[selected]) {
      navigate(results[selected].url);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 hidden lg:flex items-center gap-2 rounded-lg border border-[#ded8cc] bg-white px-3 py-2 text-sm text-neutral-500 shadow-md hover:border-neutral-400 hover:text-neutral-700 transition-colors"
        aria-label="Open search"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span>Search</span>
        <kbd className="ml-1 rounded border border-[#e0dbd0] bg-[#f5f4ed] px-1.5 py-0.5 text-xs font-mono text-neutral-400">⌘K</kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
        onClick={() => { setOpen(false); setQuery(""); }}
        aria-hidden="true"
      />

      {/* Palette */}
      <div
        className="fixed left-1/2 top-[15vh] z-50 w-full max-w-xl -translate-x-1/2 rounded-2xl border border-[#ded8cc] bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Search docs"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[#eded8cc] px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 flex-shrink-0" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            type="search"
            placeholder="Search docs..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={onKeyDown}
            className="flex-1 bg-transparent text-sm text-[#11110f] placeholder:text-neutral-400 outline-none"
          />
          <kbd className="flex-shrink-0 rounded border border-[#e0dbd0] bg-[#f5f4ed] px-1.5 py-0.5 text-xs font-mono text-neutral-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <ul className="max-h-80 overflow-y-auto py-2" role="listbox">
          {results.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-neutral-400">No results</li>
          ) : (
            results.map((item, i) => (
              <li
                key={item.url + item.title}
                role="option"
                aria-selected={i === selected}
              >
                <button
                  type="button"
                  className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${
                    i === selected ? "bg-emerald-50" : "hover:bg-[#f9f8f4]"
                  }`}
                  onClick={() => navigate(item.url)}
                  onMouseEnter={() => setSelected(i)}
                >
                  <KindIcon kind={item.kind} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#11110f] truncate">{item.title}</div>
                    {item.description && (
                      <div className="text-xs text-neutral-500 truncate mt-0.5">{item.description}</div>
                    )}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>

        {/* Footer */}
        <div className="border-t border-[#f0ede6] px-4 py-2 flex items-center gap-4 text-xs text-neutral-400">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">ESC</kbd> close</span>
        </div>
      </div>
    </>
  );
}

function KindIcon({ kind }: { kind: DocsIndexEntry["kind"] }) {
  if (kind === "page") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 text-neutral-400" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }
  if (kind === "section") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 text-neutral-400" aria-hidden="true">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    );
  }
  if (kind === "example") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 text-emerald-600" aria-hidden="true">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    );
  }
  // cli-cmd
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 text-neutral-400" aria-hidden="true">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}
