import type { Metadata } from "next";
import { IC, CodeBlock, Section } from "@/components/docs/DocsPrimitives";

export const metadata: Metadata = {
  title: "Secrets",
  description: "Encrypted secrets for Floom apps: set via CLI or REST, injected as env vars at run time.",
  alternates: { canonical: "https://floom.dev/docs/secrets" },
};

const secretsExample = `# Set a secret via stdin (never echoed to shell history)
npx @floomhq/cli@latest secrets set my-app OPENAI_API_KEY --value-stdin`;

const perRunnerExample = `secrets:
  - name: GEMINI_API_KEY          # scope: per_runner is the default`;

const sharedExample = `secrets:
  - name: GEMINI_API_KEY
    scope: shared                  # creator's key injected for every runner`;

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
          <li>Names must be uppercase letters, digits, and underscores, e.g. <IC>OPENAI_API_KEY</IC>.</li>
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
          <IC>DELETE /api/apps/:slug/secrets</IC> with the secret name in the request body:
        </p>
        <CodeBlock label="Delete a secret">
          {`curl -X DELETE https://floom.dev/api/apps/<slug>/secrets \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"GMAIL_USER"}'`}
        </CodeBlock>
      </Section>

      <Section id="scopes" title="Secret scopes: per_runner (default) vs shared">
        <p className="mb-4">
          Every secret has a <IC>scope</IC> that controls whose value is injected at run time.
        </p>
        <p className="font-semibold text-[#11110f] mb-1">per_runner (default)</p>
        <p className="mb-3 text-neutral-600">
          Each user who runs the app provides their own value. Their value is encrypted and isolated from other users. This is the safe default and requires no explicit declaration.
        </p>
        <CodeBlock label="floom.yaml: per_runner (default)">{perRunnerExample}</CodeBlock>
        <p className="font-semibold text-[#11110f] mb-1 mt-6">shared (demo-subsidy mode)</p>
        <p className="mb-3 text-neutral-600">
          Your value is injected for every caller of the app, including anonymous visitors. Use this when you want to run a public demo and absorb the API cost yourself.
        </p>
        <CodeBlock label="floom.yaml: shared scope">{sharedExample}</CodeBlock>
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-800 mb-1">Cost warning</p>
          <p className="text-amber-700">
            With <IC>scope: shared</IC>, your API keys are charged for every run by every caller — including anonymous visitors. Real spending happens against your quota at whatever rate strangers use the app. Always pair shared secrets with rate limits. If you are unsure, leave the default <IC>per_runner</IC>: each runner brings their own keys and your costs stay your own.
          </p>
        </div>
        <p className="mt-4 text-neutral-600">
          When you run <IC>floom deploy</IC> with a shared secret, the CLI prints a plain-text warning and asks you to confirm. In non-interactive (CI) environments, pass <IC>--accept-shared-secrets</IC> to proceed.
        </p>
      </Section>

      <Section id="rules" title="Rules">
        <ul className="list-disc space-y-2 pl-5">
          <li>Secret values are never visible in logs or the browser UI.</li>
          <li>Values are scoped to a single app slug, not shared across apps.</li>
          <li>Declaring a secret name in <IC>floom.yaml</IC> is required; the value must be set separately before the first run that needs it.</li>
          <li><IC>scope: per_runner</IC> is the default. Use <IC>scope: shared</IC> only for demo apps you want to subsidize.</li>
        </ul>
      </Section>
    </>
  );
}
