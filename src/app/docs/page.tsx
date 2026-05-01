import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";

const SITE_URL = "https://floom-60sec.vercel.app";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Floom v0 docs: ship a Python function as a hosted UI, REST endpoint, and MCP tool in 60 seconds. The v0 contract, manifest, MCP templates, and v0.1 scope.",
  alternates: { canonical: `${SITE_URL}/docs` },
  openGraph: {
    type: "article",
    title: "Floom Docs — Local Python function to live app",
    description:
      "The v0 contract: one Python function, JSON Schema inputs, browser page + REST + MCP. Plus v0.1 scope (deps, secrets) and limits.",
    url: `${SITE_URL}/docs`,
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Floom Docs",
    description: "Ship a Python function as a hosted UI, REST endpoint, and MCP tool.",
    images: [`${SITE_URL}/opengraph-image`],
  },
};

const manifestExample = `name: meeting-action-items
slug: meeting-action-items
runtime: python
entrypoint: app.py
handler: run
public: true
input_schema: input.schema.json
output_schema: output.schema.json`;

const apiExample = `curl -X POST https://floom-60sec.vercel.app/api/apps/meeting-action-items/run \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"notes":"Standup. Sarah ships migration docs by EOW. Marcus fixes /reports 500 by lunch."}}'`;

const mcpExample = `POST https://floom-60sec.vercel.app/mcp
tool: get_app_contract

POST https://floom-60sec.vercel.app/mcp
tool: list_app_templates

POST https://floom-60sec.vercel.app/mcp
tool: get_app_template
arguments: { "key": "invoice_calculator" }

POST https://floom-60sec.vercel.app/mcp
tool: run_app
arguments: { "slug": "meeting-action-items", "inputs": { ... } }`;

const mcpInstallClaudeCode = `# Add Floom as an MCP server in Claude Code
claude mcp add floom https://floom-60sec.vercel.app/mcp

# Confirm it registered
claude mcp list

# Then ask Claude to list Floom tools:
# > list tools from the floom MCP server`;

const mcpInstallCursor = `// ~/.cursor/mcp.json
{
  "mcpServers": {
    "floom": {
      "url": "https://floom-60sec.vercel.app/mcp",
      "transport": "http"
    }
  }
}
// Restart Cursor after saving. Tools appear under Model Context Protocol in settings.`;

const mcpInstallCodex = `// ~/.codex/mcp.json
{
  "servers": {
    "floom": {
      "url": "https://floom-60sec.vercel.app/mcp",
      "transport": "http"
    }
  }
}
// Codex picks up ~/.codex/mcp.json on startup.
// Verify: codex mcp list`;

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[var(--line)] py-8">
      <h2 className="text-2xl font-black tracking-tight text-[var(--ink)]">{title}</h2>
      <div className="mt-4 space-y-4 text-[var(--muted)]">{children}</div>
    </section>
  );
}

function CodeBlock({ children }: { children: string }) {
  // overflow-x-auto + whitespace-pre keeps long URLs and command lines
  // readable as a single line on desktop, and lets users horizontally
  // scroll on mobile instead of break-words mid-URL or pushing the page
  // off-screen. text-xs on mobile, sm on sm+ keeps it dense without
  // breaking layout at 375px.
  return (
    <pre className="max-w-full overflow-x-auto whitespace-pre rounded-xl border border-[var(--line)] bg-[var(--code)] p-4 text-xs leading-6 text-[var(--code-text)] sm:text-sm sm:leading-7">
      <code>{children}</code>
    </pre>
  );
}

