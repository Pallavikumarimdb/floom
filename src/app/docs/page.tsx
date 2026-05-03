import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";

const SITE_URL = "https://floom.dev";

export const metadata: Metadata = {
  title: "Docs",
  description: "Build, publish, and run stock-E2B Floom apps with tarball bundles, optional schemas, secrets, API, CLI, and MCP.",
  alternates: { canonical: `${SITE_URL}/docs` },
  openGraph: {
    title: "Floom Docs",
    description: "The stock-E2B Floom contract: thin wrapper, full app bundle, one run surface.",
    url: `${SITE_URL}/docs`,
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
  },
};

const manifestExample = `slug: my-app
input_schema: ./input.schema.json
output_schema: ./output.schema.json
secrets:
  - GEMINI_API_KEY
public: true
# optional:
# command: python app.py
# dependencies:
#   python: ./requirements.txt --require-hashes
# bundle_exclude:
#   - fixtures/
#   - samples/`;

const legacyManifestExample = `name: Meeting Action Items
slug: meeting-action-items
runtime: python
entrypoint: app.py
handler: run
public: true
input_schema: ./input.schema.json
output_schema: ./output.schema.json
dependencies:
  python: ./requirements.txt`;

const launchCommand = `npx @floomhq/cli@latest setup
mkdir my-floom-app && cd my-floom-app
SLUG="stock-e2b-demo-$(date +%s)"
npx @floomhq/cli@latest init --name "Stock E2B Demo" --slug "$SLUG" --type custom
npx @floomhq/cli@latest deploy --dry-run
npx @floomhq/cli@latest deploy`;

const apiExample = `curl -X POST https://floom.dev/api/apps/YOUR_SLUG/run \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"text":"Hello from Floom"}}'`;

const privateApiExample = `curl -X POST https://floom.dev/api/apps/YOUR_PRIVATE_SLUG/run \\
  -H 'Authorization: Bearer YOUR_FLOOM_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"text":"Send this from n8n or any HTTP client"}}'`;

const mcpExample = `POST https://floom.dev/mcp
tool: get_app_contract

POST https://floom.dev/mcp
tool: list_app_templates

POST https://floom.dev/mcp
tool: get_app_template
arguments: { "key": "multi_file_python" }

POST https://floom.dev/mcp
tool: run_app
arguments: { "slug": "YOUR_PUBLIC_SLUG", "inputs": { "text": "Hello from Floom" } }`;

const outputModes = `output_schema declared:
- app prints JSON on stdout final line, or writes /home/user/output.json
- Floom validates it and returns the parsed JSON as output

no output_schema + stdout final line is valid JSON:
- Floom returns the parsed JSON directly as output

no output_schema + plain stdout:
- Floom returns { "stdout": "<last 4 KB tail>", "exit_code": 0 }`;

const autoExcludes = `node_modules/
.git/
.next/
__pycache__/
*.pyc
dist/
build/
.venv/
venv/
.DS_Store
*.log
.env
.env.local
.env.*.local`;

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[#ded8cc] py-8">
      <h2 className="text-2xl font-black tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 text-neutral-600">{children}</div>
    </section>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="max-w-full whitespace-pre-wrap break-words rounded-xl border border-[#ded8cc] bg-[#11110f] p-4 text-sm leading-7 text-[#f6f1e7]">
      <code>{children}</code>
    </pre>
  );
}

