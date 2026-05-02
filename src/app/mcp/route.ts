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
    response = await handleMcpRequest(payload, {
      baseUrl: resolveMcpForwardOrigin(req.url) ?? "",
      authorization: req.headers.get("authorization") ?? undefined,
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
