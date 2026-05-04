import type { Metadata } from "next";
import { IC, CodeBlock, Section } from "@/components/docs/DocsPrimitives";

export const metadata: Metadata = {
  title: "Manifest reference",
  description: "Reference for Floom app manifests. Inputs, outputs, secrets, runtime modes — everything you can declare in floom.yaml.",
  alternates: { canonical: "https://floom.dev/docs/manifest" },
  openGraph: {
    title: "Manifest reference · Floom",
    description: "Reference for Floom app manifests. Inputs, outputs, secrets, runtime modes — everything you can declare in floom.yaml.",
    url: "https://floom.dev/docs/manifest",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Manifest reference · Floom",
    description: "Reference for Floom app manifests. Inputs, outputs, secrets, runtime modes — everything you can declare in floom.yaml.",
  },
};

const manifestFull = `slug: my-app
# The command to run. Auto-detected from app.py / index.js if omitted.
command: python app.py
# Inline JSON Schema for inputs (preferred — no separate file needed).
input_schema:
  type: object
  required: [text]
  properties:
    text:
      type: string
      title: Input text
# Inline JSON Schema for outputs.
output_schema:
  type: object
  required: [result]
  properties:
    result:
      type: string
      title: Result
# Make the app publicly runnable without auth.
public: true
# Secret names to inject as env vars at run time. Values are set separately.
# Default scope is per_runner: each runner provides their own value.
# Use scope: shared to inject your own key for every caller (demo-subsidy mode).
secrets:
  - OPENAI_API_KEY                     # scope: per_runner (default)
  - name: GEMINI_API_KEY
    scope: shared                       # creator's key injected for every runner
# Composio integrations: auto-inject the runner's active connection at run time.
# composio: gmail
# composio:
#   - gmail
#   - slack
# Optional: additional pip deps installed before the run command.
# dependencies:
#   python: ./requirements.txt --require-hashes
# Optional: paths to skip when building the bundle.
# bundle_exclude:
#   - fixtures/large-dataset.csv`;

const legacyManifest = `# Legacy v0.1 shape — still works, no migration needed
name: Meeting Action Items
slug: meeting-action-items
runtime: python
entrypoint: app.py
handler: run
public: true
input_schema: ./input.schema.json   # path form still supported
output_schema: ./output.schema.json
dependencies:
  python: ./requirements.txt`;

const pathRefExample = `# Path-reference form (escape hatch for very large or shared schemas)
input_schema: ./input.schema.json
output_schema: ./output.schema.json`;

const composioExample = `# Single toolkit (shorthand):
composio: gmail

# Multiple toolkits:
composio:
  - gmail
  - slack

# In your Python app:
import os
from composio import ComposioToolSet, Action

toolset = ComposioToolSet(entity_id=os.environ["COMPOSIO_CONNECTION_ID"])
result = toolset.execute_action(
    action=Action.GMAIL_SEND_EMAIL,
    params={"recipient_email": "...", "subject": "...", "body": "..."},
)`;

const FIELDS = [
  ["slug", "Yes", "URL-safe identifier. Used in /p/:slug, API, and MCP calls."],
  ["name", "No", "Display name shown in the browser UI and app cards. Defaults to slug if omitted."],
  ["command", "No", "Shell command to run the app. Auto-detected from app.py or index.js if omitted."],
  ["input_schema", "No", "Inline JSON Schema object or relative path to a .json file. Floom validates inputs before running. Inline form is the default; path form is an escape hatch for very large schemas."],
  ["output_schema", "No", "Inline JSON Schema object or relative path to a .json file. Floom validates stdout output against this. Same two-form support as input_schema."],
  ["public", "No", "true = anyone can run without auth. Default: false."],
  ["secrets", "No", "List of secret names (or objects with name + optional scope). Values set via CLI or REST, injected as env vars at run time. Default scope: per_runner. Use scope: shared to inject your own key for every caller."],
  ["composio", "No", "Toolkit slug or list of slugs (e.g. gmail, slack). Floom auto-injects COMPOSIO_CONNECTION_ID from the runner's active connection at run time. No manual copy step needed."],
  ["dependencies.python", "No", "Path to requirements.txt, optionally with --require-hashes."],
  ["bundle_exclude", "No", "List of paths/globs to skip when building the bundle."],
];

export default function ManifestPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Build</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          Manifest reference
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          The <IC>floom.yaml</IC> lives at the root of your app directory. Only <IC>slug</IC> is required.
        </p>
      </div>

      <Section id="all-fields" title="All fields">
        <CodeBlock label="floom.yaml: all fields">{manifestFull}</CodeBlock>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#ded8cc]">
                <th className="text-left py-2 pr-4 font-semibold text-[#11110f]">Field</th>
                <th className="text-left py-2 pr-4 font-semibold text-[#11110f]">Required</th>
                <th className="text-left py-2 font-semibold text-[#11110f]">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ede6]">
              {FIELDS.map(([field, req, desc]) => (
                <tr key={field}>
                  <td className="py-2 pr-4 font-mono text-sm text-[#2a2520]">{field}</td>
                  <td className="py-2 pr-4 text-neutral-500">{req}</td>
                  <td className="py-2 text-neutral-600">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="schemas" title="Inline vs. file schemas">
        <p>
          <IC>input_schema</IC> and <IC>output_schema</IC> accept two forms. The inline object form (default) keeps everything in one file:
        </p>
        <CodeBlock label="floom.yaml: inline schema (default)">{`input_schema:
  type: object
  required: [text]
  properties:
    text: { type: string, title: Input text }

output_schema:
  type: object
  required: [result]
  properties:
    result: { type: string, title: Result }`}</CodeBlock>
        <p className="mt-3">
          The path-reference form is an escape hatch for very large schemas or shared schemas referenced across multiple apps:
        </p>
        <CodeBlock label="floom.yaml: path reference (escape hatch)">{pathRefExample}</CodeBlock>
        <p className="mt-3 text-sm text-neutral-600">
          Both forms are validated as JSON Schema at deploy time. Existing apps using path references deploy unchanged.
        </p>
      </Section>

      <Section id="composio" title="Composio integrations">
        <p>
          Declare external service integrations the app needs. At run time Floom looks up the runner&rsquo;s active connection for each toolkit and injects <IC>COMPOSIO_CONNECTION_ID</IC> (and <IC>COMPOSIO_&lt;TOOLKIT&gt;_CONNECTION_ID</IC> for multi-toolkit apps) automatically. No manual copy step required.
        </p>
        <CodeBlock label="floom.yaml: composio field">{composioExample}</CodeBlock>
        <p className="text-sm text-neutral-600 mt-3">
          If the runner has not connected the required toolkit, the run returns HTTP 412 with a link to <IC>/connections</IC>. Anon runners get a sign-in prompt instead.
        </p>
      </Section>

      <Section id="legacy" title="Legacy v0.1 format">
        <p>
          Manifests using <IC>runtime</IC>, <IC>entrypoint</IC>, and <IC>handler</IC> still deploy and run unchanged. No migration needed.
        </p>
        <CodeBlock label="Legacy format (still supported)">{legacyManifest}</CodeBlock>
      </Section>
    </>
  );
}
