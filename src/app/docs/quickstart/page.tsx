import type { Metadata } from "next";
import { IC, CodeBlock, Section } from "@/components/docs/DocsPrimitives";

export const metadata: Metadata = {
  title: "Quick start",
  description: "Ship a Floom app in under 60 seconds. Create a manifest, write your handler, deploy with one command.",
  alternates: { canonical: "https://floom.dev/docs/quickstart" },
  openGraph: {
    title: "Quick start · Floom",
    description: "Ship a Floom app in under 60 seconds. Create a manifest, write your handler, deploy with one command.",
    url: "https://floom.dev/docs/quickstart",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Quick start · Floom",
    description: "Ship a Floom app in under 60 seconds. Create a manifest, write your handler, deploy with one command.",
  },
};

const launchCommand = `# 1. Authenticate (once per machine)
npx @floomhq/cli@latest setup

# 2. Scaffold a new app
mkdir my-floom-app && cd my-floom-app
npx @floomhq/cli@latest init --name "My App" --slug my-app --type custom

# 3. Deploy
npx @floomhq/cli@latest deploy

# 4. Run it
npx @floomhq/cli@latest run my-app '{"text":"hello"}' --json`;

export default function QuickstartPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Get started</p>
        <h1 id="quickstart" className="text-4xl font-black tracking-tight text-[#11110f]">
          Quick start
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Three minutes from zero to a running app. You need Node.js installed for the CLI.
        </p>
      </div>

      <Section id="setup" title="1. Authenticate">
        <p>
          Run <IC>npx @floomhq/cli@latest setup</IC> once per machine. It opens a browser page to link your Floom account. The token is saved to <IC>~/.config/floom/token</IC>.
        </p>
        <p>
          In CI, set the <IC>FLOOM_TOKEN</IC> env var instead; no setup command needed.
        </p>
      </Section>

      <Section id="init" title="2. Scaffold">
        <p>
          <IC>floom init</IC> generates three files in the current directory:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><IC>floom.yaml</IC>: the app manifest</li>
          <li><IC>app.py</IC>: a minimal Python app</li>
          <li><IC>requirements.txt</IC>: empty, ready to fill</li>
        </ul>
      </Section>

      <Section id="deploy" title="3. Deploy">
        <p>
          <IC>floom deploy</IC> bundles the current directory into a <IC>.tar.gz</IC>, uploads it, and registers the app under your account. The slug from <IC>floom.yaml</IC> becomes the app ID.
        </p>
        <p>
          After deploy, the app is live at <IC>https://floom.dev/p/your-slug</IC> with a browser UI, REST endpoint, and MCP tool. No extra config.
        </p>
      </Section>

      <Section id="run" title="4. Run it">
        <p>
          Use the CLI or the browser UI. The CLI returns JSON:
        </p>
        <CodeBlock label="Terminal: full four-step flow">{launchCommand}</CodeBlock>
      </Section>

      <Section id="what-is-a-floom-app" title="What is a Floom app?">
        <p>
          A Floom app is a directory with a <IC>floom.yaml</IC> at the root. The manifest declares the slug, the run command, optional input/output schemas, and any secret names the app needs.
        </p>
        <p>
          When you deploy, Floom bundles the directory, stores it, and registers the metadata. When someone runs the app, Floom spins up a stock E2B sandbox, extracts the bundle, installs declared dependencies, and executes the command.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Each run is isolated: a fresh sandbox, no state from previous runs.</li>
          <li>Inputs arrive via <IC>stdin</IC> and the <IC>FLOOM_INPUTS</IC> env var as JSON.</li>
          <li>Output is whatever the command prints to stdout, optionally validated against a schema.</li>
          <li>Python and Node.js both work. Python is the primary target.</li>
        </ul>
        <p className="text-sm text-neutral-500">
          Floom is a thin wrapper. It does not rewrite your code or proxy HTTP traffic. The E2B sandbox is the execution environment; see{" "}
          <a className="underline" href="https://e2b.dev/docs" target="_blank" rel="noreferrer">e2b.dev/docs</a>{" "}
          for available system packages and preinstalled tools.
        </p>
      </Section>
    </>
  );
}
