import type { Metadata } from "next";
import Link from "next/link";
import { IC, CodeBlock, Section } from "@/components/docs/DocsPrimitives";

export const metadata: Metadata = {
  title: "Authentication",
  description: "Three Floom auth flows: browser sign-in, CLI device flow, and agent tokens with scopes.",
  alternates: { canonical: "https://floom.dev/docs/auth" },
};

const setupExample = `# Opens a browser page to authorise your CLI. Run once per machine.
npx @floomhq/cli@latest setup

# Token is saved to ~/.config/floom/token
# Or export it manually:
export FLOOM_TOKEN=<your-agent-token>`;

export default function AuthPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Build</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          Authentication
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Three ways to authenticate with Floom.
        </p>
      </div>

      <Section id="browser-sign-in" title="1. Browser sign-in">
        <p>
          Google OAuth at <Link href="/login" className="underline">floom.dev/login</Link>. Creates a session for the browser UI. No API access; use agent tokens for programmatic calls.
        </p>
      </Section>

      <Section id="device-flow" title="2. CLI device flow">
        <p>
          Runs when you execute <IC>floom setup</IC>. Opens a browser confirmation page; the CLI polls until you approve. The resulting token is saved to <IC>~/.config/floom/token</IC>.
        </p>
        <CodeBlock>{setupExample}</CodeBlock>
      </Section>

      <Section id="agent-tokens" title="3. Agent tokens">
        <p>
          Create at <Link href="/tokens" className="underline">floom.dev/tokens</Link>. Use in the <IC>Authorization: Bearer</IC> header for REST calls, or as the <IC>FLOOM_TOKEN</IC> env var for the CLI.
        </p>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#ded8cc]">
                <th className="text-left py-2 pr-4 font-semibold text-[#11110f]">Scope</th>
                <th className="text-left py-2 font-semibold text-[#11110f]">Allows</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ede6]">
              {[
                ["read", "List apps, fetch metadata, view executions."],
                ["run", "Run any owned private app. Run public apps (no auth needed for those)."],
                ["publish", "Deploy apps, set secrets, delete secrets."],
              ].map(([scope, desc]) => (
                <tr key={scope}>
                  <td className="py-2 pr-4 font-mono text-sm text-[#2a2520]">{scope}</td>
                  <td className="py-2 text-neutral-600">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-neutral-500 mt-3">
          Tokens do not expire. Revoke them from the tokens page at any time.
        </p>
      </Section>
    </>
  );
}
