import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import FormData from "form-data";
import fetch from "node-fetch";

type FloomManifest = {
  name: string;
  slug: string;
  runtime: "python" | "typescript";
  entrypoint: string;
  handler: string;
  input_schema?: string;
  output_schema?: string;
};

type DeployResponse = {
  app?: {
    url?: string;
  };
  error?: string;
};

function parseManifest(value: unknown): FloomManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("floom.yaml must contain an object");
  }

  const manifest = value as Partial<FloomManifest>;
  const required: Array<keyof FloomManifest> = ["name", "slug", "runtime", "entrypoint", "handler"];
  for (const key of required) {
    if (!manifest[key]) throw new Error(`Missing ${key} in floom.yaml`);
  }

  if (manifest.runtime !== "python" && manifest.runtime !== "typescript") {
    throw new Error("runtime must be python or typescript");
  }

  return manifest as FloomManifest;
}

async function deploy(appDir: string, apiUrl: string, token: string) {
  const manifestPath = path.join(appDir, "floom.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("floom.yaml not found in " + appDir);
  }

  const manifest = parseManifest(yaml.load(fs.readFileSync(manifestPath, "utf8")));

  // Validate schemas
  const inputSchemaPath = path.join(appDir, manifest.input_schema || "input.schema.json");
  const outputSchemaPath = path.join(appDir, manifest.output_schema || "output.schema.json");

  if (!fs.existsSync(inputSchemaPath)) throw new Error("Input schema not found");
  if (!fs.existsSync(outputSchemaPath)) throw new Error("Output schema not found");

  JSON.parse(fs.readFileSync(inputSchemaPath, "utf8"));
  JSON.parse(fs.readFileSync(outputSchemaPath, "utf8"));

  // Create bundle zip (simplified: just the entrypoint for now)
  const entrypointPath = path.join(appDir, manifest.entrypoint);
  if (!fs.existsSync(entrypointPath)) throw new Error("Entrypoint not found");

  // Build form data
  const form = new FormData();
  form.append("manifest", fs.createReadStream(manifestPath), { filename: "floom.yaml" });
  form.append("bundle", fs.createReadStream(entrypointPath), { filename: manifest.entrypoint });
  form.append("input_schema", fs.createReadStream(inputSchemaPath), { filename: "input.schema.json" });
  form.append("output_schema", fs.createReadStream(outputSchemaPath), { filename: "output.schema.json" });

  const res = await fetch(`${apiUrl}/api/apps`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  const data = (await res.json()) as DeployResponse;
  if (!res.ok) throw new Error(data.error || "Deploy failed");

  console.log("Deployed successfully!");
  console.log("URL:", data.app?.url);
  return data;
}

const [,, appDir, apiUrl, token] = process.argv;
if (!appDir || !apiUrl || !token) {
  console.error("Usage: tsx cli/deploy.ts <app-dir> <api-url> <auth-token>");
  process.exit(1);
}

deploy(appDir, apiUrl, token).catch((err) => {
  console.error("Deploy failed:", err.message);
  process.exit(1);
});
