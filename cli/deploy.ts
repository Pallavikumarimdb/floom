import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import FormData from "form-data";
import fetch from "node-fetch";
import { createBundleFromDirectory, validateUploadedTarball } from "../src/lib/floom/bundle";
import { MAX_BUNDLE_BYTES, MAX_SCHEMA_BYTES } from "../src/lib/floom/limits";
import { parseManifest } from "../src/lib/floom/manifest";

type DeployResponse = {
  app?: {
    url?: string;
  };
  warnings?: string[];
  error?: string;
  detail?: string;
};

async function deploy(appDir: string, apiUrl: string, token: string) {
  const rootDir = path.resolve(appDir);
  const manifestPath = path.join(rootDir, "floom.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("floom.yaml not found in " + appDir);
  }

  if (fs.statSync(manifestPath).size > MAX_SCHEMA_BYTES) {
    throw new Error("Manifest is too large");
  }

  const manifestText = fs.readFileSync(manifestPath, "utf8");
  parseManifest(yaml.load(manifestText));

  const bundle = await createBundleFromDirectory(rootDir);
  if (bundle.compressedBytes > MAX_BUNDLE_BYTES) {
    throw new Error("bundle too large after default exclusions; trim your dependencies or split the app");
  }

  const validated = await validateUploadedTarball(bundle.buffer, manifestText);
  await validated.cleanup();

  const form = new FormData();
  form.append("manifest", Buffer.from(manifestText, "utf8"), {
    filename: "floom.yaml",
    contentType: "application/x-yaml",
  });
  form.append("bundle", bundle.buffer, {
    filename: "bundle.tar.gz",
    contentType: "application/gzip",
  });

  const res = await fetch(`${apiUrl}/api/apps`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  const data = (await res.json()) as DeployResponse;
  if (!res.ok) {
    throw new Error(data.detail || data.error || "Deploy failed");
  }

  console.log("Deployed successfully!");
  console.log("URL:", data.app?.url);
  if (data.warnings?.length) {
    console.log("Warnings:");
    for (const warning of data.warnings) {
      console.log(`- ${warning}`);
    }
  }
  return data;
}

const [, , appDirArg, apiUrlArg, tokenArg] = process.argv;
const appDir = appDirArg;
const apiUrl = apiUrlArg || process.env.FLOOM_API_URL || "https://floom.dev";
const token = tokenArg || process.env.FLOOM_TOKEN;

if (!appDir || !apiUrl || !token) {
  console.error("Usage: FLOOM_TOKEN=<token> FLOOM_API_URL=<url> tsx cli/deploy.ts <app-dir>");
  process.exit(1);
}

deploy(appDir, apiUrl, token).catch((err) => {
  console.error("Deploy failed:", err.message);
  process.exit(1);
});
