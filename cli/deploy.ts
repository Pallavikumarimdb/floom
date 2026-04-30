import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import FormData from "form-data";
import fetch from "node-fetch";
import { parseManifest } from "../src/lib/floom/manifest";
import { MAX_SCHEMA_BYTES, MAX_SOURCE_BYTES } from "../src/lib/floom/limits";
import { parseAndValidateJsonSchemaText } from "../src/lib/floom/schema";

type DeployResponse = {
  app?: {
    url?: string;
  };
  error?: string;
};

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

  const inputSchemaResult = parseAndValidateJsonSchemaText(
    fs.readFileSync(inputSchemaPath, "utf8"),
    "input_schema"
  );
  if (!inputSchemaResult.ok) throw new Error(inputSchemaResult.error);

  const outputSchemaResult = parseAndValidateJsonSchemaText(
    fs.readFileSync(outputSchemaPath, "utf8"),
    "output_schema"
  );
  if (!outputSchemaResult.ok) throw new Error(outputSchemaResult.error);

  const entrypointPath = path.join(appDir, manifest.entrypoint);
  if (!fs.existsSync(entrypointPath)) throw new Error("Entrypoint not found");
  if (fs.statSync(entrypointPath).size > MAX_SOURCE_BYTES) throw new Error("Entrypoint is too large");
  if (fs.statSync(manifestPath).size > MAX_SCHEMA_BYTES) throw new Error("Manifest is too large");
  if (fs.statSync(inputSchemaPath).size > MAX_SCHEMA_BYTES) throw new Error("Input schema is too large");
  if (fs.statSync(outputSchemaPath).size > MAX_SCHEMA_BYTES) throw new Error("Output schema is too large");

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
