import { Sandbox } from "e2b";

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
  codeBundle: string,
  inputs: Record<string, unknown>,
  runtime: "python" | "typescript",
  entrypoint: string,
  handler: string,
  dependencies: Record<string, string[]>
): Promise<RunnerResult> {
  if (FAKE_MODE) {
    console.log("[FAKE MODE] No E2B_API_KEY set. Returning mock output.");
    return { output: { result: "hello from fake mode", inputs } };
  }

  const sbx = await Sandbox.create("base", {
    apiKey: process.env.E2B_API_KEY,
  });

  try {
    // Upload bundle
    await sbx.files.write(`/home/user/${entrypoint}`, codeBundle);

    // Install dependencies
    if (runtime === "python" && dependencies.python && dependencies.python.length > 0) {
      await sbx.commands.run(`pip install ${dependencies.python.join(" ")}`);
    } else if (runtime === "typescript" && dependencies.typescript && dependencies.typescript.length > 0) {
      await sbx.commands.run(`npm install ${dependencies.typescript.join(" ")}`);
    }

    // Write wrapper server
    const wrapper = runtime === "python" ? `
import json
import sys
sys.path.insert(0, "/home/user")
from ${entrypoint.replace(".py", "")} import ${handler}

inputs = json.loads(open("/home/user/inputs.json").read())
result = ${handler}(inputs)
print(json.dumps(result))
` : `
import { ${handler} } from "./${entrypoint.replace(".ts", "")}";
const inputs = JSON.parse(require("fs").readFileSync("/home/user/inputs.json", "utf8"));
${handler}(inputs).then((result: any) => {
  console.log(JSON.stringify(result));
  process.exit(0);
});
`;

    const wrapperPath = runtime === "python" ? "/home/user/runner.py" : "/home/user/runner.ts";
    await sbx.files.write(wrapperPath, wrapper);
    await sbx.files.write("/home/user/inputs.json", JSON.stringify(inputs));

    const cmd = runtime === "python" ? "python3 /home/user/runner.py" : "npx tsx /home/user/runner.ts";
    const result = await sbx.commands.run(cmd);
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
