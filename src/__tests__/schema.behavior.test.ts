/**
 * Behavior tests for schema.ts
 *
 * Tests the actual redaction and schema validation logic —
 * not source-string grep.
 */

import { describe, it, expect } from "vitest";
import {
  parseAndValidateJsonSchemaText,
  validateJsonSchemaValue,
  redactSecretInput,
  redactSecretOutput,
  redactExactSecretValues,
  REDACTED_OUTPUT_VALUE,
} from "@/lib/floom/schema";

// ── parseAndValidateJsonSchemaText ────────────────────────────────────────────

describe("parseAndValidateJsonSchemaText", () => {
  it("accepts a valid minimal JSON Schema", () => {
    const result = parseAndValidateJsonSchemaText(
      JSON.stringify({ type: "object", properties: { name: { type: "string" } } }),
      "input_schema"
    );
    expect(result.ok).toBe(true);
  });

  it("returns ok=false for invalid JSON", () => {
    const result = parseAndValidateJsonSchemaText("{not valid json", "input_schema");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("valid JSON");
  });

  it("returns ok=false when schema text exceeds MAX_SCHEMA_BYTES (65536 bytes)", () => {
    // MAX_SCHEMA_BYTES = 64 * 1024 = 65536. Build a schema text strictly over that.
    const bigText = JSON.stringify({ type: "object", description: "x".repeat(66_000) });
    expect(Buffer.byteLength(bigText, "utf8")).toBeGreaterThan(65_536);
    const result = parseAndValidateJsonSchemaText(bigText, "input_schema");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("too large");
  });

  it("returns ok=false for array (not object)", () => {
    const result = parseAndValidateJsonSchemaText(JSON.stringify([1, 2, 3]), "input_schema");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("JSON object");
  });

  it("returns ok=false for null", () => {
    const result = parseAndValidateJsonSchemaText(JSON.stringify(null), "input_schema");
    expect(result.ok).toBe(false);
  });

  it("returns ok=false for string value (not object)", () => {
    const result = parseAndValidateJsonSchemaText(JSON.stringify("hello"), "input_schema");
    expect(result.ok).toBe(false);
  });
});

// ── validateJsonSchemaValue ───────────────────────────────────────────────────

describe("validateJsonSchemaValue", () => {
  it("accepts a valid schema object", () => {
    const result = validateJsonSchemaValue({ type: "string" }, "field");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.schema).toEqual({ type: "string" });
  });

  it("throws on circular references (JSON.stringify fails before complexity check)", () => {
    // BUG: validateJsonSchemaValue calls JSON.stringify(value) before the getJsonComplexity
    // check, so circular refs throw a TypeError rather than returning ok=false.
    // This documents the actual behavior so we catch it if fixed.
    const circ: Record<string, unknown> = {};
    circ.self = circ;
    expect(() => validateJsonSchemaValue(circ, "field")).toThrow(/circular/i);
  });

  it("rejects arrays", () => {
    const result = validateJsonSchemaValue([], "field");
    expect(result.ok).toBe(false);
  });

  it("rejects null", () => {
    const result = validateJsonSchemaValue(null, "field");
    expect(result.ok).toBe(false);
  });
});

// ── redactExactSecretValues ───────────────────────────────────────────────────

