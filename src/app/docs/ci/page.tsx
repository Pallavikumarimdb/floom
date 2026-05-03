import type { Metadata } from "next";
import { IC, CodeBlock, Section } from "@/components/docs/DocsPrimitives";

export const metadata: Metadata = {
  title: "CI / automation",
  description: "Deploy and run Floom apps from GitHub Actions and CI pipelines.",
  alternates: { canonical: "https://floom.dev/docs/ci" },
};

const ciExample = `# GitHub Actions
- name: Deploy Floom app
  env:
    FLOOM_TOKEN: \${{ secrets.FLOOM_TOKEN }}
  run: |
    npx @floomhq/cli@latest deploy

# Run and capture JSON output
OUTPUT=$(npx @floomhq/cli@latest run my-app '{"text":"test"}' --json)
echo "$OUTPUT" | jq '.output'`;

const publishApiExample = `# Programmatic deploy without the CLI
curl -X POST https://floom.dev/api/apps/publish \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -F 'bundle=@./my-app.tar.gz' \\
  -F 'meta={"slug":"my-app","public":true}'`;

export default function CiPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Run</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          CI / automation
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Use <IC>FLOOM_TOKEN</IC> as a repository secret. The CLI reads it automatically; no <IC>floom setup</IC> needed in CI.
        </p>
      </div>

      <Section id="github-actions" title="GitHub Actions">
        <CodeBlock label="GitHub Actions">{ciExample}</CodeBlock>
        <p>
          The <IC>--json</IC> flag makes <IC>floom run</IC> print a machine-readable envelope. Exit code: 0 on success, 1 on app failure, 2 on network or auth error.
        </p>
      </Section>

      <Section id="publish-api" title="Programmatic deploy (no CLI)">
        <p>
          Use <IC>POST /api/apps/publish</IC> with a <IC>multipart/form-data</IC> body containing the tarball and a <IC>meta</IC> JSON field.
        </p>
        <CodeBlock label="REST publish">{publishApiExample}</CodeBlock>
        <p className="text-sm text-neutral-500">
          Requires an agent token with <IC>publish</IC> scope.
        </p>
      </Section>
    </>
  );
}
