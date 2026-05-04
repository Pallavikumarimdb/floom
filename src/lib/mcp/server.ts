import { callFloomTool, floomTools, type McpToolContext } from "./tools";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse =
  | {
      jsonrpc: "2.0";
      id: JsonRpcId;
      result: unknown;
    }
  | {
      jsonrpc: "2.0";
      id: JsonRpcId;
      error: {
        code: number;
        message: string;
      };
    };

type ToolCallParams = {
  name?: unknown;
  arguments?: unknown;
};

export async function handleMcpRequest(
  payload: unknown,
  context: McpToolContext
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(payload)) {
    const MAX_BATCH_SIZE = 10;
    if (payload.length > MAX_BATCH_SIZE) {
      return [errorResponse(null, -32600, `Batch too large: max ${MAX_BATCH_SIZE} requests per batch`)];
    }
    const responses = await Promise.all(
      payload.map((item) => handleSingleRequest(item, context))
    );
    return responses.filter((response): response is JsonRpcResponse => response !== null);
  }

  return handleSingleRequest(payload, context);
}

async function handleSingleRequest(
  payload: unknown,
  context: McpToolContext
): Promise<JsonRpcResponse | null> {
  if (!isObject(payload)) {
    return errorResponse(null, -32600, "Invalid JSON-RPC request");
  }

  const request = payload as JsonRpcRequest;
  const id = request.id ?? null;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return errorResponse(id, -32600, "Invalid JSON-RPC request");
  }

  if (request.id === undefined) {
    return null;
  }

  if (request.method === "initialize") {
    return resultResponse(id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "floom",
        version: "0.1.0",
      },
    });
  }

  if (request.method === "tools/list") {
    return resultResponse(id, {
      tools: floomTools,
    });
  }

  if (request.method === "tools/call") {
    const params = isObject(request.params) ? (request.params as ToolCallParams) : {};
    if (typeof params.name !== "string") {
      return errorResponse(id, -32602, "tools/call requires a string name");
    }

    try {
      const result = await callFloomTool(params.name, params.arguments ?? {}, context);
      return resultResponse(id, result);
    } catch {
      return errorResponse(id, -32603, "Tool execution failed");
    }
  }

  return errorResponse(id, -32601, `Method not found: ${request.method}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function resultResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function errorResponse(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
}