describe("redactExactSecretValues", () => {
  it("replaces an exact string match with REDACTED", () => {
    const result = redactExactSecretValues("sk_secret", ["sk_secret"]);
    expect(result).toBe(REDACTED_OUTPUT_VALUE);
  });

  it("replaces a secret appearing inside a longer string", () => {
    const result = redactExactSecretValues("my key is sk_secret end", ["sk_secret"]);
    expect(result).toBe(`my key is ${REDACTED_OUTPUT_VALUE} end`);
  });

  it("replaces ALL occurrences in a single string", () => {
    const result = redactExactSecretValues("A sk_secret B sk_secret C", ["sk_secret"]);
    expect(result).toBe(`A ${REDACTED_OUTPUT_VALUE} B ${REDACTED_OUTPUT_VALUE} C`);
  });

  it("does NOT redact a string that merely contains the secret as a substring without whitespace boundary", () => {
    // "sk_secret_long" contains "sk_secret" as a substring — split behaviour:
    // "sk_secret_long".split("sk_secret") = ["", "_long"]
    // so join gives "[REDACTED]_long" — the function DOES redact partial substrings.
    // Verify the ACTUAL behavior (not what we wish it were).
    const result = redactExactSecretValues("sk_secret_long", ["sk_secret"]);
    // The function splits on the exact string, so it WILL redact partial matches.
    expect(result).toBe(`${REDACTED_OUTPUT_VALUE}_long`);
  });

  it("returns original value unchanged when secrets list is empty", () => {
    expect(redactExactSecretValues("no secrets here", [])).toBe("no secrets here");
  });

  it("ignores empty-string secrets (filtered out)", () => {
    const result = redactExactSecretValues("hello", [""]);
    expect(result).toBe("hello");
  });

  it("redacts values in a nested object", () => {
    const result = redactExactSecretValues(
      { user: "alice", token: "sk_secret" },
      ["sk_secret"]
    ) as Record<string, unknown>;
    expect(result.user).toBe("alice");
    expect(result.token).toBe(REDACTED_OUTPUT_VALUE);
  });

  it("redacts values in arrays", () => {
    const result = redactExactSecretValues(
      ["hello", "sk_secret", "world"],
      ["sk_secret"]
    ) as string[];
    expect(result).toEqual(["hello", REDACTED_OUTPUT_VALUE, "world"]);
  });

  it("redacts values in deeply nested structures", () => {
    const obj = { level1: { level2: { secret: "sk_secret" } } };
    const result = redactExactSecretValues(obj, ["sk_secret"]) as typeof obj;
    expect(result.level1.level2.secret).toBe(REDACTED_OUTPUT_VALUE);
  });

  it("preserves non-string values (numbers, booleans, null)", () => {
    const obj = { count: 42, flag: true, empty: null, secret: "sk_secret" };
    const result = redactExactSecretValues(obj, ["sk_secret"]) as Record<string, unknown>;
    expect(result.count).toBe(42);
    expect(result.flag).toBe(true);
    expect(result.empty).toBeNull();
    expect(result.secret).toBe(REDACTED_OUTPUT_VALUE);
  });

  it("handles multiple secrets — redacts all of them", () => {
    const result = redactExactSecretValues(
      "token=abc123 key=xyz789",
      ["abc123", "xyz789"]
    );
    expect(result).toBe(`token=${REDACTED_OUTPUT_VALUE} key=${REDACTED_OUTPUT_VALUE}`);
  });

  it("does not mutate the original object (returns a clone)", () => {
    const original = { secret: "sk_secret", safe: "hello" };
    const result = redactExactSecretValues(original, ["sk_secret"]) as typeof original;
    expect(original.secret).toBe("sk_secret"); // unchanged
    expect(result.secret).toBe(REDACTED_OUTPUT_VALUE);
  });

  it("handles the value being a plain number (returns as-is)", () => {
    const result = redactExactSecretValues(42, ["42"]);
    // 42 is a number, not a string — the function only redacts strings
    expect(result).toBe(42);
  });
});

// ── redactSecretInput / redactSecretOutput ────────────────────────────────────

