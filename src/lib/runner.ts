import { Sandbox } from "e2b";
import { isSafePythonEntrypoint, isSafePythonIdentifier } from "./manifest";

export interface RunnerResult {
  output: Record<string, unknown>;
  error?: string;
}

const FAKE_MODE = !process.env.E2B_API_KEY;

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function runInSandbox(
  source: string,
  inputs: Record<string, unknown>,
  runtime: "python",
  entrypoint: string,
  handler: string
): Promise<RunnerResult> {
  if (FAKE_MODE) {
    console.log("[FAKE MODE] No E2B_API_KEY set. Returning mock output.");
    return { output: { result: "hello from fake mode", inputs } };
  }

  if (runtime !== "python") {
    return { output: {}, error: "v0 only supports runtime: python" };
  }

  if (!isSafePythonEntrypoint(entrypoint) || !isSafePythonIdentifier(handler)) {
    return { output: {}, error: "Invalid app entrypoint or handler" };
  }

  const sbx = await Sandbox.create("base", {
    apiKey: process.env.E2B_API_KEY,
  });

  try {
    await sbx.files.write(`/home/user/${entrypoint}`, source);

    const moduleName = entrypoint.replace(".py", "");
    const wrapper = `
import json
import sys
sys.path.insert(0, "/home/user")
from ${moduleName} import ${handler}

inputs = json.loads(open("/home/user/inputs.json").read())
result = ${handler}(inputs)
print(json.dumps(result))
`;

    await sbx.files.write("/home/user/runner.py", wrapper);
    await sbx.files.write("/home/user/inputs.json", JSON.stringify(inputs));

    const result = await sbx.commands.run("python3 /home/user/runner.py");
    const output = JSON.parse(result.stdout);
    return { output };
  } catch (err: unknown) {
    const commandError = err as { stdout?: unknown; stderr?: unknown };
    let errorMsg = errorMessage(err);
    if (commandError.stdout) errorMsg += `\nSTDOUT: ${String(commandError.stdout)}`;
    if (commandError.stderr) errorMsg += `\nSTDERR: ${String(commandError.stderr)}`;
    return { output: {}, error: errorMsg };
  } finally {
    await sbx.kill();
  }
}
