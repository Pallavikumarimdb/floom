import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";

const manifestExample = `name: pitch-coach
slug: pitch-coach
runtime: python
entrypoint: app.py
handler: run
public: true
input_schema: input.schema.json
output_schema: output.schema.json`;

const apiExample = `curl -X POST https://floom-60sec.vercel.app/api/apps/pitch-coach/run \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"pitch":"AI app hosting for agents"}}'`;

const mcpExample = `POST https://floom-60sec.vercel.app/mcp
tool: run_app
arguments: { "slug": "pitch-coach", "inputs": { ... } }`;

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
    <pre className="max-w-full overflow-x-auto rounded-xl border border-[#ded8cc] bg-[#11110f] p-4 text-sm leading-7 text-[#f6f1e7]">
      <code>{children}</code>
    </pre>
  );
}

export default function DocsPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#faf9f5] text-[#11110f]">
      <SiteHeader showProductLinks />

      <article className="mx-auto max-w-4xl px-5 py-14">
        <p className="mb-3 text-sm font-semibold text-emerald-700">
          Floom v0 docs
        </p>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          Local Python function to live app.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-neutral-600">
          Floom v0 publishes a narrow app shape: one stdlib Python function,
          JSON Schema inputs, a browser page, API run, and MCP run.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/tokens"
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            Create token
          </Link>
          <Link
            href="/p/smoke-1777538613152"
            className="rounded-md border border-[#ded8cc] bg-white px-4 py-2 text-sm font-semibold text-neutral-800"
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
          <p className="text-sm text-neutral-500">
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
            MCP clients can discover Floom at <code>/mcp</code> and use{" "}
            <code>run_app</code> for the same app execution path as the browser
            and API.
          </p>
          <CodeBlock>{mcpExample}</CodeBlock>
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
      </article>
    </main>
  );
}