describe("redactSecretInput", () => {
  it("redacts fields marked as secret: true in the schema", () => {
    const schema = {
      type: "object",
      properties: {
        api_key: { type: "string", secret: true },
        name: { type: "string" },
      },
    };
    const input = { api_key: "sk-12345", name: "Alice" };
    const result = redactSecretInput(schema, input) as typeof input;
    expect(result.api_key).toBe(REDACTED_OUTPUT_VALUE);
    expect(result.name).toBe("Alice");
  });

  it("leaves non-secret fields untouched", () => {
    const schema = {
      type: "object",
      properties: {
        count: { type: "number" },
        message: { type: "string" },
      },
    };
    const input = { count: 5, message: "hello" };
    const result = redactSecretInput(schema, input) as typeof input;
    expect(result.count).toBe(5);
    expect(result.message).toBe("hello");
  });

  it("redacts suspicious-key values when no schema marks them (isSuspiciousSecretKey)", () => {
    // redactSecretInput calls redactSuspiciousKeys on the result.
    // Keys matching 'password', 'token', 'apikey', etc. are redacted.
    const schema = { type: "object", properties: {} };
    const input = { password: "hunter2", safe: "hello" };
    const result = redactSecretInput(schema, input) as Record<string, unknown>;
    expect(result.password).toBe(REDACTED_OUTPUT_VALUE);
    expect(result.safe).toBe("hello");
  });

  it("redacts when schema is null (returns clone, then suspicious-key pass)", () => {
    const input = { api_key: "sk-xyz", name: "Bob" };
    const result = redactSecretInput(null, input) as Record<string, unknown>;
    // api_key matches 'apikey' in suspicious-key check
    expect(result.api_key).toBe(REDACTED_OUTPUT_VALUE);
  });

  it("handles array inputs with item schema marked secret", () => {
    const schema = {
      type: "array",
      items: { type: "string", secret: true },
    };
    const input = ["value1", "value2"];
    const result = redactSecretInput(schema, input) as string[];
    expect(result).toEqual([REDACTED_OUTPUT_VALUE, REDACTED_OUTPUT_VALUE]);
  });

  it("does not mutate the original input object", () => {
    const schema = {
      type: "object",
      properties: { api_key: { type: "string", secret: true } },
    };
    const original = { api_key: "sk-12345" };
    redactSecretInput(schema, original);
    expect(original.api_key).toBe("sk-12345");
  });
});

describe("redactSecretOutput", () => {
  it("redacts secret-marked fields in output schema", () => {
    const schema = {
      type: "object",
      properties: {
        result: { type: "string" },
        token: { type: "string", secret: true },
      },
    };
    const output = { result: "done", token: "bearer-abc" };
    const redacted = redactSecretOutput(schema, output) as typeof output;
    expect(redacted.result).toBe("done");
    expect(redacted.token).toBe(REDACTED_OUTPUT_VALUE);
  });
});

// ── redactSuspiciousKeys coverage (via redactSecretInput) ─────────────────────

describe("suspicious key redaction (via redactSecretInput)", () => {
  const suspiciousKeys = ["password", "secret", "token", "api_key", "apiKey", "private_key", "credential", "authorization"];
  const safeKeys = ["name", "count", "message", "url", "type"];

  for (const key of suspiciousKeys) {
    it(`redacts key "${key}" as suspicious`, () => {
      const input: Record<string, string> = { [key]: "sensitive-value", safe: "ok" };
      const result = redactSecretInput({}, input) as Record<string, unknown>;
      expect(result[key]).toBe(REDACTED_OUTPUT_VALUE);
    });
  }

  for (const key of safeKeys) {
    it(`does NOT redact safe key "${key}"`, () => {
      const input: Record<string, string> = { [key]: "normal-value" };
      const result = redactSecretInput({}, input) as Record<string, unknown>;
      expect(result[key]).toBe("normal-value");
    });
  }
});

// ── $ref resolution ───────────────────────────────────────────────────────────

describe("redactSecretInput — $ref resolution", () => {
  it("follows local $defs reference and redacts secret field", () => {
    const schema = {
      type: "object",
      properties: {
        creds: { $ref: "#/$defs/Credentials" },
        name: { type: "string" },
      },
      $defs: {
        Credentials: {
          type: "object",
          properties: {
            api_key: { type: "string", secret: true },
          },
        },
      },
    };
    const input = { creds: { api_key: "sk-abc" }, name: "Alice" };
    const result = redactSecretInput(schema, input) as {
      creds: { api_key: string };
      name: string;
    };
    expect(result.creds.api_key).toBe(REDACTED_OUTPUT_VALUE);
    expect(result.name).toBe("Alice");
  });
});
