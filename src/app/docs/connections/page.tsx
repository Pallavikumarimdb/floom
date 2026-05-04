import type { Metadata } from "next";
import { IC, CodeBlock, Section } from "@/components/docs/DocsPrimitives";

export const metadata: Metadata = {
  title: "Connections",
  description: "Connect Gmail, Slack, GitHub, Notion, Linear, and 70+ more services to your Floom apps via OAuth — no credentials to copy.",
  alternates: { canonical: "https://floom.dev/docs/connections" },
};

const integrationsExample = `# 1. Connect Gmail in your Floom settings (one-time browser OAuth)
# 2. Declare the integration in your manifest — no manual copy step:
#    integrations: gmail

# 3. Use it in your Python app — auto-injected as env vars at run time:
import os
from composio import ComposioToolSet, Action

toolset = ComposioToolSet(entity_id=os.environ["COMPOSIO_CONNECTION_ID"])
result = toolset.execute_action(
    action=Action.GMAIL_SEND_EMAIL,
    params={"recipient_email": "...", "subject": "...", "body": "..."},
)`;

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
          Connections
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Apps that need to call external services can use Floom Connections. Connect your accounts once via OAuth in Settings, then declare the service in your manifest — Floom injects the credentials automatically at run time.
        </p>
      </div>

      <Section id="usage" title="Usage in Python">
        <CodeBlock label="Python app using Gmail">{integrationsExample}</CodeBlock>
        <p className="text-sm text-neutral-600 mt-3">
          After connecting Gmail, any Floom app declaring <code className="font-mono text-sm">integrations: gmail</code> in its manifest will use your connection automatically. No passwords or connection IDs to copy — Floom injects <code className="font-mono text-sm">COMPOSIO_CONNECTION_ID</code> from your active connection at run time.
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
          OAuth tokens are proxied server-side; your credentials are never stored in the app bundle or visible in logs.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Rate limit on the connections proxy: 60 calls per minute per token.</li>
          <li>Connections are scoped to your Floom account, not shared across apps unless you use the same connection ID secret.</li>
          <li>Revoke access at any time from your Floom settings.</li>
        </ul>
      </Section>
    </>
  );
}
