/**
 * `floom logs <execution_id>` CLI command.
 *
 * Polls GET /api/runs/<id>/logs?since=<offset> every 1s and prints new
 * stdout/stderr content. Stops when execution reaches a terminal status.
 *
 * Usage:
 *   FLOOM_TOKEN=<token> FLOOM_API_URL=<url> tsx cli/logs.ts <execution_id>
 *   FLOOM_TOKEN=<token> tsx cli/logs.ts <execution_id>
 *
 * Env:
 *   FLOOM_API_URL  Base URL of the Floom deployment (default: https://floom.dev)
 *   FLOOM_TOKEN    Bearer token for auth (required for private runs)
 */
import fetch from "node-fetch";

type ExecutionEvent = {
  id: string;
  execution_id: string;
  kind: "status" | "progress" | "stdout" | "stderr" | "heartbeat" | "system";
  payload: Record<string, unknown> | null;
  created_at: string;
};

type LogsResponse = {
  events: ExecutionEvent[];
  next_offset: number;
  status: string;
  terminal: boolean;
};

const POLL_INTERVAL_MS = 1000;
const MAX_POLLS = 600; // 10 minutes

async function fetchLogs(
  apiUrl: string,
  executionId: string,
  since: number,
  token?: string
): Promise<LogsResponse> {
  const url = `${apiUrl}/api/runs/${encodeURIComponent(executionId)}/logs?since=${since}`;
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  return res.json() as Promise<LogsResponse>;
}

function printEvents(events: ExecutionEvent[]) {
  for (const event of events) {
    if (event.kind === "stdout") {
      const chunk = event.payload?.chunk;
      if (typeof chunk === "string") {
        process.stdout.write(chunk);
      }
    } else if (event.kind === "stderr") {
      const chunk = event.payload?.chunk;
      if (typeof chunk === "string") {
        process.stderr.write(chunk);
      }
    } else if (event.kind === "status") {
      const status = event.payload?.status;
      if (status && status !== "running" && status !== "queued") {
        const err = event.payload?.error;
        const line = err ? `\n[floom] status: ${status} — ${err}\n` : `\n[floom] status: ${status}\n`;
        process.stderr.write(line);
      }
    } else if (event.kind === "system") {
      const code = event.payload?.code;
      if (code) {
        process.stderr.write(`[floom] system: ${code}\n`);
      }
    }
  }
}

async function streamLogs(apiUrl: string, executionId: string, token?: string) {
  let offset = 0;
  let polls = 0;

  process.stderr.write(`[floom] streaming logs for ${executionId}\n`);

  while (polls < MAX_POLLS) {
    let response: LogsResponse;
    try {
      response = await fetchLogs(apiUrl, executionId, offset, token);
    } catch (err) {
      process.stderr.write(`[floom] error fetching logs: ${(err as Error).message}\n`);
      await sleep(POLL_INTERVAL_MS);
      polls++;
      continue;
    }

    printEvents(response.events);
    offset = response.next_offset;

    if (response.terminal) {
      const exitCode = response.status === "succeeded" ? 0 : 1;
      process.exit(exitCode);
    }

    await sleep(POLL_INTERVAL_MS);
    polls++;
  }

  process.stderr.write(`[floom] timeout after ${MAX_POLLS}s — execution is still running\n`);
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const [, , executionIdArg] = process.argv;
const apiUrl = (process.env.FLOOM_API_URL || "https://floom.dev").replace(/\/+$/, "");
const token = process.env.FLOOM_TOKEN;

if (!executionIdArg) {
  console.error("Usage: tsx cli/logs.ts <execution_id>");
  process.exit(1);
}

// UUID-like check
if (!/^[0-9a-f-]{36}$/i.test(executionIdArg)) {
  console.error("Invalid execution_id format. Expected a UUID.");
  process.exit(1);
}

streamLogs(apiUrl, executionIdArg, token || undefined).catch((err) => {
  console.error("[floom] fatal:", err.message);
  process.exit(1);
});
