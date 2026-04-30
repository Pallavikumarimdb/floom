import type { RJSFSchema } from "@rjsf/utils";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonSchema = RJSFSchema;

export type FloomApp = {
  slug: string;
  name: string;
  description?: string;
  inputSchema: JsonSchema;
};

export type RunAppInput = Record<string, JsonValue>;

export type RunAppResult = {
  execution_id?: string | null;
  status?: "succeeded" | "failed";
  output: JsonValue;
};
