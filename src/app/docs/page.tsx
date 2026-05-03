import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = "https://floom.dev";

export const metadata: Metadata = {
  title: "Docs",
  description: "Build, publish, and run Floom apps: manifest reference, schemas, secrets, API, CLI, MCP, and examples.",
  alternates: { canonical: `${SITE_URL}/docs` },
  openGraph: {
    title: "Floom Docs",
    description: "Everything you need to build and ship a Floom app — from CLI setup to MCP integration.",
    url: `${SITE_URL}/docs`,
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
  },
};

const TOPIC_CARDS = [
  { href: "/docs/quickstart", title: "Quick start", desc: "From zero to a running app in 60 seconds." },
  { href: "/docs/manifest", title: "Manifest reference", desc: "Every field in floom.yaml explained." },
  { href: "/docs/schemas", title: "Input / output schemas", desc: "JSON Schema: enum, min/max, pattern, oneOf." },
  { href: "/docs/secrets", title: "Secrets", desc: "Encrypted secrets injected at run time." },
  { href: "/docs/auth", title: "Authentication", desc: "Browser OAuth, CLI device flow, agent tokens." },
  { href: "/docs/api", title: "REST API", desc: "Run, poll, and publish via HTTP." },
  { href: "/docs/mcp", title: "MCP for AI agents", desc: "All 15 tools — Claude Desktop, Cursor, and more." },
  { href: "/docs/connections", title: "Connections", desc: "77 managed-auth providers via Composio." },
  { href: "/docs/ci", title: "CI / automation", desc: "GitHub Actions snippet, programmatic deploy." },
  { href: "/docs/examples", title: "Examples", desc: "5 working demo apps with run and source links." },
  { href: "/docs/limits", title: "Limits", desc: "Sandbox timeout, rate limits, bundle caps." },
  { href: "/docs/faq", title: "FAQ", desc: "Common questions and troubleshooting." },
] as const;

const QUICKSTART_STEPS = [
  { n: 1, title: "Authenticate", desc: "Run floom setup once per machine. Opens a browser page to link your account." },
  { n: 2, title: "Scaffold", desc: "Run floom init to generate floom.yaml, app.py, and requirements.txt." },
  { n: 3, title: "Deploy", desc: "Run floom deploy to bundle and publish the app to your account." },
  { n: 4, title: "Run it", desc: "Run floom run my-app or hit the live URL." },
] as const;

export default function DocsOverviewPage() {
  return (
    <>
      {/* Hero */}
      <div className="max-w-3xl mb-12">
        <p className="mb-3 text-sm font-semibold text-emerald-700">Floom docs</p>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          Publish a small AI app from your CLI, run it from anywhere.
        </h1>
        <p className="mt-4 text-lg text-neutral-600">
          Write a Python script, add a{" "}
          <code className="rounded px-1.5 py-0.5 bg-[#f0ede6] border border-[#e0dbd0] text-[0.85em] font-mono text-[#2a2520]">floom.yaml</code>
          , and deploy. Floom handles the sandbox, API endpoint, browser UI, MCP tool, and secrets. You own the code.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/p/meeting-action-items"
            className="rounded-md bg-[#11110f] px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 transition-colors"
          >
            Try the live demo
          </Link>
          <Link
            href="/tokens"
            className="rounded-md border border-[#ded8cc] bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:border-neutral-400 transition-colors"
          >
            Mint an agent token
          </Link>
        </div>
      </div>

      {/* Quick start steps */}
      <div className="mb-12">
        <h2 className="text-xl font-black tracking-tight text-[#11110f] mb-4">Quick start</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {QUICKSTART_STEPS.map((step) => (
            <div key={step.n} className="rounded-xl border border-[#ded8cc] bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">
                  {step.n}
                </span>
                <div>
                  <p className="font-semibold text-[#11110f] text-sm">{step.title}</p>
                  <p className="mt-0.5 text-sm text-neutral-500">{step.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Link href="/docs/quickstart" className="text-sm text-emerald-700 font-medium hover:underline">
            Full quick start guide
          </Link>
        </div>
      </div>

      {/* Topic grid */}
      <div className="border-t border-[#ded8cc] pt-10">
        <h2 className="text-xl font-black tracking-tight text-[#11110f] mb-6">All topics</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TOPIC_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-xl border border-[#ded8cc] bg-white p-4 hover:border-neutral-400 hover:shadow-sm transition-all"
            >
              <p className="font-semibold text-[#11110f] text-sm group-hover:text-emerald-700 transition-colors">
                {card.title}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500 leading-relaxed">{card.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