export default function DocsPage() {
  return (
    <main id="main" className="min-h-screen overflow-x-hidden bg-[#faf9f5] text-[#11110f]">
      <SiteHeader />

      <article className="mx-auto max-w-4xl px-5 py-14">
        <p className="mb-3 text-sm font-semibold text-emerald-700">
          Floom stock-E2B docs
        </p>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          Thin wrapper on top of E2B.
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-neutral-600">
          Floom no longer forces a single-file Python handler shape for new apps. Publish the whole app directory as a tarball, let stock E2B run it, and keep Floom focused on sharing, secrets, rate limits, redaction, API, browser UI, and MCP.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/tokens"
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            Create token
          </Link>
          <Link
            href="/p/meeting-action-items"
            className="rounded-md border border-[#ded8cc] bg-white px-4 py-2 text-sm font-semibold text-neutral-800"
          >
            Run live demo
          </Link>
        </div>

        <Section title="Fastest path">
          <ol className="list-decimal space-y-3 pl-5">
            <li>Run <code>npx @floomhq/cli@latest setup</code>.</li>
            <li>Put <code>floom.yaml</code> at the app root.</li>
            <li>Add any files the app needs: Python modules, package.json, helpers, fixtures, sample data.</li>
            <li>Publish the app directory through the CLI, MCP, or publish API.</li>
            <li>Run it through <code>/p/:slug</code>, REST, or MCP.</li>
          </ol>
          <CodeBlock>{launchCommand}</CodeBlock>
        </Section>

        <Section title="Contract">
          <ul className="list-disc space-y-3 pl-5">
            <li>Bundle format: one <code>.tar.gz</code> app bundle in Supabase Storage.</li>
            <li>Bundle root: <code>floom.yaml</code> is required at the tarball root.</li>
            <li>Run surface: one command per app run, not arbitrary HTTP route proxying.</li>
            <li>Inputs: optional schema; same JSON goes to stdin and <code>FLOOM_INPUTS</code>.</li>
            <li>Outputs: optional schema; validated JSON when declared, parsed JSON or stdout tail when not declared.</li>
            <li>Dependencies: <code>requirements.txt</code> auto-installs when present; <code>npm install</code> runs when <code>package.json</code> is present.</li>
            <li>Secrets: declare names only in <code>floom.yaml</code>; values stay owner-managed and encrypted at rest.</li>
            <li>Legacy support: the v0.1 Python handler manifest still publishes and runs unchanged.</li>
          </ul>
          <p className="text-sm text-neutral-500">
            Stock-E2B mode widens the runtime, not the product contract. Floom still gives you one browser surface, one REST run endpoint, one MCP run tool, redaction, quotas, and sharing. For preinstalled runtime details, system packages, browsers, or GPUs, use the official E2B docs:{" "}
            <a className="underline" href="https://e2b.dev/docs" target="_blank" rel="noreferrer">e2b.dev/docs</a>.
          </p>
        </Section>

        <Section title="Manifest">
          <p>
            The preferred manifest is small. If <code>command</code> is omitted, publish can detect exactly one stock-E2B command from <code>app.py</code>, <code>index.js</code>, or <code>package.json</code> with a <code>start</code> script. Multiple matches are rejected as ambiguous.
          </p>
          <CodeBlock>{manifestExample}</CodeBlock>
          <p className="text-sm text-neutral-500">
            Legacy manifests still work:
          </p>
          <CodeBlock>{legacyManifestExample}</CodeBlock>
        </Section>

        <Section title="Bundle rules">
          <p>
            Publish creates a tarball from the app directory. Floom auto-excludes the common junk and dependency folders below before size checks run.
          </p>
          <CodeBlock>{autoExcludes}</CodeBlock>
          <ul className="list-disc space-y-3 pl-5">
            <li>Compressed limit: <code>5 MB</code>.</li>
            <li>Unpacked limit: <code>25 MB</code>.</li>
            <li>Single file limit: <code>10 MB</code>.</li>
            <li>File count limit: <code>500</code>.</li>
            <li>Zip-bomb defense: decompressed-to-compressed ratio capped at <code>100x</code>.</li>
          </ul>
        </Section>

        <Section title="Inputs and outputs">
          <p>
            Apps can be fully structured, partially structured, or run-only.
          </p>
          <CodeBlock>{outputModes}</CodeBlock>
          <p className="text-sm text-neutral-500">
            Input rules:
          </p>
          <ul className="list-disc space-y-3 pl-5">
            <li>If <code>input_schema</code> exists, Floom validates <code>inputs</code> before the run.</li>
            <li>If no schema exists and no <code>inputs</code> are sent, Floom just runs the command.</li>
            <li>If no schema exists and <code>inputs</code> are sent, Floom passes the raw JSON through without validation.</li>
          </ul>
        </Section>

        <Section title="Run through API">
          <p>
            Public apps can be run without auth. Private apps need the owner session or an agent token with run access.
          </p>
          <CodeBlock>{apiExample}</CodeBlock>
          <CodeBlock>{privateApiExample}</CodeBlock>
          <p className="text-sm text-neutral-500">
            Failure envelopes are structured. Install errors, non-zero exits, and timeouts return HTTP 200 with <code>status: failed</code> or <code>timed_out</code>. Sandbox boot failures return HTTP 502 with <code>error: sandbox_unavailable</code>.
          </p>
        </Section>

        <Section title="Run through MCP">
          <p>
            MCP clients use the same publish and run path as the browser and REST API.
          </p>
          <CodeBlock>{mcpExample}</CodeBlock>
          <p className="text-sm text-neutral-500">
            <code>publish_app</code> now prefers a file map for the full app directory. The old single-file Python shortcut still exists for legacy manifests.
          </p>
        </Section>

        <Section title="Quotas and limits">
          <ul className="list-disc space-y-3 pl-5">
            <li>Sync run cap: <code>60s</code>.</li>
            <li>Anonymous public rate limit: <code>20</code> runs per caller per <code>60s</code>.</li>
            <li>Per-app public rate limit: <code>100</code> runs per <code>60s</code>.</li>
            <li>Per-app E2B quota: <code>30 minutes</code> per day.</li>
            <li>Per-owner E2B quota: <code>2 hours</code> per day across all apps.</li>
          </ul>
          <p className="text-sm text-neutral-500">
            Long-running jobs remain outside this branch. Use the async + poll capability for runs that cannot fit inside the current 60-second synchronous envelope.
          </p>
        </Section>
      </article>
      <FloomFooter />
    </main>
  );
}
