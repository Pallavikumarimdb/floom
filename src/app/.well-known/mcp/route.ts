import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/config/origin";

export const runtime = "edge";

export function GET() {
  const base = siteOrigin();

  return NextResponse.json(
    {
      mcp_endpoint: `${base}/mcp`,
      service: "floom",
      name: "Floom: publish + run small AI apps from anywhere",
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
