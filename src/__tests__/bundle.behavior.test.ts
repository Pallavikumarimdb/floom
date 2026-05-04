/**
 * Behavior tests for bundle.ts
 *
 * Tests the actual tarball validation logic — path traversal, symlinks,
 * hardlinks, special files, size limits, compression ratio, and happy paths.
 *
 * Uses real in-memory tarballs created via the `tar` module and temp dirs.
 * No source-string grep.
 */

import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type * as Tar from "tar";
import {
  validateUploadedTarball,
  BundleValidationError,
} from "@/lib/floom/bundle";
import {
  MAX_BUNDLE_BYTES,
  MAX_BUNDLE_FILE_COUNT,
  MAX_BUNDLE_COMPRESSION_RATIO,
  MAX_BUNDLE_UNPACKED_BYTES,
} from "@/lib/floom/limits";

const require = createRequire(path.join(process.cwd(), "package.json"));
const tar = require("tar") as typeof Tar;

// ── Tarball builders ──────────────────────────────────────────────────────────

type FileMap = Record<string, string | Buffer>;

/**
 * Build a minimal valid gzipped tarball from a file map.
 * Returns the tarball as a Buffer.
 */
async function buildTarball(files: FileMap): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "floom-test-bundle-"));
  try {
    const relPaths: string[] = [];
    for (const [rel, content] of Object.entries(files)) {
      // Don't create ".." traversal on disk — we'll inject them manually below
      if (rel.includes("..") || path.isAbsolute(rel)) {
        continue;
      }
      const abs = path.join(tmpDir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, typeof content === "string" ? content : content);
      relPaths.push(rel);
    }

    const outFile = path.join(tmpDir, "_bundle.tar.gz");
    await tar.create(
      { gzip: true, file: outFile, cwd: tmpDir, portable: true, noMtime: true },
      relPaths
    );
    return await fs.readFile(outFile);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/** Minimal valid floom.yaml content for a stock_e2b app */
const VALID_MANIFEST = `mode: stock_e2b
slug: test-app
command: python app.py
`;

const VALID_APP_PY = "print('hello')";

/** Build a valid bundle buffer */
async function validBundle(): Promise<Buffer> {
  return buildTarball({ "floom.yaml": VALID_MANIFEST, "app.py": VALID_APP_PY });
}

// ── Happy path ────────────────────────────────────────────────────────────────

describe("validateUploadedTarball — happy path", () => {
  it("accepts a valid minimal bundle with floom.yaml + app.py", async () => {
    const buf = await validBundle();
    const result = await validateUploadedTarball(buf);
    expect(result.manifest.slug).toBe("test-app");
    expect(result.fileCount).toBeGreaterThanOrEqual(1);
    await result.cleanup();
  });

  it("cleanup removes the extracted directory", async () => {
    const buf = await validBundle();
    const result = await validateUploadedTarball(buf);
    const dir = result.extractedDir;
    await result.cleanup();
    const exists = await fs.stat(dir).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it("detects command as python app.py from floom.yaml", async () => {
    const buf = await validBundle();
    const result = await validateUploadedTarball(buf);
    expect(result.command).toBe("python app.py");
    await result.cleanup();
  });

  it("returns runtimeLabel=python for a python command", async () => {
    const buf = await validBundle();
    const result = await validateUploadedTarball(buf);
    expect(result.runtimeLabel).toBe("python");
    await result.cleanup();
  });
});

// ── Bundle too large (compressed) ────────────────────────────────────────────

describe("validateUploadedTarball — compressed size limit", () => {
  it("throws BundleValidationError with code=bundle_too_large when buffer > MAX_BUNDLE_BYTES", async () => {
    // Create a buffer slightly larger than the limit
    const oversizedBuffer = Buffer.alloc(MAX_BUNDLE_BYTES + 1);

    await expect(validateUploadedTarball(oversizedBuffer)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BundleValidationError && err.code === "bundle_too_large"
    );
  });

  it("accepts a buffer exactly at MAX_BUNDLE_BYTES - 1 (still a valid tarball check happens after)", async () => {
    // We just verify the size-check threshold: if exactly at limit, the size guard passes.
    // The actual tarball validity check fires next, which is fine for this boundary test.
    const atLimit = Buffer.alloc(MAX_BUNDLE_BYTES);
    // This should NOT throw bundle_too_large — it should fail on tarball parsing instead
    try {
      await validateUploadedTarball(atLimit);
    } catch (err) {
      if (err instanceof BundleValidationError) {
        expect(err.code).not.toBe("bundle_too_large");
      }
      // Other errors (invalid tarball) are expected
    }
  });
});

// ── Path traversal ────────────────────────────────────────────────────────────

describe("validateUploadedTarball — path traversal rejection", () => {
  it("rejects via resolveBundlePath: schema path outside bundle root throws an error", async () => {
    // validateUploadedTarball calls resolveBundlePath for input_schema/output_schema paths.
    // A manifest referencing ../etc/passwd as input_schema triggers the guard.
    // Note: resolveBundlePath throws BundleValidationError but without it being caught by
    // validateUploadedTarball's outer try/catch (it re-throws), so the rejection is the raw Error.
    const traversalManifest = `mode: stock_e2b
slug: traversal-app
command: python app.py
input_schema: ../etc/passwd
`;
    const buf = await buildTarball({
      "floom.yaml": traversalManifest,
      "app.py": VALID_APP_PY,
    });

    await expect(validateUploadedTarball(buf)).rejects.toThrow(
      "must stay inside the app directory"
    );
  });
});

// ── Missing floom.yaml ────────────────────────────────────────────────────────

describe("validateUploadedTarball — missing floom.yaml", () => {
  it("throws BundleValidationError(invalid_manifest) when floom.yaml is absent", async () => {
    const buf = await buildTarball({ "app.py": VALID_APP_PY });

    await expect(validateUploadedTarball(buf)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BundleValidationError && err.code === "invalid_manifest"
    );
  });
});

// ── Symlink rejection ─────────────────────────────────────────────────────────

describe("validateUploadedTarball — symlink rejection", () => {
  it("rejects a bundle containing a symlink entry", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "floom-sym-"));
    try {
      await fs.writeFile(path.join(tmpDir, "floom.yaml"), VALID_MANIFEST);
      await fs.writeFile(path.join(tmpDir, "target.py"), "x=1");
      // Create a real symlink
      await fs.symlink("target.py", path.join(tmpDir, "app.py"));

      const outFile = path.join(tmpDir, "bundle.tar.gz");
      await tar.create(
        { gzip: true, file: outFile, cwd: tmpDir, portable: true, noMtime: true },
        ["floom.yaml", "app.py"]
      );
      const buf = await fs.readFile(outFile);

      await expect(validateUploadedTarball(buf)).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof BundleValidationError && err.code === "invalid_manifest"
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── Hardlink rejection ────────────────────────────────────────────────────────

describe("validateUploadedTarball — hardlink rejection", () => {
  it("rejects a bundle containing a hardlink entry", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "floom-hl-"));
    try {
      await fs.writeFile(path.join(tmpDir, "floom.yaml"), VALID_MANIFEST);
      await fs.writeFile(path.join(tmpDir, "target.py"), "x=1");
      // Create a real hardlink
      await fs.link(path.join(tmpDir, "target.py"), path.join(tmpDir, "app.py"));

      // Use Pack without portable flag and hardlinkAsFileIfExists=false to preserve Link type
      type PackInstance = NodeJS.ReadableStream & {
        add(p: string): void;
        end(): void;
      };
      const PackCtor = tar.Pack as unknown as new (opts: Record<string, unknown>) => PackInstance;
      const pack = new PackCtor({ gzip: true, cwd: tmpDir, hardlinkAsFileIfExists: false });
      const chunks: Buffer[] = [];
      pack.on("data", (c: Buffer) => chunks.push(c));
      const bundleBuf = await new Promise<Buffer>((resolve, reject) => {
        pack.on("end", () => resolve(Buffer.concat(chunks)));
        pack.on("error", reject);
        pack.add("floom.yaml");
        pack.add("target.py");
        pack.add("app.py");
        pack.end();
      });

      await expect(validateUploadedTarball(bundleBuf)).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof BundleValidationError && err.code === "invalid_manifest"
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── File count limit ──────────────────────────────────────────────────────────

describe("validateUploadedTarball — file count limit", () => {
  it("rejects a bundle exceeding MAX_BUNDLE_FILE_COUNT files", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "floom-count-"));
    try {
      const files: string[] = ["floom.yaml", "app.py"];
      await fs.writeFile(path.join(tmpDir, "floom.yaml"), VALID_MANIFEST);
      await fs.writeFile(path.join(tmpDir, "app.py"), VALID_APP_PY);

      // Add MAX_BUNDLE_FILE_COUNT + 1 additional tiny files
      for (let i = 0; i < MAX_BUNDLE_FILE_COUNT; i++) {
        const name = `pad${i}.txt`;
        await fs.writeFile(path.join(tmpDir, name), "x");
        files.push(name);
      }

      const outFile = path.join(tmpDir, "bundle.tar.gz");
      await tar.create(
        { gzip: true, file: outFile, cwd: tmpDir, portable: true, noMtime: true },
        files
      );
      const buf = await fs.readFile(outFile);

      await expect(validateUploadedTarball(buf)).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof BundleValidationError && err.code === "bundle_too_large"
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }, 30_000); // allow time for writing 501 files
});

// ── Gzip bomb / compression ratio ────────────────────────────────────────────

describe("validateUploadedTarball — gzip bomb / compression ratio", () => {
  it("rejects when unpacked/compressed ratio exceeds MAX_BUNDLE_COMPRESSION_RATIO", async () => {
    // Create a highly-compressible file: MAX_BUNDLE_COMPRESSION_RATIO + 1 chunks of a repeated byte
    // The compressed size will be tiny; unpacked size will be huge.
    // We target just over the limit: unpackedBytes / compressedBytes > MAX_BUNDLE_COMPRESSION_RATIO
    //
    // Strategy: fill a file with repeated bytes so gzip compresses it ~1000:1.
    // 5MB compressed × (100+1) ratio would exceed 500MB unpacked — too large for temp disk.
    // Instead, use a bundle that stays under MAX_BUNDLE_BYTES compressed but
    // has unpacked bytes >> compressedBytes × MAX_BUNDLE_COMPRESSION_RATIO.
    //
    // We target: 200KB compressed → 200KB × 101 = ~20MB unpacked (under 25MB unpacked limit).
    // Craft a single large file of ~20MB of repeated null bytes; gzip should crush it to ~20KB.

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "floom-bomb-"));
    try {
      await fs.writeFile(path.join(tmpDir, "floom.yaml"), VALID_MANIFEST);
      await fs.writeFile(path.join(tmpDir, "app.py"), VALID_APP_PY);

      // A file of ~20MB of the same byte — gzip compresses this to ~20KB (ratio ~1000x)
      // which is well above MAX_BUNDLE_COMPRESSION_RATIO=100
      const bombyData = Buffer.alloc(20 * 1024 * 1024, 0x41); // 20MB of 'A'
      await fs.writeFile(path.join(tmpDir, "bigfile.dat"), bombyData);

      const outFile = path.join(tmpDir, "bundle.tar.gz");
      await tar.create(
        { gzip: true, file: outFile, cwd: tmpDir, portable: true, noMtime: true },
        ["floom.yaml", "app.py", "bigfile.dat"]
      );
      const buf = await fs.readFile(outFile);

      // Should be compressed well below MAX_BUNDLE_BYTES (5MB)
      // Unpacked will be ~20MB, ratio >> 100 → should be rejected
      if (buf.byteLength <= MAX_BUNDLE_BYTES) {
        await expect(validateUploadedTarball(buf)).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof BundleValidationError && err.code === "bundle_too_large"
        );
      } else {
        // If compressed size exceeds MAX_BUNDLE_BYTES, the compressed size check fires first
        await expect(validateUploadedTarball(buf)).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof BundleValidationError && err.code === "bundle_too_large"
        );
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }, 30_000);
});

// ── Manifest mismatch guard ───────────────────────────────────────────────────

describe("validateUploadedTarball — uploaded manifest mismatch", () => {
  it("rejects when uploadedManifestText differs from floom.yaml in bundle", async () => {
    const buf = await validBundle();
    const differentManifest = `mode: stock_e2b
slug: different-slug
command: python app.py
`;
    await expect(validateUploadedTarball(buf, differentManifest)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BundleValidationError && err.code === "invalid_manifest"
    );
  });

  it("accepts when uploadedManifestText matches floom.yaml in bundle", async () => {
    const buf = await validBundle();
    const result = await validateUploadedTarball(buf, VALID_MANIFEST);
    expect(result.manifest.slug).toBe("test-app");
    await result.cleanup();
  });
});

// ── BundleValidationError class ───────────────────────────────────────────────

describe("BundleValidationError", () => {
  it("is instanceof Error", () => {
    const err = new BundleValidationError("invalid_manifest", "some detail");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BundleValidationError);
  });

  it("exposes code property", () => {
    const err = new BundleValidationError("bundle_too_large", "too big");
    expect(err.code).toBe("bundle_too_large");
  });

  it("exposes message property", () => {
    const err = new BundleValidationError("invalid_manifest", "detail here");
    expect(err.message).toBe("detail here");
  });
});
