import { Client, Receiver } from "@upstash/qstash";
import type { NextRequest } from "next/server";

export type ProcessExecutionMessage = {
  execution_id: string;
  phase: "process";
  scheduled_at: string;
};

export type SweepExecutionsMessage = {
  kind: "sweep";
};

export type PublishProcessOptions = {
  executionId: string;
  pollCount?: number;
  delaySeconds?: number;
  baseUrl?: string;
};

export async function publishExecutionProcessMessage({
  executionId,
  pollCount = 0,
  delaySeconds = 0,
  baseUrl,
}: PublishProcessOptions) {
  const client = qstashClient();
  const url = `${resolveWorkerBaseUrl(baseUrl)}/api/internal/executions/process`;
  const response = await client.publishJSON({
    url,
    body: {
      execution_id: executionId,
      phase: "process",
      scheduled_at: new Date().toISOString(),
    } satisfies ProcessExecutionMessage,
    retries: 0,
    delay: delaySeconds,
    deduplicationId: `execution-${executionId}-poll-${pollCount}`,
    label: "floom-execution-process",
  });

  return response.messageId;
}

export async function publishSweepMessage(baseUrl?: string) {
  const client = qstashClient();
  const url = `${resolveWorkerBaseUrl(baseUrl)}/api/internal/executions/sweep`;
  return client.publishJSON({
    url,
    body: { kind: "sweep" } satisfies SweepExecutionsMessage,
    retries: 0,
    deduplicationId: `execution-sweep-${Math.floor(Date.now() / 60_000)}`,
    label: "floom-execution-sweep",
  });
}

export async function verifyQstashRequest(req: NextRequest, rawBody: string) {
  const signature = req.headers.get("upstash-signature");
  if (!signature) {
    return false;
  }

  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
  });

  try {
    return await receiver.verify({
      signature,
      body: rawBody,
      url: req.url,
      upstashRegion: req.headers.get("upstash-region") ?? undefined,
      clockTolerance: 30,
    });
  } catch {
    return false;
  }
}

export function resolveWorkerBaseUrl(baseUrl?: string) {
  const explicit = process.env.FLOOM_WORKER_URL || baseUrl;
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

function qstashClient() {
  if (!process.env.QSTASH_TOKEN) {
    throw new Error("QSTASH_TOKEN is not configured");
  }

  // EU/region-specific QStash projects must override the SDK default
  // (https://qstash.upstash.io). Set QSTASH_URL e.g. to
  // https://qstash-eu-central-1.upstash.io for EU-only projects.
  const baseUrl = process.env.QSTASH_URL?.replace(/\/+$/, "") || undefined;

  return new Client({
    token: process.env.QSTASH_TOKEN,
    baseUrl,
    enableTelemetry: false,
  });
}