export default function DocsPage() {
  return (
    <main id="main" className="min-h-screen overflow-x-hidden bg-[var(--bg)] text-[var(--ink)]">
      <SiteHeader />

      <article className="mx-auto max-w-4xl px-5 py-14">
        <p className="mb-3 text-sm font-semibold text-[var(--accent)]">
          Floom v0 docs
        </p>
        <h1 className="text-4xl font-black tracking-tight text-[var(--ink)] sm:text-5xl">
          Local Python function to live app.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">
          Floom v0 publishes a narrow app shape: one stdlib Python function,
          JSON Schema inputs, a browser page, API run, and MCP run.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/tokens"
            className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white"
          >
            Create token
          </Link>
          <Link
            href="/p/meeting-action-items"
            className="rounded-md border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-semibold text-[var(--ink)]"
          >
            Run live demo
          </Link>
        </div>

        <Section title="Fastest launch path">
          <ol className="list-decimal space-y-3 pl-5">
            <li>Sign in or create an account at the token page.</li>
            <li>Create a Floom agent token and copy it once.</li>
            <li>
              Place <code>app.py</code>, <code>floom.yaml</code>, and JSON
              Schema files in a folder.
            </li>
            <li>Publish with the CLI command below.</li>
            <li>
              Open the returned <code>/p/:slug</code> URL and run the app.
            </li>
          </ol>
          <CodeBlock>
            {
              "FLOOM_TOKEN=YOUR_FLOOM_AGENT_TOKEN FLOOM_API_URL=https://floom-60sec.vercel.app npx tsx cli/deploy.ts ./fixtures/python-simple"
            }
          </CodeBlock>
        </Section>

        <Section title="v0 app contract">
          <ul className="list-disc space-y-3 pl-5">
            <li>Runtime: Python.</li>
            <li>Entrypoint: one top-level `.py` file.</li>
            <li>Handler: one function that receives a JSON object and returns JSON.</li>
            <li>Inputs: JSON Schema rendered into a browser form.</li>
            <li>Outputs: JSON object displayed in the app page.</li>
            <li>Dependencies: Python standard library only in v0.</li>
          </ul>
          <p className="text-sm text-[var(--muted)] opacity-80">
            TypeScript, FastAPI/OpenAPI, multiple Python files, custom packages,
            and secrets are outside the v0 contract.
          </p>
        </Section>

        <Section title="Manifest">
          <p>
            <code>public: true</code> makes an app visible and runnable without
            a token. <code>public: false</code> or an omitted{" "}
            <code>public</code> field keeps the app private to the owner
            token/account.
          </p>
          <CodeBlock>{manifestExample}</CodeBlock>
        </Section>

        <Section title="Run through API">
          <p>
            Public apps can be run without auth. Private apps need the owner
            session or an agent token with run access.
          </p>
          <CodeBlock>{apiExample}</CodeBlock>
        </Section>

        <Section title="Run through MCP">
          <p>
            MCP clients can discover Floom at <code>/mcp</code>, call{" "}
            <code>get_app_contract</code> before generating files, fetch useful
            starters with <code>list_app_templates</code> and{" "}
            <code>get_app_template</code>, and use <code>run_app</code> for the
            same app execution path as the browser and API.
          </p>
          <CodeBlock>{mcpExample}</CodeBlock>
        </Section>

        <Section title="Install Floom in your MCP client">
          <p>
            Floom speaks standard JSON-RPC 2.0 over HTTP POST. Any MCP client
            that supports an HTTP transport can connect to{" "}
            <code>https://floom-60sec.vercel.app/mcp</code>.
          </p>

          <div className="space-y-6">
            {/* Claude Code */}
            <div>
              <h3 className="mb-2 text-base font-bold tracking-tight">Claude Code</h3>
              <p className="mb-2 text-sm">
                One command to register, then restart the session. Verified
                end-to-end: <code>claude mcp add</code> registers the server,{" "}
                <code>tools/list</code> returns all four Floom tools, and{" "}
                <code>list_app_templates</code> returns a non-empty result.
              </p>
              <CodeBlock>{mcpInstallClaudeCode}</CodeBlock>
            </div>

            {/* Cursor */}
            <div>
              <h3 className="mb-2 text-base font-bold tracking-tight">Cursor</h3>
              <p className="mb-2 text-sm">
                Cursor reads MCP server config from <code>~/.cursor/mcp.json</code>{" "}
                (or <code>.cursor/mcp.json</code> inside a workspace). Add the
                snippet below and restart Cursor.
              </p>
              <CodeBlock>{mcpInstallCursor}</CodeBlock>
            </div>

            {/* Codex CLI */}
            <div>
              <h3 className="mb-2 text-base font-bold tracking-tight">Codex CLI</h3>
              <p className="mb-2 text-sm">
                Codex CLI loads MCP servers from{" "}
                <code>~/.codex/mcp.json</code> on startup. Create or extend
                that file with the snippet below.
              </p>
              <CodeBlock>{mcpInstallCodex}</CodeBlock>
            </div>
          </div>

          <p className="text-sm text-[var(--muted)] opacity-80">
            All three clients use the same JSON-RPC 2.0 wire format. The{" "}
            <code>initialize</code> handshake returns{" "}
            <code>protocolVersion: &quot;2024-11-05&quot;</code>. Tools are
            listed via <code>tools/list</code> and called via{" "}
            <code>tools/call</code>.
          </p>
        </Section>

        <Section title="MCP app templates">
          <p>
            Floom serves copy-paste v0-safe bundles for agents that need a fast,
            useful starting point instead of a blank function.
          </p>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              <code>invoice_calculator</code>: line items, discount, tax, and
              total.
            </li>
            <li>
              <code>utm_url_builder</code>: campaign links with clean UTM
              parameters.
            </li>
            <li>
              <code>csv_stats</code>: row count, columns, and numeric stats from
              pasted CSV text.
            </li>
            <li>
              <code>meeting_action_items</code>: deterministic action item
              extraction from pasted notes.
            </li>
          </ul>
          <p className="text-sm text-[var(--muted)] opacity-80">
            Every template uses one stdlib-only Python file and includes
            <code> floom.yaml</code>, <code>app.py</code>,{" "}
            <code>input.schema.json</code>, and{" "}
            <code>output.schema.json</code>.
          </p>
        </Section>

        <Section title="v0.1 scope">
          <p>
            v0.1 adds dependencies and secrets without changing Floom into broad
            app hosting.
          </p>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Constrained Python dependency installation from{" "}
              <code>requirements.txt</code>.
            </li>
            <li>
              Secret names in <code>floom.yaml</code>, never raw secret values.
            </li>
            <li>Secure secret storage and E2B runtime injection.</li>
          </ul>
          <p className="text-sm text-[var(--muted)] opacity-80">
            FastAPI/OpenAPI, arbitrary HTTP servers, TypeScript apps,
            background workers, and full repo hosting remain later milestones.
          </p>
        </Section>

        <Section title="Limits and exclusions">
          <ul className="list-disc space-y-3 pl-5">
            <li>v0 is optimized for short function-style apps.</li>
            <li>Public runs are rate-limited.</li>
            <li>Output fields marked as secret in output schema are redacted.</li>
            <li>Raw agent tokens are shown once and are stored only as hashes.</li>
            <li>No teams, orgs, per-user share links, OAuth providers, or billing in v0.</li>
          </ul>
        </Section>

        <Section title="What &ldquo;secure&rdquo; means in v0">
          <p>
            Each run executes in an isolated E2B sandbox. The site serves over
            HTTPS with CSP, HSTS, X-Frame-Options, and Permissions-Policy
            headers. Public app runs are rate-limited per IP. Agent tokens are
            stored only as hashes; the raw token is shown once at creation.
            Outputs marked secret in the schema are redacted in API and MCP
            responses.
          </p>
          <p className="text-sm text-[var(--muted)] opacity-80">
            v0.1 adds encrypted-at-rest secrets that the runtime injects into
            the sandbox at execution time. Apps that need a secret today should
            wait for v0.1 or use BYOK in inputs.
          </p>
        </Section>

        <Section title="Auth and email redirect">
          <p>
            Signup emails are sent by Supabase Auth. The confirmation link must
            return to `https://floom-60sec.vercel.app/auth/callback?next=/tokens`.
          </p>
          <p>
            If an email sends you to localhost, update the Supabase Auth Site URL
            to `https://floom-60sec.vercel.app` and add
            `https://floom-60sec.vercel.app/auth/callback` to redirect URLs.
          </p>
        </Section>

        <Section title="Why Floom?">
          <p>
            Floom occupies a specific seam: agent-written Python becoming a
            multi-surface artifact in one command. Adjacent products solve
            related but different problems.
          </p>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              <strong>vs Modal.</strong> Modal turns a Python decorator into
              an HTTP endpoint. You still write your own UI and your own MCP
              server. Floom auto-generates both from the JSON Schema, so a
              single function ships as a browser page, a REST endpoint, and
              an MCP tool.
            </li>
            <li>
              <strong>vs Replicate.</strong> Replicate hosts ML models behind
              an API. Floom hosts arbitrary Python functions and exposes
              them to agents as tools. Different audience, different shape.
            </li>
            <li>
              <strong>vs Hugging Face Spaces.</strong> Spaces wraps your code
              in Gradio or Streamlit, which means you write the UI. Floom
              renders a form from your input schema; no UI code.
            </li>
            <li>
              <strong>vs Val.town.</strong> Val.town does scripts-as-URLs
              for JavaScript. Floom is Python-first today, JS later, and
              ships an MCP tool from the same source.
            </li>
            <li>
              <strong>vs Composio.</strong> Composio wraps existing SaaS
              APIs as agent tools. Floom is the inverse — write a Python
              function, get an agent tool. Use both: Composio for the
              SaaS, Floom for your custom logic.
            </li>
          </ul>
        </Section>

        <Section title="FAQ">
          <h3 className="text-lg font-bold text-[var(--ink)]">
            Is Floom open source?
          </h3>
          <p>
            The launch site is at{" "}
            <a
              href="https://github.com/floomhq/floom-minimal"
              className="font-semibold text-[var(--accent)] underline underline-offset-2"
            >
              floomhq/floom-minimal
            </a>
            . The runtime sandbox uses{" "}
            <a
              href="https://e2b.dev"
              className="font-semibold text-[var(--accent)] underline underline-offset-2"
            >
              E2B
            </a>{" "}
            (open) and Supabase (open core).
          </p>

          <h3 className="text-lg font-bold text-[var(--ink)]">
            What does it cost?
          </h3>
          <p>
            Public apps and public runs are free during alpha. No card on
            file, no automatic charge. See <a
              href="/legal#pricing"
              className="font-semibold text-[var(--accent)] underline underline-offset-2"
            >/legal#pricing</a>.
          </p>

          <h3 className="text-lg font-bold text-[var(--ink)]">
            Can I run private apps?
          </h3>
          <p>
            Yes. Set <code>public: false</code> in <code>floom.yaml</code>{" "}
            (or omit the field). Private apps require an agent token with{" "}
            <code>run</code> scope. Mint tokens at{" "}
            <a
              href="/tokens"
              className="font-semibold text-[var(--accent)] underline underline-offset-2"
            >
              /tokens
            </a>
            .
          </p>

          <h3 className="text-lg font-bold text-[var(--ink)]">
            Can I use packages from PyPI?
          </h3>
          <p>
            Not in v0 — Python standard library only. v0.1 lands{" "}
            <code>requirements.txt</code> with hash-locked dependencies.
            Apps that need <code>google-genai</code>, <code>openai</code>,
            or other libraries should wait for v0.1 or use Floom for the
            stdlib parts and call out to another runtime for the LLM call.
          </p>

          <h3 className="text-lg font-bold text-[var(--ink)]">
            Does it support TypeScript?
          </h3>
          <p>
            Not yet. Python-only in v0. JavaScript / TypeScript runtime is
            on the v0.x roadmap.
          </p>

          <h3 className="text-lg font-bold text-[var(--ink)]">
            How does my agent call a Floom app?
          </h3>
          <p>
            Floom serves a single MCP endpoint at{" "}
            <code>/mcp</code>. Add it to your MCP client (Claude Code,
            Cursor, Codex CLI, etc.) and the <code>run_app</code> tool can
            execute any public app. See the install section above.
          </p>

          <h3 className="text-lg font-bold text-[var(--ink)]">
            What if my run fails?
          </h3>
          <p>
            The browser shows the error message + a retry button. The most
            common cause is a cold sandbox — give it 5–10 seconds and try
            again. If a run keeps failing, the app handler likely threw;
            check the source (Source tab) and your inputs.
          </p>

          <h3 className="text-lg font-bold text-[var(--ink)]">
            How do I report a bug or security issue?
          </h3>
          <p>
            Bugs:{" "}
            <a
              href="https://github.com/floomhq/floom-minimal/issues"
              className="font-semibold text-[var(--accent)] underline underline-offset-2"
            >
              GitHub issues
            </a>
            . Security: <code>security@floom.dev</code> (see{" "}
            <a
              href="https://github.com/floomhq/floom-minimal/blob/main/SECURITY.md"
              className="font-semibold text-[var(--accent)] underline underline-offset-2"
            >
              SECURITY.md
            </a>
            ).
          </p>
        </Section>
      </article>
    </main>
  );
}
