import type { FloomApp, RunAppInput, RunAppResult } from "./types";

export const fallbackApp: FloomApp = {
  slug: "demo",
  name: "60-second brief",
  description: "Generate a compact first draft from a few structured fields.",
  inputSchema: {
    type: "object",
    required: ["topic"],
    properties: {
      topic: {
        type: "string",
        title: "Topic"
      },
      audience: {
        type: "string",
        title: "Audience",
        default: "busy operator"
      },
      tone: {
        type: "string",
        title: "Tone",
        enum: ["direct", "warm", "technical"],
        default: "direct"
      }
    }
  }
};

const isServer = typeof window === "undefined";

function apiBaseUrl() {
  if (!isServer) {
    return "";
  }

  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function getApp(slug: string): Promise<FloomApp> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/apps/${slug}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Failed to load app: ${response.status}`);
    }

    return (await response.json()) as FloomApp;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      return { ...fallbackApp, slug };
    }

    throw error;
  }
}

export async function runApp(
  slug: string,
  input: RunAppInput
): Promise<RunAppResult> {
  try {
    const response = await fetch(`/api/apps/${slug}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      throw new Error(`Failed to run app: ${response.status}`);
    }

    return (await response.json()) as RunAppResult;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      return {
        output: {
          app: slug,
          input,
          note: "Local dev fallback: /api app runner is unavailable."
        }
      };
    }

    throw error;
  }
}
