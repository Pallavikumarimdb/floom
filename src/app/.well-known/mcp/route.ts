import { NextResponse } from "next/server";

export const runtime = "edge";

export function GET() {
  const origin = process.env.FLOOM_ORIGIN || process.env.NEXT_PUBLIC_FLOOM_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || "https://floom.dev";
  const base = origin.replace(/\/$/, "");

  return NextResponse.json(
    {
      mcp_endpoint: `${base}/mcp`,
      service: "floom",
      name: "Floom — publish + run small AI apps from anywhere",
      version: "0.1.0",
      auth: {
        device_flow_start: `${base}/api/cli/device/start`,
        device_flow_poll: `${base}/api/cli/device/poll`,
        mcp_tools: ["start_device_flow", "poll_device_flow"],
      },
      docs: `${base}/docs`,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    }
  );
}
