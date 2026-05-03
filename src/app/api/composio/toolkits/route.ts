import { NextResponse } from "next/server";
import { getAvailableToolkits } from "@/lib/composio/auth-configs";

export const revalidate = 3600; // 1 hour cache at the edge

export async function GET() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ toolkits: [] });
  }

  const toolkits = await getAvailableToolkits(apiKey);
  return NextResponse.json({ toolkits });
}
