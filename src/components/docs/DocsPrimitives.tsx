"use client";

import type { ReactNode } from "react";
import { useState } from "react";

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-t border-[#ded8cc] py-10 scroll-mt-[88px]">
      <h2 className="group flex items-center gap-2 text-2xl font-black tracking-tight text-[#11110f]">
        {title}
        <a
          href={`#${id}`}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-300 hover:text-neutral-500 font-normal text-lg no-underline"
          aria-label={`Link to ${title}`}
        >
          #
        </a>
      </h2>
      <div className="mt-4 space-y-4 text-neutral-600">{children}</div>
    </section>
  );
}

export function CodeBlock({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="relative group">
      {label && (
        <div className="text-xs font-semibold text-neutral-400 mb-1.5 tracking-wide">{label}</div>
      )}
      <pre className="max-w-full whitespace-pre-wrap break-words rounded-xl border border-[#e0dbd0] bg-[#f5f4ed] p-4 text-sm leading-7 text-[#2a2520] font-mono">
        <code>{children}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 opacity-40 group-hover:opacity-100 transition-opacity rounded-md border border-[#ddd8cc] bg-white px-2 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-800 hover:border-neutral-400"
        aria-label="Copy code"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function IC({ children }: { children: ReactNode }) {
  return (
    <code className="rounded px-1.5 py-0.5 bg-[#f0ede6] border border-[#e0dbd0] text-[0.85em] font-mono text-[#2a2520]">
      {children}
    </code>
  );
}
