import { readFile } from "node:fs/promises";
import path from "node:path";
import { collectBundleFiles } from "../e2b/bundle.mjs";
import { assertJsonSchema } from "../e2b/schema.mjs";
import { getDependencyRuntimeCommand, runDependencyInstallCommands } from "./dependencies.mjs";
import { failedRunResult, okRunResult } from "./result.mjs";

export class E2BRunner {
  constructor({ sdkLoader = defaultSdkLoader, now = () => Date.now() } = {}) {
    this.mode = "e2b";
    this.sdkLoader = sdkLoader;
    this.now = now;
  }

  async run(bundle, input) {
    const startedAt = this.now();
    assertJsonSchema(bundle.inputSchema, input, "input");

    const sdk = await this.sdkLoader();
    const Sandbox = sdk.Sandbox ?? sdk.CodeInterpreter;
    if (!Sandbox) {
      throw new Error("E2B SDK does not expose Sandbox or CodeInterpreter");
    }

    const sandbox = await createSandbox(Sandbox);
    try {
      await uploadBundle(sandbox, bundle);
      const installTimeoutMs = 60_000;
      const installFailure = await runDependencyInstallCommands(bundle, (command) =>
        runInSandbox(sandbox, `cd /home/user/app && ${command}`, "", {
          timeoutMs: installTimeoutMs,
        }),
      );
      if (installFailure) {
        const durationMs = Math.max(0, this.now() - startedAt);
        return failedRunResult({
          mode: this.mode,
          error: `E2B runner dependency install failed for ${installFailure.command}`,
          logs: installFailure.result.logs,
          durationMs,
        });
      }

      const command = `cd /home/user/app && ${getDependencyRuntimeCommand(bundle)}`;
      const result = await runInSandbox(sandbox, command, JSON.stringify(input), {
        timeoutMs: bundle.manifest.runner?.timeoutMs ?? 10_000,
      });
      const durationMs = Math.max(0, this.now() - startedAt);

      if (result.exitCode !== 0) {
        return failedRunResult({
          mode: this.mode,
          error: `E2B runner exited with code ${result.exitCode}`,
          logs: result.logs,
          durationMs,
        });
      }

      const output = JSON.parse(result.stdout.trim());
      assertJsonSchema(bundle.outputSchema, output, "output");
      return okRunResult({
        mode: this.mode,
        output,
        logs: result.logs,
        durationMs,
      });
    } finally {
      if (typeof sandbox.kill === "function") {
        await sandbox.kill();
      }
    }
  }
}

async function defaultSdkLoader() {
  const runtimeImport = new Function("specifier", "return import(specifier)");
  try {
    return await runtimeImport("e2b");
  } catch (firstError) {
    try {
      return await runtimeImport("@e2b/code-interpreter");
    } catch {
      throw new Error(
        `E2B SDK is not installed. Install e2b or @e2b/code-interpreter to use runner mode "e2b". Original error: ${firstError.message}`,
      );
    }
  }
}

async function createSandbox(Sandbox) {
  if (typeof Sandbox.create === "function") {
    return Sandbox.create();
  }
  return new Sandbox();
}

async function uploadBundle(sandbox, bundle) {
  const files = await collectBundleFiles(bundle.rootDir);
  await ensureDirectory(sandbox, "/home/user/app");

  for (const file of files) {
    const sourcePath = path.join(bundle.rootDir, file.path);
    const targetPath = `/home/user/app/${file.path}`;
    await ensureDirectory(sandbox, path.posix.dirname(targetPath));
    await writeFile(sandbox, targetPath, await readFile(sourcePath, "utf8"));
  }
}

async function ensureDirectory(sandbox, targetPath) {
  if (targetPath === "." || targetPath === "/") return;
  if (sandbox.files?.makeDir) {
    await sandbox.files.makeDir(targetPath);
  } else if (sandbox.filesystem?.makeDir) {
    await sandbox.filesystem.makeDir(targetPath);
  } else {
    await runInSandbox(sandbox, `mkdir -p ${shellQuote(targetPath)}`, "", { timeoutMs: 5_000 });
  }
}

async function writeFile(sandbox, targetPath, content) {
  if (sandbox.files?.write) {
    await sandbox.files.write(targetPath, content);
  } else if (sandbox.filesystem?.write) {
    await sandbox.filesystem.write(targetPath, content);
  } else {
    const encoded = Buffer.from(content).toString("base64");
    await runInSandbox(
      sandbox,
      `base64 -d > ${shellQuote(targetPath)} <<'EOF'\n${encoded}\nEOF`,
      "",
      { timeoutMs: 5_000 },
    );
  }
}

async function runInSandbox(sandbox, command, stdin, { timeoutMs }) {
  if (sandbox.commands?.run) {
    const result = await sandbox.commands.run(command, { stdin, timeoutMs });
    return normalizeCommandResult(result);
  }
  if (typeof sandbox.runCode === "function") {
    const code = [
      "import json, subprocess, sys",
      `payload = ${JSON.stringify(stdin)}`,
      `proc = subprocess.run(${JSON.stringify(command)}, input=payload, text=True, shell=True, capture_output=True, timeout=${Math.ceil(timeoutMs / 1000)})`,
      "print(json.dumps({'exitCode': proc.returncode, 'stdout': proc.stdout, 'stderr': proc.stderr}))",
    ].join("\n");
    const result = await sandbox.runCode(code);
    const text = result.text ?? result.results?.[0]?.text;
    if (!text) {
      throw new Error("E2B runCode fallback did not return command result JSON");
    }
    try {
      return normalizeCommandResult(JSON.parse(text));
    } catch (error) {
      throw new Error(`E2B runCode fallback returned malformed command result JSON: ${error.message}`);
    }
  }
  throw new Error("E2B sandbox does not expose a supported command execution API");
}

function normalizeCommandResult(result) {
  const exitCode = result.exitCode ?? result.exit_code ?? 0;
  const stdout = result.stdout ?? result.text ?? "";
  const stderr = result.stderr ?? result.error ?? "";
  return {
    exitCode,
    stdout,
    stderr,
    logs: [stderr].filter(Boolean).join("\n"),
  };
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
