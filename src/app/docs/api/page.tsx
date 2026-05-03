import type { Metadata } from "next";
import { IC, CodeBlock, Section } from "@/components/docs/DocsPrimitives";

export const metadata: Metadata = {
  title: "REST API",
  description: "Floom REST API — run apps, poll async executions, deploy programmatically.",
  alternates: { canonical: "https://floom.dev/docs/api" },
};

const apiPublicExample = `# Public app — no auth needed
curl -X POST https://floom.dev/api/apps/meeting-action-items/run \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"transcript":"Alice: Let us ship by Friday..."}}'`;

const apiPrivateExample = `# Private app — agent token required
curl -X POST https://floom.dev/api/apps/my-private-app/run \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"text":"Run this securely"}}'`;

const apiResponseExample = `{
  "status": "ok",
  "output": { "action_items": ["Ship by Friday", "Review PR #42"] },
  "exit_code": 0,
  "duration_ms": 3412
}`;

const asyncFireAndForgetExample = `# Fire-and-forget — returns 202 immediately
curl -X POST https://floom.dev/api/apps/my-app/run \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"text":"process this"}}'
# Response: 202 { "execution_id": "exec_abc123", "status": "queued" }`;

const asyncPollExample = `# Poll until terminal status
while true; do
  STATUS=$(curl -s https://floom.dev/api/executions/exec_abc123 \\
    -H 'Authorization: Bearer YOUR_AGENT_TOKEN' | jq -r '.status')
  echo "Status: $STATUS"
  if [[ "$STATUS" == "succeeded" || "$STATUS" == "failed" || "$STATUS" == "timed_out" || "$STATUS" == "cancelled" ]]; then
    break
  fi
  sleep 1
done

# Read the result
curl -s https://floom.dev/api/executions/exec_abc123 \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' | jq '.output'`;

const asyncSyncBudgetExample = `# Sync style with up to 250s budget — blocks until done or times out
curl -X POST 'https://floom.dev/api/apps/my-app/run?wait=true' \\
  -H 'Authorization: Bearer YOUR_AGENT_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"text":"process this"}}'`;

export default function ApiPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Run</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          REST API
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Every app gets a REST run endpoint at <IC>POST /api/apps/:slug/run</IC>. Public apps need no auth; private apps require a session cookie or agent token.
        </p>
      </div>

      <Section id="run" title="Run an app">
        <CodeBlock label="Public app">{apiPublicExample}</CodeBlock>
        <CodeBlock label="Private app">{apiPrivateExample}</CodeBlock>
        <p>Response envelope:</p>
        <CodeBlock label="Response">{apiResponseExample}</CodeBlock>
        <p className="text-sm text-neutral-500">
          Sandbox boot failures return HTTP 502 with <IC>error: sandbox_unavailable</IC>. Install errors and non-zero exits return HTTP 200 with <IC>status: failed</IC>.
        </p>
      </Section>

      <Section id="async-runs" title="Async runs">
        <p>
          Apps that may run longer than 250 seconds should be called <strong>without</strong> <IC>?wait=true</IC>. The default POST returns <IC>202</IC> with an <IC>execution_id</IC> immediately; your code then polls until the status is terminal.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li><strong>POST without <IC>?wait=true</IC></strong>: returns <IC>202 {`{ execution_id, status: "queued" }`}</IC> right away.</li>
          <li><strong>Poll <IC>GET /api/executions/:id</IC></strong> every 1-2 s until <IC>status</IC> is <IC>succeeded</IC>, <IC>failed</IC>, <IC>timed_out</IC>, or <IC>cancelled</IC>.</li>
          <li><strong>Read the result</strong> from <IC>.output</IC> in the final poll response.</li>
        </ol>
        <CodeBlock label="Step 1: fire and forget">{asyncFireAndForgetExample}</CodeBlock>
        <CodeBlock label="Step 2: poll for result">{asyncPollExample}</CodeBlock>
        <p>
          The <IC>floom run</IC> CLI does this polling automatically — no extra code needed for command-line use.
        </p>
      </Section>

      <Section id="sync-runs" title="Sync runs (?wait=true)">
        <p>
          Pass <IC>?wait=true</IC> to wait up to 250 s for completion. Use only when your app reliably finishes within 250 s.
        </p>
        <CodeBlock label="Sync style (up to 250s budget)">{asyncSyncBudgetExample}</CodeBlock>
        <p className="text-sm text-neutral-500">
          Async mode (no <IC>?wait=true</IC>) is the default for REST calls. Only use sync when you need a single blocking response.
        </p>
      </Section>

      <Section id="poll" title="GET /api/executions/:id">
        <p>
          Returns the current status and output of any execution you own.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#ded8cc]">
                <th className="text-left py-2 pr-4 font-semibold text-[#11110f]">Status</th>
                <th className="text-left py-2 font-semibold text-[#11110f]">Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ede6]">
              {[
                ["queued", "Waiting for a sandbox to become available."],
                ["running", "Sandbox started, command executing."],
                ["succeeded", "Command exited 0. Output in .output."],
                ["failed", "Command exited non-zero. Details in .error."],
                ["timed_out", "Exceeded 290-second cap."],
                ["cancelled", "Manually cancelled or auto-failed by cron sweep."],
              ].map(([status, meaning]) => (
                <tr key={status}>
                  <td className="py-2 pr-4 font-mono text-sm text-[#2a2520]">{status}</td>
                  <td className="py-2 text-neutral-600">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
