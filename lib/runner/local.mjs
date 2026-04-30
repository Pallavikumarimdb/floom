import { spawn } from "node:child_process";
import { assertJsonSchema } from "../e2b/schema.mjs";
import { getDependencyRuntimeCommand, runDependencyInstallCommands } from "./dependencies.mjs";
import { failedRunResult, okRunResult } from "./result.mjs";

export class LocalRunner {
  constructor({ now = () => Date.now(), commandRunner = runCommand } = {}) {
    this.mode = "local";
    this.now = now;
    this.commandRunner = commandRunner;
  }

  async run(bundle, input) {
    const startedAt = this.now();
    assertJsonSchema(bundle.inputSchema, input, "input");

    const timeoutMs = bundle.manifest.runner?.timeoutMs ?? 10_000;
    const execute = (command, commandInput = input) =>
      this.commandRunner(command, {
        cwd: bundle.rootDir,
        input: commandInput,
        timeoutMs,
      });

    const installFailure = await runDependencyInstallCommands(bundle, (command) =>
      execute(command, ""),
    );
    if (installFailure) {
      const durationMs = Math.max(0, this.now() - startedAt);
      return failedRunResult({
        mode: this.mode,
        error: `Local runner dependency install failed for ${installFailure.command}`,
        logs: installFailure.result.logs,
        durationMs,
      });
    }

    const result = await execute(getDependencyRuntimeCommand(bundle));
    const durationMs = Math.max(0, this.now() - startedAt);

    if (result.exitCode !== 0) {
      return failedRunResult({
        mode: this.mode,
        error: `Local runner exited with code ${result.exitCode}`,
        logs: result.logs,
        durationMs,
      });
    }

    let output;
    try {
      output = JSON.parse(result.stdout.trim());
    } catch (error) {
      return failedRunResult({
        mode: this.mode,
        error: `Local runner did not emit valid JSON: ${error.message}`,
        logs: result.logs,
        durationMs,
      });
    }

    assertJsonSchema(bundle.outputSchema, output, "output");
    return okRunResult({
      mode: this.mode,
      output,
      logs: result.logs,
      durationMs,
    });
  }
}

function runCommand(command, { cwd, input, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: sanitizedEnv(process.env),
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const logs = [stderr.trim(), timedOut ? `timed out after ${timeoutMs}ms` : ""]
        .filter(Boolean)
        .join("\n");
      resolve({ exitCode: timedOut ? 124 : exitCode, stdout, stderr, logs });
    });

    child.stdin.end(JSON.stringify(input));
  });
}

function sanitizedEnv(env) {
  const next = { ...env };
  delete next.E2B_API_KEY;
  delete next.E2B_ACCESS_TOKEN;
  delete next.E2B_HOST;
  return next;
}
