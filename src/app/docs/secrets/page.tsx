import type { Metadata } from "next";
import { IC, CodeBlock, Section } from "@/components/docs/DocsPrimitives";

export const metadata: Metadata = {
  title: "Secrets",
  description: "Encrypted secrets for Floom apps — set via CLI or REST, injected as env vars at run time.",
  alternates: { canonical: "https://floom.dev/docs/secrets" },
};

const secretsExample = `# Set a secret via stdin (never echoed to shell history)
npx @floomhq/cli@latest secrets set my-app OPENAI_API_KEY --value-stdin`;

const secretsRest = `# REST equivalent
curl -X PUT https://floom.dev/api/apps/my-app/secrets \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"OPENAI_API_KEY","value":"sk-..."}'`;

export default function SecretsPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Build</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          Secrets
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Secrets are encrypted at rest. Only the names go in <IC>floom.yaml</IC>; the values are set separately and injected as environment variables at run time.
        </p>
      </div>

      <Section id="cli" title="Set via CLI">
        <CodeBlock label="Terminal">{secretsExample}</CodeBlock>
        <ul className="list-disc space-y-2 pl-5">
          <li>Use <IC>--value-stdin</IC> to keep the value out of shell history.</li>
          <li>Names must be uppercase letters, digits, and underscores — e.g. <IC>OPENAI_API_KEY</IC>.</li>
          <li>Undeclared secrets are never injected, even if the values exist.</li>
        </ul>
      </Section>

      <Section id="rest" title="Set via REST">
        <CodeBlock label="REST API">{secretsRest}</CodeBlock>
        <p>
          Requires an agent token with <IC>publish</IC> scope.
        </p>
      </Section>

      <Section id="delete" title="Delete a secret">
        <p>
          <IC>DELETE /api/apps/:slug/secrets/:name</IC> with an agent token that has <IC>publish</IC> scope. There is no CLI shortcut yet.
        </p>
      </Section>

      <Section id="rules" title="Rules">
        <ul className="list-disc space-y-2 pl-5">
          <li>Secret values are never visible in logs or the browser UI.</li>
          <li>Values are scoped to a single app slug — not shared across apps.</li>
          <li>Declaring a secret name in <IC>floom.yaml</IC> is required; the value must be set separately before the first run that needs it.</li>
        </ul>
      </Section>
    </>
  );
}
