import type { Metadata } from "next";
import { IC, CodeBlock, Section } from "@/components/docs/DocsPrimitives";

export const metadata: Metadata = {
  title: "Integrations",
  description: "Connect Gmail, Slack, GitHub, Notion, and 70+ services to your Floom apps. Declare them in your manifest; Floom injects credentials at run time.",
  alternates: { canonical: "https://floom.dev/docs/integrations" },
  openGraph: {
    title: "Integrations · Floom",
    description: "Connect Gmail, Slack, GitHub, Notion, and 70+ services to your Floom apps.",
    url: "https://floom.dev/docs/integrations",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Integrations · Floom",
    description: "Connect Gmail, Slack, GitHub, Notion, and 70+ services to your Floom apps.",
  },
};

const declareExample = `# Single integration:
integrations: gmail

# Multiple integrations:
integrations:
  - gmail
  - slack`;

const useExample = `import os
from composio import ComposioToolSet, Action

def run(inputs):
    toolset = ComposioToolSet(
        entity_id=os.environ["COMPOSIO_GMAIL_CONNECTION_ID"]
    )
    result = toolset.execute_action(
        action=Action.GMAIL_SEND_EMAIL,
        params={
            "recipient_email": inputs["to"],
            "subject": inputs["subject"],
            "body": inputs["body"],
        },
    )
    return {"sent": True, "message_id": result.get("messageId")}`;

const SERVICES = [
  ["Email / Calendar", "gmail, outlook, googlecalendar, cal, calendly"],
  ["Chat", "slack, discord, microsoft_teams, whatsapp, zoom, intercom"],
  ["Productivity", "notion, linear, asana, jira, todoist, trello, airtable"],
  ["Files", "googledrive, googledocs, googlesheets, dropbox, box"],
  ["Dev", "github, gitlab, bitbucket, sentry, supabase, figma"],
  ["CRM", "hubspot, salesforce, attio, zoho"],
  ["Finance", "stripe, square, quickbooks"],
];

export default function IntegrationsPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Connections</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          Integrations
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Floom apps can use connections you have already authorized — Gmail, Slack, GitHub, Notion, and 70+ more services. Declare them in your manifest and Floom injects the credentials at run time.
        </p>
      </div>

      <Section id="declare" title="Add an integration to your app">
        <p>
          In <IC>floom.yaml</IC>, add an <IC>integrations:</IC> field with one or more service slugs:
        </p>
        <CodeBlock label="floom.yaml">{declareExample}</CodeBlock>
        <p className="text-sm text-neutral-600">
          Then connect your account once at <a href="/connections" className="underline">floom.dev/connections</a> via OAuth. No passwords or tokens to copy — Floom handles the rest.
        </p>
      </Section>

      <Section id="runtime" title="What happens at run time">
        <p>
          When a user runs your app, Floom checks if they have connected each declared service via <IC>/connections</IC>:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Connected:</strong> <IC>COMPOSIO_&lt;SERVICE&gt;_CONNECTION_ID</IC> is injected as an env var. Single-service apps also get the generic <IC>COMPOSIO_CONNECTION_ID</IC>.</li>
          <li><strong>Not connected:</strong> the run returns <IC>HTTP 412 missing_integration</IC> with a link to <IC>/connections</IC>. Anon runners get a sign-in prompt first.</li>
        </ul>
      </Section>

      <Section id="use" title="Use the connection in your code">
        <CodeBlock label="app.py: send Gmail using the injected connection">{useExample}</CodeBlock>
        <p className="text-sm text-neutral-600">
          The <IC>COMPOSIO_*_CONNECTION_ID</IC> env vars are only present when the runner has an active connection for that service. Your code can check for their presence to handle the unauthenticated case gracefully.
        </p>
      </Section>

      <Section id="services" title="Available services">
        <p>
          77 managed-auth providers available. A selection by category:
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#ded8cc]">
                <th className="text-left py-2 pr-6 font-semibold text-[#11110f]">Category</th>
                <th className="text-left py-2 font-semibold text-[#11110f]">Service slugs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ede6]">
              {SERVICES.map(([category, slugs]) => (
                <tr key={category}>
                  <td className="py-2 pr-6 text-neutral-600 font-medium whitespace-nowrap">{category}</td>
                  <td className="py-2 font-mono text-xs text-[#2a2520] break-all">{slugs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-neutral-500">
          Full list and OAuth setup instructions at <a href="/connections" className="underline">floom.dev/connections</a>.
        </p>
      </Section>

      <Section id="errors" title="Error reference">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#ded8cc]">
                <th className="text-left py-2 pr-6 font-semibold text-[#11110f]">Error</th>
                <th className="text-left py-2 font-semibold text-[#11110f]">Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ede6]">
              <tr>
                <td className="py-2 pr-6 font-mono text-[#2a2520]">412 missing_integration</td>
                <td className="py-2 text-neutral-600">Runner has not connected the required service. Direct them to <IC>/connections</IC>.</td>
              </tr>
              <tr>
                <td className="py-2 pr-6 font-mono text-[#2a2520]">412 missing_integration (sign-in)</td>
                <td className="py-2 text-neutral-600">Caller is anonymous. Redirect to <IC>/login</IC> first, then they can connect and retry.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
