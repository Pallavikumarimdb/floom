import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";

const SITE_URL = "https://floom.dev";

export const metadata: Metadata = {
  title: "Docs",
  description: "Build, publish, and run Floom v0.1 apps with CLI, MCP, API, secrets, and hash-locked Python dependencies.",
  alternates: { canonical: `${SITE_URL}/docs` },
  openGraph: {
    title: "Floom Docs",
    description: "The exact v0.1 contract for localhost to live and secure apps.",
    url: `${SITE_URL}/docs`,
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
  },
};

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
SLUG="text-demo-$(date +%s)"
npx @floomhq/cli@latest init --name "Text Demo" --slug "$SLUG" --description "Echo text and return a length." --type custom
npx @floomhq/cli@latest deploy --dry-run
npx @floomhq/cli@latest deploy
npx @floomhq/cli@latest run "$SLUG" '{"text":"Hello from Floom"}' --json`;

const apiExample = `curl -X POST https://floom.dev/api/apps/YOUR_PUBLIC_SLUG/run \\
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
arguments: { "key": "invoice_calculator" }

POST https://floom.dev/mcp
tool: run_app
arguments: { "slug": "YOUR_PUBLIC_SLUG", "inputs": { "text": "Hello from Floom" } }`;

const mcpJsonRpcExample = `curl -sS https://floom.dev/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

curl -sS https://floom.dev/mcp \\
  -H 'Authorization: Bearer YOUR_FLOOM_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"auth_status","arguments":{}}}'`;

const requirementsExample = `# requirements.txt
humanize==4.9.0 --hash=sha256:ce284a76d5b1377fd8836733b983bfb0b76f1aa1c090de2566fcf008d7f6ab16

# floom.yaml
dependencies:
  python: ./requirements.txt`;

const requirementsWorkflow = `printf 'humanize==4.9.0\\n' > requirements.in
python -m pip install --upgrade pip pip-tools
python -m piptools compile --generate-hashes --output-file requirements.txt requirements.in
npx @floomhq/cli@latest deploy --dry-run`;

const dependencyBundleExample = `# floom.yaml
name: Word Count
slug: word-count-demo
runtime: python
entrypoint: app.py
handler: run
public: true
input_schema: input.schema.json
output_schema: output.schema.json
dependencies:
  python: ./requirements.txt

# app.py
import humanize

def run(inputs):
    count = len(inputs["text"].split())
    return {"words": count, "summary": humanize.intword(count)}

# requirements.txt
humanize==4.9.0 --hash=sha256:ce284a76d5b1377fd8836733b983bfb0b76f1aa1c090de2566fcf008d7f6ab16

# input.schema.json
{"type":"object","required":["text"],"properties":{"text":{"type":"string"}},"additionalProperties":false}

# output.schema.json
{"type":"object","required":["words","summary"],"properties":{"words":{"type":"integer"},"summary":{"type":"string"}},"additionalProperties":false}`;

const secretBundleExample = `# floom.yaml
name: Secret Check
slug: secret-check-demo
runtime: python
entrypoint: app.py
handler: run
public: false
input_schema: input.schema.json
output_schema: output.schema.json
secrets:
  - OPENAI_API_KEY

# app.py
import os

def run(inputs):
    key = os.environ["OPENAI_API_KEY"]
    return {"configured": bool(key), "label": inputs["label"]}

# input.schema.json
{"type":"object","required":["label"],"properties":{"label":{"type":"string"}},"additionalProperties":false}

