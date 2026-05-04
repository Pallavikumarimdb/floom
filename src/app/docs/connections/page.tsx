import type { Metadata } from "next";
import { IC, CodeBlock, Section } from "@/components/docs/DocsPrimitives";

export const metadata: Metadata = {
  title: "Connections (Composio)",
  description: "77 managed-auth providers for Floom apps: Gmail, Slack, GitHub, Notion, Linear, and more via Composio.",
  alternates: { canonical: "https://floom.dev/docs/connections" },
};

const composioExample = `# 1. Connect Gmail in your Floom settings (one-time browser OAuth)
# 2. Set the connection ID as an app secret:
npx @floomhq/cli@latest secrets set my-app COMPOSIO_CONNECTION_ID --value-stdin

# 3. Use it in your Python app — injected as an env var at runtime:
import os
from composio import ComposioToolSet

toolset = ComposioToolSet(entity_id=os.environ["COMPOSIO_CONNECTION_ID"])
tools = toolset.get_tools(actions=["GMAIL_SEND_EMAIL"])`;

const PROVIDERS = [
  "Gmail", "Slack", "GitHub", "Notion", "Linear", "Google Calendar",
  "HubSpot", "Stripe", "Salesforce", "Asana", "Airtable", "Discord",
  "Zoom", "Trello", "Figma", "Mailchimp", "Outlook", "Google Drive",
  "Google Docs", "Google Sheets", "Calendly", "Sentry", "Supabase",
];

export default function ConnectionsPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Connections</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          Connections (Composio)
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Apps that need to call external services can use Floom Connections, powered by Composio. Connect your accounts once via OAuth in Settings, then reference the connection in your app as an env var.
        </p>
      </div>

      <Section id="usage" title="Usage in Python">
        <CodeBlock label="Python app using Gmail">{composioExample}</CodeBlock>
        <p className="text-sm text-neutral-600 mt-3">
          Today you set your connection ID manually as an app secret. Auto-injection — where Floom reads your active connection at run time so apps don't need a manual copy step — is on the roadmap for v0.5.
        </p>
      </Section>

      <Section id="providers" title="Available providers">
        <p>
          77 managed-auth providers available. A selection:
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {PROVIDERS.map((p) => (
            <span key={p} className="rounded-full border border-[#e0dbd0] bg-[#f5f4ed] px-3 py-1 text-xs font-medium text-neutral-700">
              {p}
            </span>
          ))}
          <span className="rounded-full border border-[#e0dbd0] bg-[#f5f4ed] px-3 py-1 text-xs font-medium text-neutral-500 italic">
            + 54 more
          </span>
        </div>
        <p className="mt-3 text-sm text-neutral-500">
          See the full list at <a href="/connections" className="underline">floom.dev/connections</a>.
        </p>
      </Section>

      <Section id="security" title="Security">
        <p>
          Composio proxies OAuth tokens; your credentials are never stored in the app bundle or visible in logs.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Rate limit on the Composio proxy: 60 calls per minute per token.</li>
          <li>Connections are scoped to your Floom account, not shared across apps unless you use the same connection ID secret.</li>
          <li>Revoke access at any time from your Floom settings.</li>
        </ul>
      </Section>
    </>
  );
}
