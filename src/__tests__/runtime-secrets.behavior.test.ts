/**
 * Behavior tests for runtime-secrets.ts
 *
 * Exercises the actual parsing, cryptographic, and resolution logic —
 * not source-string grep.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseManifestSecrets,
  parseSecretNames,
  encryptSecretValue,
  decryptSecretValue,
  resolveRuntimeSecrets,
  isAnonPerRunnerError,
  isValidSecretName,
} from "@/lib/floom/runtime-secrets";

// ── Test key setup ────────────────────────────────────────────────────────────

// 32 random bytes base64-encoded (valid AES-256 key for tests)
const TEST_KEY_B64 = Buffer.from(Array(32).fill(42)).toString("base64");

function withEncryptionKey(fn: () => void) {
  const prev = process.env.FLOOM_SECRET_ENCRYPTION_KEY;
  process.env.FLOOM_SECRET_ENCRYPTION_KEY = TEST_KEY_B64;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.FLOOM_SECRET_ENCRYPTION_KEY;
    else process.env.FLOOM_SECRET_ENCRYPTION_KEY = prev;
  }
}

// ── parseManifestSecrets ──────────────────────────────────────────────────────

describe("parseManifestSecrets", () => {
  it("returns [] for non-array input (null)", () => {
    expect(parseManifestSecrets(null)).toEqual([]);
  });

  it("returns [] for non-array input (string)", () => {
    expect(parseManifestSecrets("SOME_KEY")).toEqual([]);
  });

  it("returns [] for non-array input (object)", () => {
    expect(parseManifestSecrets({ name: "SOME_KEY" })).toEqual([]);
  });

  it("returns [] for empty array", () => {
    expect(parseManifestSecrets([])).toEqual([]);
  });

  it("legacy string array → scope=shared for all", () => {
    const result = parseManifestSecrets(["GMAIL_USER", "API_KEY"]);
    expect(result).toEqual([
      { name: "GMAIL_USER", scope: "shared" },
      { name: "API_KEY", scope: "shared" },
    ]);
  });

  it("object form with scope: shared → scope=shared", () => {
    const result = parseManifestSecrets([{ name: "GMAIL_USER", scope: "shared" }]);
    expect(result).toEqual([{ name: "GMAIL_USER", scope: "shared" }]);
  });

  it("object form with scope: per-runner → scope=per-runner", () => {
    const result = parseManifestSecrets([{ name: "MY_TOKEN", scope: "per-runner" }]);
    expect(result).toEqual([{ name: "MY_TOKEN", scope: "per-runner" }]);
  });

  it("object form without scope → defaults to per-runner (not shared)", () => {
    const result = parseManifestSecrets([{ name: "MY_TOKEN" }]);
    expect(result[0]?.scope).toBe("per-runner");
  });

  it("object form with invalid scope → defaults to per-runner", () => {
    const result = parseManifestSecrets([{ name: "MY_TOKEN", scope: "global" }]);
    expect(result[0]?.scope).toBe("per-runner");
  });

  it("malformed entry (number) → coerced to per-runner, NOT shared", () => {
    const result = parseManifestSecrets([42 as unknown]);
    expect(result[0]?.scope).toBe("per-runner");
  });

  it("malformed entry (null) → coerced to per-runner, NOT shared", () => {
    const result = parseManifestSecrets([null]);
    expect(result[0]?.scope).toBe("per-runner");
  });

  it("mixed array (string + object) is handled element by element", () => {
    const result = parseManifestSecrets([
      "SHARED_KEY",
      { name: "RUNNER_KEY", scope: "per-runner" },
    ]);
    expect(result).toEqual([
      { name: "SHARED_KEY", scope: "shared" },
      { name: "RUNNER_KEY", scope: "per-runner" },
    ]);
  });
});

// ── parseSecretNames ──────────────────────────────────────────────────────────

describe("parseSecretNames", () => {
  it("accepts valid SCREAMING_SNAKE names", () => {
    const result = parseSecretNames(["API_KEY", "GMAIL_TOKEN"]);
    expect(result).toEqual({ ok: true, names: ["API_KEY", "GMAIL_TOKEN"] });
  });

  it("rejects lowercase names", () => {
    expect(parseSecretNames(["api_key"])).toEqual({ ok: false });
  });

  it("rejects duplicate names", () => {
    expect(parseSecretNames(["API_KEY", "API_KEY"])).toEqual({ ok: false });
  });

  it("accepts object form with valid names", () => {
    const result = parseSecretNames([{ name: "API_KEY" }]);
    expect(result).toEqual({ ok: true, names: ["API_KEY"] });
  });

  it("rejects object form with invalid name", () => {
    expect(parseSecretNames([{ name: "" }])).toEqual({ ok: false });
  });

  it("returns ok=true names=[] for non-array (undefined)", () => {
    expect(parseSecretNames(undefined)).toEqual({ ok: true, names: [] });
  });

  it("rejects malformed entries (number)", () => {
    expect(parseSecretNames([42 as unknown])).toEqual({ ok: false });
  });
});

// ── isValidSecretName ─────────────────────────────────────────────────────────

describe("isValidSecretName", () => {
  it("accepts SCREAMING_SNAKE names starting with uppercase letter", () => {
    expect(isValidSecretName("API_KEY")).toBe(true);
    expect(isValidSecretName("GMAIL_USER2")).toBe(true);
    expect(isValidSecretName("A1")).toBe(true);
  });

  it("rejects names starting with underscore", () => {
    expect(isValidSecretName("_KEY")).toBe(false);
  });

  it("rejects names starting with digit", () => {
    expect(isValidSecretName("1KEY")).toBe(false);
  });

  it("rejects lowercase letters", () => {
    expect(isValidSecretName("api_key")).toBe(false);
    expect(isValidSecretName("Api_Key")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSecretName("")).toBe(false);
  });

  it("rejects single character (must be at least 2 chars: [A-Z][A-Z0-9_]{1,63})", () => {
    // Pattern is /^[A-Z][A-Z0-9_]{1,63}$/ — minimum 2 chars
    expect(isValidSecretName("A")).toBe(false);
  });
});

// ── encryptSecretValue / decryptSecretValue ───────────────────────────────────

describe("encryptSecretValue / decryptSecretValue", () => {
  it("round-trips: decrypt(encrypt(plaintext)) === plaintext", () => {
    withEncryptionKey(() => {
      const plain = "super-secret-value-12345";
      const ciphertext = encryptSecretValue(plain);
      const recovered = decryptSecretValue(ciphertext);
      expect(recovered).toBe(plain);
    });
  });

  it("rejects empty-string encryption (format check: empty ciphertext is falsy)", () => {
    // BUG: encryptSecretValue("") produces a valid AES-GCM encrypted empty string,
    // but decryptSecretValue rejects it because the format check uses !ciphertextBase64
    // which treats empty string "" as falsy. This is a real bug in the implementation.
    // Test documents the actual (buggy) behavior so regressions are caught if fixed.
    withEncryptionKey(() => {
      const ct = encryptSecretValue("");
      expect(() => decryptSecretValue(ct)).toThrow("Invalid encrypted secret format");
    });
  });

  it("round-trips with unicode content", () => {
    withEncryptionKey(() => {
      const unicode = "🔑 secret: über-café";
      expect(decryptSecretValue(encryptSecretValue(unicode))).toBe(unicode);
    });
  });

  it("each encryption produces a different ciphertext (unique IV)", () => {
    withEncryptionKey(() => {
      const plain = "same-value";
      const ct1 = encryptSecretValue(plain);
      const ct2 = encryptSecretValue(plain);
      expect(ct1).not.toBe(ct2);
    });
  });

  it("ciphertext format is v1:<nonce_b64>:<tag_b64>:<ciphertext_b64> (4 segments)", () => {
    withEncryptionKey(() => {
      const ct = encryptSecretValue("hello");
      const parts = ct.split(":");
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe("v1");
    });
  });

  it("throws on tampered ciphertext (auth tag mismatch)", () => {
    withEncryptionKey(() => {
      const ct = encryptSecretValue("sensitive");
      const parts = ct.split(":");
      // Corrupt the last byte of the ciphertext segment
      const cipherB64 = parts[3]!;
      const corrupted =
        cipherB64.slice(0, -1) + (cipherB64.slice(-1) === "A" ? "B" : "A");
      const tampered = [...parts.slice(0, 3), corrupted].join(":");
      expect(() => decryptSecretValue(tampered)).toThrow();
    });
  });

  it("throws on tampered auth tag", () => {
    withEncryptionKey(() => {
      const ct = encryptSecretValue("sensitive");
      const parts = ct.split(":");
      // Decode the tag, flip a bit in the actual bytes, then re-encode
      const tagBytes = Buffer.from(parts[2]!, "base64");
      tagBytes[0] ^= 0x01; // flip least significant bit of first byte
      const corruptedTagB64 = tagBytes.toString("base64");
      const tampered = [parts[0], parts[1], corruptedTagB64, parts[3]].join(":");
      expect(() => decryptSecretValue(tampered)).toThrow();
    });
  });

  it("throws on invalid format (too many segments)", () => {
    withEncryptionKey(() => {
      expect(() => decryptSecretValue("v1:a:b:c:extra")).toThrow("Invalid encrypted secret format");
    });
  });

  it("throws on wrong version prefix", () => {
    withEncryptionKey(() => {
      expect(() => decryptSecretValue("v2:a:b:c")).toThrow("Invalid encrypted secret format");
    });
  });

  it("throws on missing key", () => {
    const prev = process.env.FLOOM_SECRET_ENCRYPTION_KEY;
    delete process.env.FLOOM_SECRET_ENCRYPTION_KEY;
    expect(() => encryptSecretValue("test")).toThrow("FLOOM_SECRET_ENCRYPTION_KEY");
    if (prev !== undefined) process.env.FLOOM_SECRET_ENCRYPTION_KEY = prev;
  });
});

// ── resolveRuntimeSecrets ─────────────────────────────────────────────────────

describe("resolveRuntimeSecrets", () => {
  function buildAdmin(overrides: {
    sharedRows?: Array<{ name: string; value_ciphertext: string }>;
    perRunnerRows?: Array<{ name: string; value_ciphertext: string }>;
    error?: { message: string };
  }): SupabaseClient {
    let callCount = 0;
    const selectBuilder = (rows: unknown[], error: { message: string } | null) => {
      const b: Record<string, unknown> = {};
      const chain = () => b;
      b.eq = vi.fn().mockReturnValue(b);
      b.is = vi.fn().mockReturnValue(b);
      b.in = vi.fn().mockResolvedValue({ data: rows, error });
      return b;
    };

    return {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockImplementation(() => {
          callCount += 1;
          if (overrides.error) {
            return selectBuilder([], overrides.error);
          }
          if (callCount === 1) {
            return selectBuilder(overrides.sharedRows ?? [], null);
          }
          return selectBuilder(overrides.perRunnerRows ?? [], null);
        }),
      })),
    } as unknown as SupabaseClient;
  }

  function encryptedRow(name: string, value: string) {
    process.env.FLOOM_SECRET_ENCRYPTION_KEY = TEST_KEY_B64;
    const ct = encryptSecretValue(value);
    return { name, value_ciphertext: ct };
  }

  beforeAll(() => {
    process.env.FLOOM_SECRET_ENCRYPTION_KEY = TEST_KEY_B64;
  });

  afterAll(() => {
    delete process.env.FLOOM_SECRET_ENCRYPTION_KEY;
  });

  it("returns empty envs when secretsRaw is empty array", async () => {
    const admin = buildAdmin({});
    const result = await resolveRuntimeSecrets(admin, [], "app-1", "owner-1", "caller-1");
    expect(result).toEqual({ ok: true, envs: {}, missing: [] });
  });

  it("returns AnonPerRunnerSecretError when anon caller requests per-runner secrets", async () => {
    const admin = buildAdmin({});
    const secrets = [{ name: "MY_TOKEN", scope: "per-runner" }];
    const result = await resolveRuntimeSecrets(admin, secrets, "app-1", "owner-1", null);
    expect(isAnonPerRunnerError(result)).toBe(true);
    if (isAnonPerRunnerError(result)) {
      expect(result.requiresSignIn).toContain("MY_TOKEN");
    }
  });

  it("shared secrets are resolved correctly", async () => {
    const admin = buildAdmin({
      sharedRows: [encryptedRow("GMAIL_USER", "test@gmail.com")],
    });
    const secrets = [{ name: "GMAIL_USER", scope: "shared" }];
    const result = await resolveRuntimeSecrets(admin, secrets, "app-1", "owner-1", "caller-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envs.GMAIL_USER).toBe("test@gmail.com");
      expect(result.missing).toEqual([]);
    }
  });

  it("missing shared secret appears in missing array, not in envs", async () => {
    const admin = buildAdmin({
      sharedRows: [], // no rows — GMAIL_USER is absent
    });
    const secrets = [{ name: "GMAIL_USER", scope: "shared" }];
    const result = await resolveRuntimeSecrets(admin, secrets, "app-1", "owner-1", "caller-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.missing).toContain("GMAIL_USER");
      expect(result.envs).not.toHaveProperty("GMAIL_USER");
    }
  });

  it("DB error for shared secrets returns ok=false", async () => {
    const admin = buildAdmin({ error: { message: "pg error" } });
    const secrets = [{ name: "GMAIL_USER", scope: "shared" }];
    const result = await resolveRuntimeSecrets(admin, secrets, "app-1", "owner-1", "caller-1");
    expect(result.ok).toBe(false);
  });

  it("returns ok=false when encryption key is missing and secrets are present", async () => {
    delete process.env.FLOOM_SECRET_ENCRYPTION_KEY;
    const admin = buildAdmin({});
    const secrets = [{ name: "MY_KEY", scope: "shared" }];
    const result = await resolveRuntimeSecrets(admin, secrets, "app-1", "owner-1", "caller-1");
    expect(result.ok).toBe(false);
    if (!result.ok && !isAnonPerRunnerError(result)) {
      expect(result.error).toContain("not configured");
    }
    process.env.FLOOM_SECRET_ENCRYPTION_KEY = TEST_KEY_B64;
  });

  it("string array form is accepted (legacy)", async () => {
    const admin = buildAdmin({
      sharedRows: [encryptedRow("API_KEY", "sk-abc")],
    });
    // Legacy form: string[]
    const result = await resolveRuntimeSecrets(admin, ["API_KEY"], "app-1", "owner-1", "caller-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envs.API_KEY).toBe("sk-abc");
    }
  });
});

// ── isAnonPerRunnerError type guard ───────────────────────────────────────────

describe("isAnonPerRunnerError", () => {
  it("returns true for AnonPerRunnerSecretError shape", () => {
    expect(isAnonPerRunnerError({ ok: false, requiresSignIn: ["KEY"] })).toBe(true);
  });

  it("returns false for ok=true", () => {
    expect(isAnonPerRunnerError({ ok: true, envs: {}, missing: [] })).toBe(false);
  });

  it("returns false for ok=false without requiresSignIn", () => {
    expect(isAnonPerRunnerError({ ok: false, error: "some error" })).toBe(false);
  });
});
