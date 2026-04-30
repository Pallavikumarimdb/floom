import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import FormData from "form-data";
import fetch from "node-fetch";
import { parseManifest, validatePythonSourceForManifest } from "../src/lib/floom/manifest";
import { MAX_REQUIREMENTS_BYTES, MAX_SCHEMA_BYTES, MAX_SOURCE_BYTES } from "../src/lib/floom/limits";
import { validatePythonRequirementsText } from "../src/lib/floom/requirements";
import { parseAndValidateJsonSchemaText } from "../src/lib/floom/schema";

type DeployResponse = {
  app?: {
    url?: string;
  };
  error?: string;
};

async function deploy(appDir: string, apiUrl: string, token: string) {
  const rootDir = path.resolve(appDir);
  const manifestPath = path.join(appDir, "floom.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("floom.yaml not found in " + appDir);
  }

  const manifest = parseManifest(yaml.load(fs.readFileSync(manifestPath, "utf8")));
  validateAppDirectory(rootDir, Boolean(manifest.dependencies?.python));

  // Validate schemas
  const inputSchemaPath = resolveAppPath(rootDir, manifest.input_schema || "input.schema.json");
  const outputSchemaPath = resolveAppPath(rootDir, manifest.output_schema || "output.schema.json");

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

  const entrypointPath = resolveAppPath(rootDir, manifest.entrypoint);
  const requirementsPath = manifest.dependencies?.python
    ? resolveAppPath(rootDir, manifest.dependencies.python)
    : null;
  if (!fs.existsSync(entrypointPath)) throw new Error("Entrypoint not found");
  if (requirementsPath && !fs.existsSync(requirementsPath)) throw new Error("requirements.txt not found");
  if (fs.statSync(entrypointPath).size > MAX_SOURCE_BYTES) throw new Error("Entrypoint is too large");
  if (requirementsPath && fs.statSync(requirementsPath).size > MAX_REQUIREMENTS_BYTES) {
    throw new Error("requirements.txt is too large");
  }
  if (fs.statSync(manifestPath).size > MAX_SCHEMA_BYTES) throw new Error("Manifest is too large");
  if (fs.statSync(inputSchemaPath).size > MAX_SCHEMA_BYTES) throw new Error("Input schema is too large");
  if (fs.statSync(outputSchemaPath).size > MAX_SCHEMA_BYTES) throw new Error("Output schema is too large");
  validatePythonSourceForManifest(fs.readFileSync(entrypointPath, "utf8"), manifest);
  if (requirementsPath) {
    validatePythonRequirementsText(fs.readFileSync(requirementsPath, "utf8"));
  }

  const form = new FormData();
  form.append("manifest", fs.createReadStream(manifestPath), { filename: "floom.yaml" });
  form.append("bundle", fs.createReadStream(entrypointPath), { filename: manifest.entrypoint });
  form.append("input_schema", fs.createReadStream(inputSchemaPath), { filename: "input.schema.json" });
  form.append("output_schema", fs.createReadStream(outputSchemaPath), { filename: "output.schema.json" });
  if (requirementsPath) {
    form.append("requirements", fs.createReadStream(requirementsPath), { filename: "requirements.txt" });
  }

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

function validateAppDirectory(rootDir: string, allowRequirements: boolean) {
  const unsupportedFiles = ["pyproject.toml", "package.json", "openapi.json"];
  for (const fileName of unsupportedFiles) {
    if (fs.existsSync(path.join(rootDir, fileName))) {
      throw new Error(`${fileName} is not supported in this runtime; use a Python function app`);
    }
  }

  if (!allowRequirements && fs.existsSync(path.join(rootDir, "requirements.txt"))) {
    throw new Error("requirements.txt requires dependencies.python: ./requirements.txt in floom.yaml");
  }

  const pythonFiles = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".py"))
    .map((entry) => entry.name);
  if (pythonFiles.length > 1) {
    throw new Error(`v0 supports exactly one Python source file; found ${pythonFiles.join(", ")}`);
  }
}

function resolveAppPath(rootDir: string, relativePath: string) {
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
    throw new Error(`${relativePath} must stay inside the app directory`);
  }
  return resolved;
}

const [,, appDirArg, apiUrlArg, tokenArg] = process.argv;
const appDir = appDirArg;
const apiUrl = apiUrlArg || process.env.FLOOM_API_URL || "https://floom-60sec.vercel.app";
const token = tokenArg || process.env.FLOOM_TOKEN;

if (!appDir || !apiUrl || !token) {
  console.error("Usage: FLOOM_TOKEN=<token> FLOOM_API_URL=<url> tsx cli/deploy.ts <app-dir>");
  process.exit(1);
}

deploy(appDir, apiUrl, token).catch((err) => {
  console.error("Deploy failed:", err.message);
  process.exit(1);
});
