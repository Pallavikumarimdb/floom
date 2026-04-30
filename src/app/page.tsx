"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* fall through */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

// ── Section 1: Hero install snippet ─────────────────────────────────────────

const NPX_CMD = "npx @floomhq/cli@latest setup";

function HeroSection() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyText(NPX_CMD);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="mx-auto max-w-5xl px-5 pb-16 pt-20 text-center">
      <p className="mb-4 text-sm font-semibold text-emerald-700">
        Works with any MCP client
      </p>
      <h1 className="mx-auto max-w-4xl text-5xl font-black leading-none tracking-tight sm:text-7xl">
        Ship AI apps <span className="text-emerald-700">fast</span>.
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600">
        Localhost to live in 60 seconds. Beta access via waitlist.
      </p>

      {/* Install snippet */}
      <div className="mx-auto mt-8 max-w-[540px] text-left">
        <div className="relative">
          <pre
            data-testid="hero-npx-command"
            className="overflow-x-auto rounded-[10px] border border-[#e4ded3] bg-[#f5f4f0] px-[18px] py-[14px] pr-[90px] font-mono text-[14px] leading-relaxed text-[#0e0e0c] whitespace-pre"
          >
            <span className="mr-2.5 select-none text-neutral-400">$</span>
            {NPX_CMD}
          </pre>
          <button
            type="button"
            data-testid="hero-npx-copy-btn"
            onClick={() => void handleCopy()}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border px-3.5 py-1.5 text-[12px] font-semibold leading-none transition-all"
            style={{
              color: copied ? "#fff" : "#047857",
              background: copied ? "#047857" : "#fff",
              borderColor: copied ? "#047857" : "rgba(4,120,87,0.35)",
            }}
            aria-label={copied ? "Copied" : "Copy command"}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[13px] text-neutral-500">
          <span>or</span>
          <a
            href="https://floom.dev/p/competitor-lens"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-emerald-700 no-underline transition-colors hover:text-emerald-800"
          >
            try a live app in your browser
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

// ── Section 2: Live demo tile ─────────────────────────────────────────────────

