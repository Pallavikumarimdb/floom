"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";

const NPX_CMD = "npx @floomhq/cli@latest setup";

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

// ── Hero ─────────────────────────────────────────────────────────────────────

function Eyebrow() {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        Works with any MCP client
      </div>
      <div className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">
        e.g. <span className="text-neutral-600">Claude Code</span> ·{" "}
        <span className="text-neutral-600">Cursor</span> ·{" "}
        <span className="text-neutral-600">Codex CLI</span>
      </div>
    </div>
  );
}

function HeroSection() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyText(NPX_CMD);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="mx-auto max-w-5xl px-5 pb-12 pt-16 text-center">
      <Eyebrow />

      <h1 className="mx-auto mt-7 max-w-4xl text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl">
        Ship AI apps <span className="text-emerald-700">fast</span>.
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600">
        Localhost to live in 60 seconds.{" "}
        <Link
          href="/login?mode=signup"
          className="font-semibold text-[#0e0e0c] underline decoration-[1.5px] underline-offset-[3px] hover:text-emerald-700"
        >
          Sign up to publish.
        </Link>
      </p>

      {/* Install snippet */}
      <div className="mx-auto mt-7 max-w-[540px] text-left">
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
            onClick={() => void handleCopy()}
            className={`absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border px-3.5 py-1.5 text-[12px] font-semibold leading-none transition-all ${
              copied
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-emerald-700/35 bg-white text-emerald-700"
            }`}
            aria-label={copied ? "Copied" : "Copy command"}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-[13px] text-neutral-500">
          <span>or</span>
          <Link
            href="/p/demo-app"
            className="inline-flex items-center gap-1 font-semibold text-emerald-700 no-underline transition-colors hover:text-emerald-800"
          >
            try a live app in your browser
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="mt-3.5 text-[12.5px] text-neutral-400">
          1 app live · 0 runs this week · ★ open source
        </div>
      </div>
    </section>
  );
}

// ── Visual demo: BUILD / DEPLOY / RUN tile ───────────────────────────────────

type Stage = "build" | "deploy" | "run";

const FILES: Record<Stage, ReadonlyArray<{ name: string; active?: boolean }>> = {
  build: [
    { name: "handler.py", active: true },
    { name: "floom.yaml" },
    { name: "README.md" },
  ],
  deploy: [
    { name: "handler.py" },
    { name: "floom.yaml", active: true },
    { name: "README.md" },
  ],
  run: [{ name: "/p/pitch-coach", active: true }],
};

const CODE: Record<Stage, ReadonlyArray<{ n: number; html: React.ReactNode }>> = {
  build: [
    { n: 1, html: <><span className="text-rose-700">def</span> <span className="text-amber-700">handler</span>(inputs):</> },
    { n: 2, html: <>    pitch = inputs[<span className="text-emerald-700">&quot;pitch&quot;</span>]</> },
    { n: 3, html: <>    feedback = coach(pitch)</> },
    { n: 4, html: <>    <span className="text-rose-700">return</span> {`{`}<span className="text-emerald-700">&quot;result&quot;</span>: feedback{`}`}</> },
  ],
  deploy: [
    { n: 1, html: <>name: pitch-coach</> },
    { n: 2, html: <>runtime: python</> },
    { n: 3, html: <>entrypoint: handler.py</> },
    { n: 4, html: <>handler: handler</> },
    { n: 5, html: <>public: <span className="text-emerald-700">true</span></> },
  ],
  run: [
    { n: 1, html: <><span className="text-neutral-400">→</span> POST /api/run</> },
    { n: 2, html: <><span className="text-neutral-400">{"{"}</span></> },
    { n: 3, html: <>{"  "}<span className="text-emerald-700">&quot;result&quot;</span>: <span className="text-rose-700">&quot;Strong premise…&quot;</span></> },
    { n: 4, html: <><span className="text-neutral-400">{"}"}</span></> },
    { n: 5, html: <><span className="text-emerald-700">200 OK · 412ms</span></> },
  ],
};

const STAGE_LABELS: Record<Stage, string> = {
  build: "BUILD",
  deploy: "DEPLOY",
  run: "RUN",
};

const STAGE_ORDER: Stage[] = ["build", "deploy", "run"];

function HeroDemoTile() {
  const [stage, setStage] = useState<Stage>("build");
  const files = FILES[stage];
  const code = CODE[stage];

  return (
    <section id="demo" className="mx-auto max-w-5xl px-5 pb-20">
      <div className="overflow-hidden rounded-3xl border border-[#e4ded3] bg-[#f1eee7] text-left shadow-2xl shadow-neutral-200/80">
        {/* Stage tracker */}
        <div className="grid grid-cols-3 gap-2 border-b border-[#e4ded3] bg-[#ebe7df] px-4 py-4 text-center font-mono text-[11px] font-bold uppercase tracking-widest text-neutral-500 sm:px-10 sm:text-xs">
          {STAGE_ORDER.map((s, i) => {
            const isActive = stage === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStage(s)}
                aria-current={isActive ? "step" : undefined}
                className={`relative inline-flex items-center justify-center gap-2 rounded-md py-2 transition-colors ${
                  isActive ? "bg-white text-[#0e0e0c] shadow-sm" : "hover:text-[#0e0e0c]"
                }`}
              >
                <span className="text-neutral-400">0{i + 1}</span> {STAGE_LABELS[s]}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-[18px] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-emerald-500"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="grid min-h-[320px] md:grid-cols-[200px_1fr]">
          <aside className="border-b border-[#e4ded3] bg-[#e9e5dc] p-5 font-mono text-[11px] uppercase tracking-widest text-neutral-500 md:border-b-0 md:border-r">
            <p className="mb-4 truncate font-semibold text-neutral-700">pitch-coach</p>
            <ul className="space-y-1">
              {files.map((f) => (
                <li
                  key={f.name}
                  className={`truncate rounded px-2 py-1.5 ${
                    f.active ? "bg-[#f4f1eb] text-[#0e0e0c]" : ""
                  }`}
                >
                  {f.name}
                </li>
              ))}
            </ul>
          </aside>

          <div className="min-w-0 overflow-x-auto bg-[#fbfaf7] p-5 font-mono text-[14px] leading-8 sm:p-8">
            {code.map((line) => (
              <div key={line.n} className="flex items-start gap-3 whitespace-pre">
                <span className="select-none text-neutral-400">{line.n}</span>
                <span>{line.html}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── How it works ─────────────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    num: "01",
    label: "Write a Python function",
    body: "One file, one handler, one JSON Schema for inputs. No new framework.",
    mono: "handler.py · floom.yaml",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
        aria-hidden="true"
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    num: "02",
    label: "Publish from the CLI",
    body: "Sign in, mint a token, run one command. Floom hosts the UI, the REST endpoint, and the MCP tool.",
    mono: "floom publish ./my-app",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
        aria-hidden="true"
      >
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    num: "03",
    label: "Share the link",
    body: "Anyone hits /p/your-app in a browser, your REST endpoint with curl, or your MCP tool from Claude or Cursor.",
    mono: "/p/your-app",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.6}
        aria-hidden="true"
      >
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#faf9f5] text-[#11110f]">
      <SiteHeader />
      <main>
        <HeroSection />
        <HeroDemoTile />
        <HowItWorksSection />
      </main>
      <FloomFooter />
    </div>
  );
}
