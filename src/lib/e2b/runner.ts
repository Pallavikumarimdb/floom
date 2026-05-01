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
    return { output: {}, error: "v0.1 only supports runtime: python" };
  }

  if (!isSafePythonEntrypoint(entrypoint) || !isSafePythonIdentifier(handler)) {
    return { output: {}, error: "Invalid app entrypoint or handler" };
  }

  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    return { output: {}, error: "App source is too large" };
  }

  const hasPythonRequirements = Boolean(dependencies.python_requirements?.trim());
  const hasRuntimeSecrets = Object.keys(secrets).length > 0;
  let installSbx: Awaited<ReturnType<typeof Sandbox.create>> | null = null;
  let runSbx: Awaited<ReturnType<typeof Sandbox.create>> | null = null;

  try {
    let dependencyArchive: Uint8Array | null = null;
    if (hasPythonRequirements && hasRuntimeSecrets && dependencies.python_requirements) {
      installSbx = await Sandbox.create("base", sandboxOptions({ allowInternetAccess: true }));
      await installSbx.files.write("/home/user/requirements.txt", dependencies.python_requirements);
      await installSbx.commands.run(
        "python3 -m pip install --disable-pip-version-check --no-input --require-hashes --target /home/user/.deps -r /home/user/requirements.txt",
        {
          timeoutMs: COMMAND_TIMEOUT_MS,
          requestTimeoutMs: REQUEST_TIMEOUT_MS,
        }
      );
      await installSbx.commands.run("tar -C /home/user -czf /home/user/deps.tgz .deps", {
        timeoutMs: COMMAND_TIMEOUT_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
      });
      dependencyArchive = await installSbx.files.read("/home/user/deps.tgz", {
        format: "bytes",
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
      });
    }

    runSbx = await Sandbox.create(
      "base",
      sandboxOptions({ allowInternetAccess: hasPythonRequirements && !hasRuntimeSecrets })
    );

    await runSbx.files.write(`/home/user/${entrypoint}`, source);
    if (dependencyArchive) {
      await runSbx.files.write("/home/user/deps.tgz", toArrayBuffer(dependencyArchive));
      await runSbx.commands.run("tar -C /home/user -xzf /home/user/deps.tgz", {
        timeoutMs: COMMAND_TIMEOUT_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
      });
    } else if (hasPythonRequirements && dependencies.python_requirements) {
      await runSbx.files.write("/home/user/requirements.txt", dependencies.python_requirements);
      await runSbx.commands.run(
        "python3 -m pip install --disable-pip-version-check --no-input --require-hashes --target /home/user/.deps -r /home/user/requirements.txt",
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

    await runSbx.files.write("/home/user/runner.py", wrapper);
    await runSbx.files.write("/home/user/inputs.json", JSON.stringify(inputs));

    await runSbx.commands.run("python3 /home/user/runner.py", {
      timeoutMs: COMMAND_TIMEOUT_MS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      envs: secrets,
    });
    const outputText = await runSbx.files.read("/home/user/output.json", {
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
    await installSbx?.kill().catch(() => undefined);
    await runSbx?.kill().catch(() => undefined);
  }
}

function sandboxOptions({ allowInternetAccess }: { allowInternetAccess: boolean }) {
  return {
    apiKey: process.env.E2B_API_KEY,
    allowInternetAccess,
    secure: true,
    timeoutMs: SANDBOX_TIMEOUT_MS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    lifecycle: { onTimeout: "kill" },
  } as const;
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
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
