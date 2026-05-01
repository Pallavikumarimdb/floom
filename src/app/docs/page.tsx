import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";

const manifestExample = `name: Meeting Action Items
slug: meeting-action-items
runtime: python
entrypoint: app.py
handler: run
public: true
input_schema: input.schema.json
output_schema: output.schema.json`;

const launchCommand = `npx @floomhq/cli@latest setup
mkdir my-floom-app && cd my-floom-app
npx @floomhq/cli@latest init --name "Meeting Notes" --slug meeting-notes-demo --description "Extract action items from meeting notes." --type custom
npx @floomhq/cli@latest deploy --dry-run
npx @floomhq/cli@latest deploy
npx @floomhq/cli@latest run meeting-notes-demo '{"text":"Action: Sarah sends launch notes by Friday"}' --json`;

const apiExample = `curl -X POST https://floom.dev/api/apps/meeting-action-items/run \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"transcript":"Action: Sarah sends launch notes by Friday"}}'`;

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
arguments: { "key": "invoice_calculator" }

POST https://floom.dev/mcp
tool: run_app
arguments: { "slug": "meeting-action-items", "inputs": { ... } }`;

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
    <main className="min-h-screen overflow-x-hidden bg-[#faf9f5] text-[#11110f]">
      <SiteHeader />

      <article className="mx-auto max-w-4xl px-5 py-14">
        <p className="mb-3 text-sm font-semibold text-emerald-700">
          Floom v0.1 docs
        </p>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          Local Python function to live app.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-neutral-600">
          Floom v0.1 publishes a narrow app shape: one Python function, optional exact-pinned hash-locked dependencies, encrypted owner-managed secrets, JSON Schema inputs, a browser page, API run, and MCP run.
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
            <li>Publish with the CLI commands below.</li>
            <li>
              Open the returned <code>/p/:slug</code> URL and run the app.
            </li>
          </ol>
          <CodeBlock>{launchCommand}</CodeBlock>
        </Section>

        <Section title="v0.1 app contract">
          <ul className="list-disc space-y-3 pl-5">
            <li>Runtime: Python.</li>
            <li>Entrypoint: one top-level `.py` file.</li>
            <li>Handler: one function that receives a JSON object and returns JSON.</li>
            <li>Inputs: JSON Schema rendered into a browser form.</li>
            <li>Outputs: JSON object displayed in the app page.</li>
            <li>Dependencies: Python standard library plus exact-pinned, hash-locked <code>requirements.txt</code> when declared.</li>
            <li>Config: only the keys shown in the manifest example are active in v0.1.</li>
          </ul>
          <p className="text-sm text-neutral-500">
            TypeScript, FastAPI/OpenAPI, multiple Python files, custom packages,
            inline schemas in <code>floom.yaml</code>, <code>visibility</code>, <code>actions</code>, and <code>manifest_version</code> are outside the v0.1 contract. Secret names and declared dependencies are supported; raw secret values never belong in source or manifest files.
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
          <p>
            The same endpoint works from curl, n8n, Zapier, or any HTTP client.
            For private apps, add the bearer token header.
          </p>
          <CodeBlock>{privateApiExample}</CodeBlock>
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

        <Section title="MCP app templates">
          <p>
            Floom serves copy-paste v0.1-safe bundles for agents that need a fast,
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
          <p className="text-sm text-neutral-500">
            Every template uses one Python file and includes
            <code> floom.yaml</code>, <code>app.py</code>,{" "}
            <code>input.schema.json</code>, and{" "}
            <code>output.schema.json</code>. Before publishing a template, change
            the slug to a unique value.
          </p>
        </Section>

        <Section title="Dependencies and secrets">
          <p>
            v0.1 includes exact-pinned, hash-locked dependencies and owner-managed encrypted app secrets without changing Floom into broad app hosting.
          </p>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Exact-pinned, hash-locked Python dependency installation from{" "}
              <code>requirements.txt</code>.
            </li>
            <li>
              Secret names in <code>floom.yaml</code>, never raw secret values.
            </li>
            <li>Owner-scoped encrypted storage and E2B runtime injection.</li>
          </ul>
          <p className="text-sm text-neutral-500">
            FastAPI/OpenAPI, arbitrary HTTP servers, TypeScript apps,
            background workers, and full repo hosting remain later milestones.
          </p>
        </Section>

        <Section title="Limits and exclusions">
          <ul className="list-disc space-y-3 pl-5">
            <li>v0.1 is optimized for short function-style apps.</li>
            <li>Public runs are rate-limited.</li>
            <li>Output fields marked as secret in output schema are redacted.</li>
            <li>Raw agent tokens are shown once and are stored only as hashes.</li>
            <li>No teams, orgs, per-user share links, app-owned OAuth providers, or billing in v0.1.</li>
          </ul>
        </Section>

        <Section title="Auth and email redirect">
          <p>
            Signup emails are sent by Supabase Auth. The confirmation link must
            return to `https://floom.dev/auth/callback?next=/tokens`.
          </p>
          <p>
            If an email sends you to localhost, update the Supabase Auth Site URL
            to `https://floom.dev` and add `https://floom.dev/auth/callback` to redirect URLs.
          </p>
        </Section>
      </article>
    </main>
  );
}
