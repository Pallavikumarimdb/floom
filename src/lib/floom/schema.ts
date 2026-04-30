import Ajv from "ajv";
import {
  MAX_SCHEMA_BYTES,
  MAX_SCHEMA_DEPTH,
  MAX_SCHEMA_NODES,
} from "./limits";

export type JsonObject = Record<string, unknown>;

const schemaAjv = new Ajv({ strict: false });

export type SchemaValidationResult =
  | { ok: true; schema: JsonObject }
  | { ok: false; error: string };

export const REDACTED_OUTPUT_VALUE = "[REDACTED]";
const LOCAL_SCHEMA_REF_PREFIX = "#/";

export function parseAndValidateJsonSchemaText(
  schemaText: string,
  field: string
): SchemaValidationResult {
  if (Buffer.byteLength(schemaText, "utf8") > MAX_SCHEMA_BYTES) {
    return { ok: false, error: `${field} is too large` };
  }

  try {
    return validateJsonSchemaValue(JSON.parse(schemaText), field);
  } catch {
    return { ok: false, error: `${field} must be valid JSON` };
  }
}

export function validateJsonSchemaValue(
  value: unknown,
  field: string
): SchemaValidationResult {
  const schemaText = typeof value === "string" ? value : JSON.stringify(value ?? null);
  if (Buffer.byteLength(schemaText, "utf8") > MAX_SCHEMA_BYTES) {
    return { ok: false, error: `${field} is too large` };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: `${field} must be a JSON object` };
  }

  const complexity = getJsonComplexity(value);
  if (!complexity.ok) {
    return { ok: false, error: `${field} is too complex` };
  }

  if (!schemaAjv.validateSchema(value)) {
    return { ok: false, error: `${field} failed JSON Schema metaschema validation` };
  }

  return { ok: true, schema: value as JsonObject };
}

export function redactSecretOutput(outputSchema: unknown, output: unknown): unknown {
  return redactBySchema(outputSchema, output, outputSchema, new Set());
}

function getJsonComplexity(value: unknown): { ok: true } | { ok: false } {
  const seen = new WeakSet<object>();
  let nodes = 0;

  function visit(item: unknown, depth: number): boolean {
    if (depth > MAX_SCHEMA_DEPTH) {
      return false;
    }

    if (!item || typeof item !== "object") {
      return true;
    }

    if (seen.has(item)) {
      return false;
    }
    seen.add(item);

    nodes += 1;
    if (nodes > MAX_SCHEMA_NODES) {
      return false;
    }

    const children = Array.isArray(item) ? item : Object.values(item);
    return children.every((child) => visit(child, depth + 1));
  }

  return visit(value, 0) ? { ok: true } : { ok: false };
}

function redactBySchema(
  schema: unknown,
  value: unknown,
  rootSchema: unknown,
  refStack: Set<string>
): unknown {
  if (!isJsonObject(schema)) {
    return cloneJsonValue(value);
  }

  if (schema.secret === true) {
    return REDACTED_OUTPUT_VALUE;
  }

  if (typeof schema.$ref === "string") {
    const resolvedSchema = resolveLocalSchemaRef(rootSchema, schema.$ref);
    if (resolvedSchema && !refStack.has(schema.$ref)) {
      return redactBySchema(
        resolvedSchema,
        value,
        rootSchema,
        new Set([...refStack, schema.$ref])
      );
    }
  }

  let redacted = cloneJsonValue(value);
  redacted = applySubschemas(schema.allOf, redacted, rootSchema, refStack);
  redacted = applySubschemas(schema.anyOf, redacted, rootSchema, refStack);
  redacted = applySubschemas(schema.oneOf, redacted, rootSchema, refStack);

  if (Array.isArray(redacted)) {
    let redactedArray: unknown[] = redacted;
    const itemsSchema = schema.items;
    if (itemsSchema !== undefined) {
      redactedArray = redactedArray.map((item: unknown) =>
        redactBySchema(itemsSchema, item, rootSchema, refStack)
      );
    }

    if (Array.isArray(schema.prefixItems)) {
      redactedArray = redactedArray.map((item: unknown, index: number) => {
        const itemSchema = (schema.prefixItems as unknown[])[index];
        return itemSchema === undefined
          ? item
          : redactBySchema(itemSchema, item, rootSchema, refStack);
      });
    }

    return redactedArray;
  }

  if (!isJsonObject(redacted)) {
    return redacted;
  }

  const properties = isJsonObject(schema.properties) ? schema.properties : {};
  for (const [key, propertySchema] of Object.entries(properties)) {
    if (Object.prototype.hasOwnProperty.call(redacted, key)) {
      redacted[key] = redactBySchema(propertySchema, redacted[key], rootSchema, refStack);
    }
  }

  if (isJsonObject(schema.patternProperties)) {
    for (const [pattern, patternSchema] of Object.entries(schema.patternProperties)) {
      const regex = toRegExp(pattern);
      if (!regex) {
        continue;
      }

      for (const key of Object.keys(redacted)) {
        if (regex.test(key)) {
          redacted[key] = redactBySchema(patternSchema, redacted[key], rootSchema, refStack);
        }
      }
    }
  }

  if (isJsonObject(schema.additionalProperties)) {
    for (const key of Object.keys(redacted)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        redacted[key] = redactBySchema(
          schema.additionalProperties,
          redacted[key],
          rootSchema,
          refStack
        );
      }
    }
  }

  return redacted;
}

function applySubschemas(
  schemas: unknown,
  value: unknown,
  rootSchema: unknown,
  refStack: Set<string>
): unknown {
  if (!Array.isArray(schemas)) {
    return value;
  }

  return schemas.reduce(
    (current, schema) => redactBySchema(schema, current, rootSchema, refStack),
    value
  );
}

function resolveLocalSchemaRef(rootSchema: unknown, ref: string): unknown | null {
  if (!isJsonObject(rootSchema) || !ref.startsWith(LOCAL_SCHEMA_REF_PREFIX)) {
    return null;
  }

  const path = ref.slice(LOCAL_SCHEMA_REF_PREFIX.length).split("/").map(decodeJsonPointerSegment);
  if (path[0] !== "$defs" && path[0] !== "definitions") {
    return null;
  }

  let current: unknown = rootSchema;
  for (const segment of path) {
    if (!isJsonObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return null;
    }
    current = current[segment];
  }

  return current;
}

function decodeJsonPointerSegment(segment: string) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item));
  }

  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)])
    );
  }

  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toRegExp(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}