function LiveDemoTile() {
  return (
    <section className="mx-auto max-w-5xl px-5 pb-20">
      <div className="overflow-hidden rounded-3xl border border-[#e4ded3] bg-[#f1eee7] text-left shadow-2xl shadow-neutral-200/80">
        {/* Tab bar */}
        <div className="flex items-center justify-between border-b border-[#e4ded3] bg-[#ebe7df] px-5 py-3">
          <div className="flex items-center gap-2 text-[11px] font-mono font-bold uppercase tracking-widest text-neutral-500">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white border border-[#e4ded3] px-2.5 py-1 text-[#0e0e0c]">
              AI Readiness Audit
            </span>
          </div>
          <div className="hidden items-center gap-4 text-[11px] text-neutral-500 sm:flex">
            <span>SCORE</span>
            <span>DEPLOY</span>
            <span>RUN</span>
          </div>
        </div>

        {/* Body */}
        <div className="grid min-h-[300px] md:grid-cols-[1fr_300px]">
          {/* Left: mock run form */}
          <div className="border-b border-[#e4ded3] p-6 md:border-b-0 md:border-r md:p-8">
            <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              Inputs · 1 field
            </p>
            <label className="mt-4 block text-sm font-bold text-[#26221c]">
              Your URL
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-[#cfc7b8] bg-[#fffdf8] px-3 py-2.5 text-[13px] font-mono text-neutral-400">
                https://example.com
              </div>
            </div>
            <p className="mt-5 font-mono text-[10px] text-neutral-400">
              Or try with example data →
            </p>
            <div className="mt-4 flex gap-2">
              <a
                href="https://floom.dev/p/ai-readiness-audit"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-[13px] font-semibold text-white no-underline transition-colors hover:bg-emerald-800"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Run
              </a>
              <button type="button" className="rounded-lg border border-[#ded8cc] bg-white px-4 py-2.5 text-[13px] font-semibold text-neutral-600">
                Reset
              </button>
            </div>
          </div>

          {/* Right: mock output */}
          <div className="bg-[#fbfaf7] p-6 md:p-8">
            <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              What this fixes
            </p>
            <div className="space-y-2.5 text-[13px] text-neutral-700">
              {[
                "Clear in-story across docs, sharp positioning",
                "Surface real stats + a customer story per section",
                "Run no-JS audit first, only then add interactions",
              ].map((line) => (
                <div key={line} className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                  <span>{line}</span>
                </div>
              ))}
            </div>
            <a
              href="https://floom.dev/p/ai-readiness-audit"
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700 no-underline hover:text-emerald-800"
            >
              Try AI Readiness Audit live →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Section 3: How it works ───────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    num: "01",
    label: "Got an idea or a GitHub link",
    body: "Bring a Python handler, a Docker image, or just an OpenAPI doc. No special framework.",
    mono: "any-repo or idea.md",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    num: "02",
    label: "Deploy it… join waitlist to publish your own app",
    body: "Join the waitlist to publish your own app — marketplace apps are already live for everyone.",
    mono: "npx @floomhq/cli@latest setup",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    num: "03",
    label: "Send the link",
    body: "Anyone with the URL can run your app from a browser, MCP client, or with curl — no account needed.",
    mono: "floom.dev/p/:slug",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
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

// ── Section 4: Showcase — 3 production apps ───────────────────────────────────

const PRODUCTION_APPS = [
  {
    slug: "competitor-lens",
    name: "Competitor Lens",
    emoji: "86",
    description:
      "Paste 2 URLs (yours + competitor). Get the positioning, pricing, and angle diff in under 5 seconds.",
    category: "RESEARCH",
    tags: ["research", "positioning", "sales"],
    github: "https://github.com/floomhq/floom/tree/main/examples/competitor-lens",
    banner: {
      title: "competitor-lens",
      lines: [
        { text: "stripe vs adyen", tone: "" },
        { text: "fee 1.4% vs 1.6%", tone: "dim" },
        { text: "winner: stripe", tone: "accent" },
      ],
    },
  },
  {
    slug: "ai-readiness-audit",
    name: "AI Readiness Audit",
    emoji: "AI",
    description:
      "Paste a URL. Get an AI readiness score, risks, opportunities, and one concrete next step.",
    category: "AUDIT",
    tags: ["audit", "founder"],
    github: "https://github.com/floomhq/floom/tree/main/examples/ai-readiness-audit",
    banner: {
      title: "ai-readiness",
      lines: [
        { text: "floom.dev", tone: "" },
        { text: "score: 8.4/10", tone: "dim" },
        { text: "3 risks · 3 wins", tone: "accent" },
      ],
    },
  },
  {
    slug: "pitch-coach",
    name: "Pitch Coach",
    emoji: "PC",
    description:
      "Paste a short startup pitch. Get 3 direct critiques, 2 angle-specific rewrites, and a line-by-line fix.",
    category: "FOUNDER",
    tags: ["founder", "pitch", "yc"],
    github: "https://github.com/floomhq/floom/tree/main/examples/pitch-coach",
    banner: {
      title: "pitch-coach",
      lines: [
        { text: "harsh truth", tone: "" },
        { text: "3 critiques", tone: "dim" },
        { text: "3 rewrites", tone: "accent" },
      ],
    },
  },
] as const;

function BannerMini({
  title,
  lines,
}: {
  title: string;
  lines: readonly { text: string; tone: string }[];
}) {
  return (
    <div className="flex h-[160px] items-center justify-center border-b border-[#e4ded3] bg-gradient-to-br from-[#f5f4f0] to-white">
      <div className="rounded-lg border border-[#e4ded3] bg-white p-3 font-mono text-[11px] shadow-md shadow-black/5">
        <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-neutral-400">
          {title}
        </span>
        {lines.map((line, idx) => (
          <span
            key={idx}
            className={`block font-medium leading-relaxed ${
              line.tone === "dim"
                ? "text-neutral-400"
                : line.tone === "accent"
                ? "font-semibold text-emerald-700"
                : "text-[#0e0e0c]"
            }`}
          >
            {line.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function ShowcaseSection() {
  return (
    <section className="border-t border-[#e4ded3] py-20">
      <div className="mx-auto max-w-5xl px-5">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-neutral-500">
              Showcase
            </p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
              Three apps Floom already runs in production.
            </h2>
            <p className="mt-2 text-[14.5px] text-neutral-500">
              Real AI doing real work. All deploy from a single GitHub repo.
            </p>
          </div>
          <a
            href="https://floom.dev/apps"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e4ded3] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#0e0e0c] no-underline whitespace-nowrap transition-colors hover:border-neutral-400"
          >
            Browse all 3
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </a>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {PRODUCTION_APPS.map((app, idx) => (
            <div
              key={app.slug}
              className={`overflow-hidden rounded-2xl border border-[#e4ded3] bg-white transition-all hover:-translate-y-px hover:border-neutral-400 hover:shadow-lg hover:shadow-black/5 ${idx === 0 ? "sm:col-span-1" : ""}`}
            >
              <BannerMini title={app.banner.title} lines={app.banner.lines} />
              <div className="flex flex-col gap-2.5 p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold leading-tight text-[#0e0e0c]">
                    {app.name}
                  </h3>
                  <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                    {app.category}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-neutral-500 line-clamp-3">
                  {app.description}
                </p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {app.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[10px] text-neutral-500">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#f0ebe3] pt-3">
                  <a
                    href={app.github}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] text-neutral-400 no-underline hover:text-neutral-600"
                  >
                    GitHub source
                  </a>
                  <a
                    href={`https://floom.dev/p/${app.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white no-underline transition-colors hover:bg-emerald-800"
                  >
                    Open app
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section 5: Directory grid ─────────────────────────────────────────────────

const DIRECTORY_APPS = [
  {
    slug: "password-generator",
    name: "Password Generator",
    description: "Cryptographically secure passwords with configurable length and character sets.",
    tags: ["utility"],
    preview: ["length: 24", "special: true", "output: xK9#..."],
  },
  {
    slug: "json-formatter",
    name: "JSON Formatter",
    description: "Paste messy JSON. Get back pretty-printed, validated output with optional minification.",
    tags: ["utility", "dev"],
    preview: ["{", '  "key": "val"', "}"],
  },
  {
    slug: "word-count",
    name: "Word Count",
    description: "Count characters, words, sentences, and paragraphs. Estimates reading time.",
    tags: ["utility"],
    preview: ["words: 312", "chars: 1,843", "~2 min read"],
  },
  {
    slug: "uuid-generator",
    name: "UUID Generator",
    description: "Generate multiple UUIDs (v4) in bulk. Supports multiple formats.",
    tags: ["utility", "dev"],
    preview: ["550e8400-e29b", "f18a-4d10-...", "v4 · RFC 4122"],
  },
  {
    slug: "base64",
    name: "Base64",
    description: "Encode or decode strings and files to Base64. Handles Unicode correctly.",
    tags: ["utility", "dev"],
    preview: ["encode", "decode", "SGVsbG8="],
  },
  {
    slug: "hash",
    name: "Hash",
    description: "Compute MD5, SHA-1, SHA-256, SHA-512 digests of any string or file.",
    tags: ["dev", "security"],
    preview: ["SHA-256", "abc123...", "64 chars"],
  },
  {
    slug: "slugify",
    name: "Slugify",
    description: "Convert any string to a URL-safe, lowercase, hyphenated slug.",
    tags: ["utility"],
    preview: ["Hello World!", "→", "hello-world"],
  },
  {
    slug: "color-converter",
    name: "Color Converter",
    description: "Convert between HEX, RGB, HSL, and CSS named colors instantly.",
    tags: ["design", "utility"],
    preview: ["#047857", "rgb(4,120,87)", "HSL 161°"],
  },
] as const;

function DirectorySection() {
  return (
    <section className="border-t border-[#e4ded3] py-20">
      <div className="mx-auto max-w-5xl px-5">
        <div className="mb-10 text-center">
          <p className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-neutral-500">
            Directory
          </p>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            Or browse the full directory.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[15px] text-neutral-500">
            12 apps live on floom.dev today — no signup, no setup. Run them, see the output.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DIRECTORY_APPS.map((app) => (
            <div
              key={app.slug}
              className="flex flex-col overflow-hidden rounded-2xl border border-[#e4ded3] bg-white transition-all hover:-translate-y-px hover:border-neutral-400 hover:shadow-md hover:shadow-black/5"
            >
              {/* Code preview */}
              <div className="border-b border-[#e4ded3] bg-[#f5f4f0] p-3">
                <div className="font-mono text-[11px] text-neutral-500">
                  {app.preview.map((line, i) => (
                    <div key={i} className="leading-relaxed">{line}</div>
                  ))}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-4">
                <p className="font-mono text-[10px] text-neutral-400">{app.slug}</p>
                <h3 className="text-[13px] font-semibold text-[#0e0e0c]">{app.name}</h3>
                <p className="text-[12px] leading-relaxed text-neutral-500 line-clamp-2">
                  {app.description}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {app.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-auto pt-3">
                  <a
                    href={`https://floom.dev/p/${app.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1.5 text-[11px] font-semibold text-white no-underline transition-colors hover:bg-emerald-800"
                  >
                    Open app
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Browse all CTA */}
        <div className="mt-12 text-center">
          <a
            href="https://floom.dev/apps"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-[#e4ded3] bg-white px-6 py-3 text-[13px] font-semibold text-[#0e0e0c] no-underline transition-colors hover:border-neutral-400 hover:shadow-sm"
          >
            Browse all 12 apps →
          </a>
        </div>
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#faf9f5] text-[#11110f]">
      <SiteHeader />
      <main>
        <HeroSection />
        <LiveDemoTile />
        <HowItWorksSection />
        <ShowcaseSection />
        <DirectorySection />
      </main>
      <FloomFooter />
    </div>
  );
}
