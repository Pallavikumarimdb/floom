import { NextRequest, NextResponse } from "next/server";
import { handleMcpRequest } from "@/lib/mcp/server";
import { resolveMcpForwardOrigin } from "@/lib/mcp/origin";

export async function GET(req: NextRequest) {
  const origin = resolveMcpForwardOrigin(req.url);
  if (!origin) {
    return NextResponse.json({ error: "Floom origin is not configured" }, { status: 503 });
  }

  return NextResponse.json({
    name: "floom",
    version: "v0.1",
    endpoint: new URL("/mcp", origin).toString(),
    transport: "json-rpc-over-http",
    docs: new URL("/docs", origin).toString(),
  });
}

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
        },
      },
      { status: 400 }
    );
  }

  let response: Awaited<ReturnType<typeof handleMcpRequest>>;
  try {
    // Resolve the real caller IP. x-vercel-forwarded-for is set by Vercel
    // infrastructure and is NOT client-overridable, unlike x-forwarded-for
    // which clients can spoof to bypass rate limits. cf-connecting-ip covers a
    // future Cloudflare-in-front scenario. x-forwarded-for is excluded.
    const vercelFwd = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
    const cfIp = req.headers.get("cf-connecting-ip");
    const realIp = req.headers.get("x-real-ip");
    const callerIp = vercelFwd || cfIp || realIp || undefined;
    response = await handleMcpRequest(payload, {
      baseUrl: resolveMcpForwardOrigin(req.url) ?? "",
      authorization: req.headers.get("authorization") ?? undefined,
      callerIp,
      callerUserAgent: req.headers.get("user-agent") ?? undefined,
    });
  } catch {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: "Internal error",
      },
    });
  }

  if (response === null || (Array.isArray(response) && response.length === 0)) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(response);
}