# output.schema.json
{"type":"object","required":["configured","label"],"properties":{"configured":{"type":"boolean"},"label":{"type":"string"}},"additionalProperties":false}`;

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
            href="/p/meeting-action-items"
            className="rounded-md border border-[#ded8cc] bg-white px-4 py-2 text-sm font-semibold text-neutral-800"
          >
            Run live demo
          </Link>
        </div>

        <Section title="Fastest launch path">
          <ol className="list-decimal space-y-3 pl-5">
            <li>Run <code>npx @floomhq/cli@latest setup</code>.</li>
            <li>Approve the terminal code in the browser.</li>
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
          <p className="text-sm text-neutral-500">
            The launch origin is <code>https://floom.dev</code>. Run setup
            again if an older local CLI config points somewhere else.
          </p>
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
            TypeScript, Java, FastAPI/OpenAPI, multiple Python files, undeclared or unhashed packages,
            inline schemas in <code>floom.yaml</code>, <code>visibility</code>, <code>actions</code>, and <code>manifest_version</code> are outside the v0.1 contract. Use <code>public: true</code> for public apps; omit <code>public</code> or set it to <code>false</code> for private apps. Secret names and declared dependencies are supported; raw secret values and hardcoded credential-looking strings never belong in source, manifest files, MCP prompts, or generated docs.
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
            <code>get_app_template</code>, publish with{" "}
            <code>publish_app</code>, and use <code>run_app</code> for the same
            app execution path as the browser and API.
          </p>
          <CodeBlock>{mcpExample}</CodeBlock>
          <p>
            Raw JSON-RPC clients use <code>tools/list</code> and{" "}
            <code>tools/call</code>. Publish and private run calls include the
            agent token as a bearer token.
          </p>
          <CodeBlock>{mcpJsonRpcExample}</CodeBlock>
          <p className="text-sm text-neutral-500">
            <code>run_app</code> returns an envelope:{" "}
            <code>{`{ execution_id, status, output, error }`}</code>. Read{" "}
            <code>output</code> for the object that matches the app output
            schema.
          </p>
          <p className="text-sm text-neutral-500">
            <code>validate_manifest</code> checks the manifest and optional
            JSON Schemas. Optional source/file hints return v0.1 runtime
            coaching for unsupported shapes. <code>publish_app</code> performs
            the full publish check with source, required schemas, and declared
            requirements.
          </p>
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
          <CodeBlock>{requirementsExample}</CodeBlock>
          <p>
            Generate hash-locked requirements from a small input file, then run
            the deploy dry run before publishing:
          </p>
          <CodeBlock>{requirementsWorkflow}</CodeBlock>
          <p>
            A complete dependency-backed app has the same one-file shape plus a
            declared <code>requirements.txt</code>:
          </p>
          <CodeBlock>{dependencyBundleExample}</CodeBlock>
          <p>
            A complete secret-backed app declares secret names in{" "}
            <code>floom.yaml</code> and reads values from runtime environment
            variables:
          </p>
          <CodeBlock>{secretBundleExample}</CodeBlock>
          <CodeBlock>{`npx @floomhq/cli@latest setup
printf '%s' "$VALUE" | npx @floomhq/cli@latest secrets set YOUR_PRIVATE_SLUG OPENAI_API_KEY --value-stdin
npx @floomhq/cli@latest secrets list YOUR_PRIVATE_SLUG
npx @floomhq/cli@latest secrets delete YOUR_PRIVATE_SLUG OPENAI_API_KEY`}</CodeBlock>
          <p className="text-sm text-neutral-500">
            MCP can publish and run secret-backed apps after the secret names are
            declared in <code>floom.yaml</code>. Replace hardcoded tokens, API
            keys, passwords, private keys, and credential-looking strings with
            declared secret names. Secret values are set through the CLI
            or REST <code>/api/apps/:slug/secrets</code> flow;
            never collect raw values in MCP tool arguments.
          </p>
          <p className="text-sm text-neutral-500">
            Google OAuth provider handoff is fully branded only after Supabase
            Auth uses the configured custom auth domain. Until that provider
            setting is live, Google may display the Supabase project callback
            host before returning to <code>https://floom.dev/auth/callback</code>.
          </p>
          <p className="text-sm text-neutral-500">
            FastAPI/OpenAPI, arbitrary HTTP servers, TypeScript apps, Java apps,
            background workers, and full repo hosting remain later milestones.
          </p>
        </Section>

        <Section title="What 'secure' means">
          <p>
            Public apps with declared secrets still run anonymously in v0.1. Secret values are injected only as runtime environment variables and never appear in source, manifest files, logs, MCP output, or <code>app_versions</code>; output redaction applies to schema fields marked <code>secret: true</code>, and the same per-caller public run rate limits still apply.
          </p>
        </Section>

        <Section title="Limits and exclusions">
          <ul className="list-disc space-y-3 pl-5">
            <li>v0.1 is optimized for short function-style apps.</li>
            <li>Public runs are rate-limited.</li>
            <li>Output fields marked as secret in output schema are redacted.</li>
            <li><code>npx @floomhq/cli@latest setup</code> creates a token through browser authorization; manually created raw agent tokens are shown once and stored only as hashes.</li>
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
      <FloomFooter />
    </main>
  );
}
