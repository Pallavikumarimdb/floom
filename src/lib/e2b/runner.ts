import { Sandbox } from "e2b";
import { isSafePythonEntrypoint, isSafePythonIdentifier } from "../floom/manifest";
import type { RuntimeDependencies } from "../floom/requirements";
import type { RuntimeSecrets } from "../floom/runtime-secrets";
import {
  COMMAND_TIMEOUT_MS,
  MAX_OUTPUT_BYTES,
  MAX_SOURCE_BYTES,
  REQUEST_TIMEOUT_MS,
  SANDBOX_TIMEOUT_MS,
} from "../floom/limits";

export interface RunnerResult {
  output: Record<string, unknown>;
  error?: string;
}

type SandboxRunner = typeof runInSandbox;

export async function runInSandbox(
  source: string,
  inputs: Record<string, unknown>,
  runtime: "python",
  entrypoint: string,
  handler: string,
  dependencies: RuntimeDependencies = {},
  secrets: RuntimeSecrets = {}
): Promise<RunnerResult> {
  if (!process.env.E2B_API_KEY) {
    if (!isExplicitFakeMode()) {
      return { output: {}, error: "E2B execution is not configured" };
    }

    return { output: { result: "hello from fake mode", inputs } };
  }

  if (runtime !== "python") {
    return { output: {}, error: "v0 only supports runtime: python" };
  }

  if (!isSafePythonEntrypoint(entrypoint) || !isSafePythonIdentifier(handler)) {
    return { output: {}, error: "Invalid app entrypoint or handler" };
  }

  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    return { output: {}, error: "App source is too large" };
  }

  let sbx: Awaited<ReturnType<typeof Sandbox.create>> | null = null;
  const hasPythonRequirements = Boolean(dependencies.python_requirements?.trim());

  try {
    sbx = await Sandbox.create("base", {
      apiKey: process.env.E2B_API_KEY,
      allowInternetAccess: hasPythonRequirements,
      secure: true,
      timeoutMs: SANDBOX_TIMEOUT_MS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      lifecycle: { onTimeout: "kill" },
    });

    await sbx.files.write(`/home/user/${entrypoint}`, source);
    if (hasPythonRequirements && dependencies.python_requirements) {
      await sbx.files.write("/home/user/requirements.txt", dependencies.python_requirements);
      await sbx.commands.run(
        "python3 -m pip install --disable-pip-version-check --no-input --target /home/user/.deps -r /home/user/requirements.txt",
        {
          timeoutMs: COMMAND_TIMEOUT_MS,
          requestTimeoutMs: REQUEST_TIMEOUT_MS,
        }
      );
    }

    const moduleName = entrypoint.replace(".py", "");
    const wrapper = `
import json
import sys
sys.path.insert(0, "/home/user")
sys.path.insert(0, "/home/user/.deps")
from ${moduleName} import ${handler}

inputs = json.loads(open("/home/user/inputs.json").read())
result = ${handler}(inputs)
with open("/home/user/output.json", "w") as handle:
    json.dump(result, handle)
`;

    await sbx.files.write("/home/user/runner.py", wrapper);
    await sbx.files.write("/home/user/inputs.json", JSON.stringify(inputs));

    await sbx.commands.run("python3 /home/user/runner.py", {
      timeoutMs: COMMAND_TIMEOUT_MS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      envs: secrets,
    });
    const outputText = await sbx.files.read("/home/user/output.json", {
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    });
    if (Buffer.byteLength(outputText, "utf8") > MAX_OUTPUT_BYTES) {
      return { output: {}, error: "App output is too large" };
    }
    const output = JSON.parse(outputText);
    if (!output || typeof output !== "object" || Array.isArray(output)) {
      return { output: {}, error: "App output must be a JSON object" };
    }
    return { output };
  } catch {
    return { output: {}, error: "App execution failed" };
  } finally {
    await sbx?.kill().catch(() => undefined);
  }
}

export async function runInSandboxContained(
  source: string,
  inputs: Record<string, unknown>,
  runtime: "python",
  entrypoint: string,
  handler: string,
  dependencies: RuntimeDependencies = {},
  secrets: RuntimeSecrets = {},
  runner: SandboxRunner = runInSandbox
): Promise<RunnerResult> {
  try {
    return await runner(source, inputs, runtime, entrypoint, handler, dependencies, secrets);
  } catch {
    return { output: {}, error: "App execution failed" };
  }
}

function isExplicitFakeMode() {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return (
    process.env.FLOOM_EXECUTION_MODE === "fake" ||
    process.env.FLOOM_FAKE_E2B === "1" ||
    process.env.NODE_ENV === "test"
  );
}
