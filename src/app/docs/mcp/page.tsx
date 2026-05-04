import type { Metadata } from "next";
import { IC, CodeBlock, Section } from "@/components/docs/DocsPrimitives";

export const metadata: Metadata = {
  title: "MCP for AI agents",
  description: "Floom MCP server: all 15 tools for AI agents. Claude Desktop, Cursor, agent tokens.",
  alternates: { canonical: "https://floom.dev/docs/mcp" },
};

// Claude Desktop 0.10+ supports remote MCP servers via the Streamable HTTP transport.
// Older Claude Desktop versions only support stdio (local) MCP servers.
// If you see "not valid MCP server configurations", upgrade Claude Desktop first.
// The url+headers format also works in Claude.ai (web) and Cursor.
const mcpConfigClaudeDesktop = `// Claude Desktop config (requires Claude Desktop 0.10 or later)
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "floom": {
      "type": "streamable-http",
      "url": "https://floom.dev/mcp",
      "headers": { "Authorization": "Bearer YOUR_AGENT_TOKEN" }
    }
  }
}`;

// Claude.ai (web) and Cursor use the plain url+headers format without a type field.
const mcpConfigExample = `// Claude.ai (web) and Cursor — Settings → MCP
{
  "mcpServers": {
    "floom": {
      "url": "https://floom.dev/mcp",
      "headers": { "Authorization": "Bearer YOUR_AGENT_TOKEN" }
    }
  }
}`;

const mcpRunExample = `# Claude calls run_app internally when you say:
# "Run my floom app csv-stats with this CSV..."
POST https://floom.dev/mcp
tool: run_app
arguments: { "slug": "csv-stats", "inputs": { "csv": "name,score\\nAlice,90" } }`;

const MCP_TOOLS = [
  { group: "Auth", tools: [
    ["auth_status", "Check whether the current token is valid and what scopes it has."],
    ["start_device_flow", "Begin CLI device-flow auth; returns a verification URL for the user."],
    ["poll_device_flow", "Poll the device-flow until approved; returns an agent token on success."],
  ]},
  { group: "Discovery", tools: [
    ["get_app_contract", "Self-contained walkthrough for AI agents new to Floom."],
    ["list_app_templates", "Browse scaffolding templates (e.g. multi_file_python, csv_stats)."],
    ["get_app_template", "Fetch a template by key and return its file map."],
    ["find_candidate_apps", "Scan a directory for floom.yaml manifests. File scan — not natural-language search."],
  ]},
  { group: "Apps", tools: [
    ["list_apps", "List all apps owned by the authenticated user."],
    ["get_app", "Fetch metadata for a specific app by slug."],
    ["validate_manifest", "Validate a floom.yaml before deploying (returns errors/warnings)."],
    ["publish_app", "Deploy an app from a file map (no local filesystem required)."],
  ]},
  { group: "Execution", tools: [
    ["run_app", "Run any public or owned app by slug; returns output synchronously."],
    ["get_execution", "Fetch the status and output of an async execution by ID."],
  ]},
  { group: "Connections", tools: [
    ["list_my_connections", "List the caller's active Composio OAuth connections."],
    ["set_secret", "Set a secret value for an app (requires publish scope)."],
  ]},
];

export default function McpPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Run</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          MCP for AI agents
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Floom exposes a Model Context Protocol server at <IC>https://floom.dev/mcp</IC>. Add it to Claude Desktop, Cursor, or any MCP-compatible client.
        </p>
      </div>

      <Section id="setup" title="Add to Claude Desktop">
        <CodeBlock label="Claude Desktop 0.10+ (remote MCP)">{mcpConfigClaudeDesktop}</CodeBlock>
        <p className="text-sm text-neutral-500 mb-4">
          Requires <strong>Claude Desktop 0.10 or later</strong>. If you see &ldquo;not valid MCP server configurations&rdquo;, upgrade Claude Desktop first. Earlier versions only support stdio (local) MCP servers.
        </p>
        <CodeBlock label="Claude.ai (web) and Cursor">{mcpConfigExample}</CodeBlock>
        <p className="text-sm text-neutral-500">
          Agent tokens with <IC>run</IC> scope can run any owned private app. Tokens with <IC>publish</IC> scope can deploy via <IC>publish_app</IC>. Generate tokens at <a href="/tokens" className="underline">floom.dev/tokens</a>.
        </p>
      </Section>

      <Section id="tools" title="All 15 available tools">
        {MCP_TOOLS.map((section) => (
          <div key={section.group} className="mt-6 first:mt-0">
            <p className="font-semibold text-[#11110f] text-sm mb-2">{section.group}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <tbody className="divide-y divide-[#f0ede6]">
                  {section.tools.map(([name, desc]) => (
                    <tr key={name}>
                      <td className="py-2 pr-4 font-mono text-sm text-[#2a2520] whitespace-nowrap">{name}</td>
                      <td className="py-2 text-neutral-600">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <p className="mt-4 text-sm text-neutral-500">
          The <IC>get_app_contract</IC> tool returns a self-contained walkthrough designed for AI agents that need to understand how Floom works before building or running apps.
        </p>
      </Section>

      <Section id="example-call" title="Example MCP call">
        <CodeBlock label="Example: run_app">{mcpRunExample}</CodeBlock>
      </Section>
    </>
  );
}
