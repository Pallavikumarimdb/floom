import { Sandbox } from "e2b";
import { isSafePythonEntrypoint, isSafePythonIdentifier } from "../floom/manifest";
import type { RuntimeDependencies } from "../floom/requirements";
import type { RuntimeSecrets } from "../floom/runtime-secrets";
import {
  COMMAND_TIMEOUT_MS,
  MAX_OUTPUT_BYTES,
  MAX_STDERR_TAIL_BYTES,
  MAX_STDOUT_TAIL_BYTES,
  REQUEST_TIMEOUT_MS,
  SANDBOX_TIMEOUT_MS,
} from "../floom/limits";

export type RunnerErrorPhase = "install" | "run" | "output_validation";

export type RunnerErrorDetail = {
  phase: RunnerErrorPhase;
  stderr_tail: string;
  exit_code?: number;
  elapsed_ms?: number;
  detail?: string;
};

export type RunnerResult =
  | {
      kind: "success";
      output: unknown;
      stdout: string;
      stderr: string;
      elapsedMs: number;
    }
  | {
      kind: "failed";
      error: RunnerErrorDetail;
      output: null;
      stdout: string;
      stderr: string;
      elapsedMs: number;
    }
  | {
      kind: "timed_out";
      error: RunnerErrorDetail;
      output: null;
      stdout: string;
      stderr: string;
      elapsedMs: number;
    }
  | {
      kind: "sandbox_unavailable";
      retryAfterUnix: number;
      detail: string;
    };

export type RunnerConfig = {
  bundle: Buffer;
  bundleKind: "single_file" | "tarball";
  command?: string;
  legacyEntrypoint?: string | null;
  legacyHandler?: string | null;
  inputs: unknown;
  hasOutputSchema: boolean;
  dependencies?: RuntimeDependencies;
  secrets?: RuntimeSecrets;
  deadlineAt?: number;
};

type SandboxRunner = typeof runInSandbox;

export async function runInSandbox(config: RunnerConfig): Promise<RunnerResult> {
  if (!process.env.E2B_API_KEY) {
    if (!isExplicitFakeMode()) {
      return {
        kind: "sandbox_unavailable",
        retryAfterUnix: Math.floor(Date.now() / 1000) + 60,
        detail: "E2B execution is not configured",
      };
    }

    return fakeRunnerResult(config);
  }

  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | null = null;
  const startedAt = Date.now();
  const deadlineAt = config.deadlineAt ?? startedAt + SANDBOX_TIMEOUT_MS;
  try {
    sandbox = await Sandbox.create("base", sandboxOptions({
      allowInternetAccess: true,
      deadlineAt,
    }));
  } catch {
    return {
      kind: "sandbox_unavailable",
      retryAfterUnix: Math.floor(Date.now() / 1000) + 60,
      detail: "sandbox boot failed",
    };
  }

  try {
    await prepareWorkspace(sandbox, config, deadlineAt);

    const installResult = await installDependenciesIfNeeded(sandbox, config, deadlineAt);
    if (installResult) {
      const elapsedMs = Date.now() - startedAt;
      if (installResult.kind === "failed") {
        return {
          kind: "failed",
          output: null,
          stdout: installResult.stdout,
          stderr: installResult.stderr,
          error: installResult.error,
          elapsedMs,
        };
      }
      return {
        kind: "timed_out",
        output: null,
        stdout: installResult.stdout,
        stderr: installResult.stderr,
        error: installResult.error,
        elapsedMs,
      };
    }

    if (config.bundleKind === "single_file") {
      return await runLegacyHandler(sandbox, config, startedAt, deadlineAt);
    }

    const command = config.command?.trim() || await detectCommandInSandbox(sandbox, deadlineAt);
    const runResult = await runCommand(sandbox, command, config.inputs, undefined, config.secrets, deadlineAt);
    const elapsedMs = Date.now() - startedAt;

    if (runResult.kind !== "success") {
      return {
        ...runResult,
        elapsedMs,
      };
    }

    const stdout = runResult.stdout;
    const stderr = runResult.stderr;

    if (config.hasOutputSchema) {
      const structured = await readStructuredOutput(sandbox, stdout);
      if (!structured.ok) {
        return {
          kind: "failed",
          output: null,
          stdout,
          stderr,
          elapsedMs,
          error: {
            phase: "output_validation",
            stderr_tail: tailBytes(stderr, MAX_STDERR_TAIL_BYTES),
            detail: structured.error,
          },
        };
      }

      return {
        kind: "success",
        output: structured.value,
        stdout,
        stderr,
        elapsedMs,
      };
    }

    const lastJsonLine = parseJsonLastLine(stdout);
    if (lastJsonLine.ok) {
      return {
        kind: "success",
        output: lastJsonLine.value,
        stdout,
        stderr,
        elapsedMs,
      };
    }

    return {
      kind: "success",
      output: {
        stdout: tailBytes(stdout, MAX_STDOUT_TAIL_BYTES),
        exit_code: 0,
      },
      stdout,
      stderr,
      elapsedMs,
    };
  } finally {
    await sandbox?.kill().catch(() => undefined);
  }
}

export async function runInSandboxContained(
  config: RunnerConfig,
  runner: SandboxRunner = runInSandbox
): Promise<RunnerResult> {
  try {
    return await runner(config);
  } catch {
    return {
      kind: "sandbox_unavailable",
      retryAfterUnix: Math.floor(Date.now() / 1000) + 60,
      detail: "sandbox boot failed",
    };
  }
}

async function prepareWorkspace(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  config: RunnerConfig,
  deadlineAt: number
) {
  if (config.bundleKind === "single_file") {
    const entrypoint = config.legacyEntrypoint?.trim();
    if (!entrypoint) {
      throw new Error("legacy entrypoint is required for single-file bundles");
    }

    await sandbox.files.write(`/home/user/${entrypoint}`, config.bundle.toString("utf8"));
    if (config.dependencies?.python_requirements) {
      await sandbox.files.write("/home/user/requirements.txt", config.dependencies.python_requirements);
    }
    return;
  }

  await sandbox.files.write("/home/user/bundle.tar.gz", toArrayBuffer(config.bundle));
  const options = commandTimeoutOptions(deadlineAt);
  await sandbox.commands.run("mkdir -p /home/user/app && tar -xzf /home/user/bundle.tar.gz -C /home/user/app", options);
}

async function installDependenciesIfNeeded(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  config: RunnerConfig,
  deadlineAt: number
) {
  const cwd = config.bundleKind === "single_file" ? "/home/user" : "/home/user/app";
  const hasRequirements = await fileExists(
    sandbox,
    `${cwd}/requirements.txt`,
    deadlineAt
  );
  const hasPackageJson = await fileExists(sandbox, `${cwd}/package.json`, deadlineAt);

  if (!hasRequirements && !hasPackageJson) {
    return null;
  }

  if (hasRequirements) {
    const targetFlag = config.bundleKind === "single_file" ? " --target /home/user/.deps" : "";
    const pipCommand = config.dependencies?.python_require_hashes
      ? `python3 -m pip install --disable-pip-version-check --no-input --require-hashes${targetFlag} -r requirements.txt`
      : `python3 -m pip install --disable-pip-version-check --no-input${targetFlag} -r requirements.txt`;
    const result = await runCommand(sandbox, pipCommand, undefined, cwd, {}, deadlineAt);
    if (result.kind !== "success") {
      return {
        ...result,
        error: {
          ...result.error,
          phase: "install" as const,
        },
      };
    }
  }

  if (hasPackageJson) {
    const result = await runCommand(sandbox, "npm install", undefined, cwd, {}, deadlineAt);
    if (result.kind !== "success") {
      return {
        ...result,
        error: {
          ...result.error,
          phase: "install" as const,
        },
      };
    }
  }

  return null;
}

async function detectCommandInSandbox(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  deadlineAt: number
) {
  const detection = await sandbox.commands.run(
    [
      "if [ -f app.py ]; then echo 'python app.py';",
      "elif [ -f index.js ]; then echo 'node index.js';",
      "elif [ -f package.json ] && node -e \"const p=require('./package.json'); process.exit(typeof p.scripts?.start==='string'&&p.scripts.start.trim()?0:1)\"; then echo 'npm start';",
      "else exit 2; fi",
    ].join(" "),
    {
      ...commandTimeoutOptions(deadlineAt),
      cwd: "/home/user/app",
    }
  ).catch((error: unknown) => error);

  const stdout = readCommandStdout(detection).trim();
  if (!stdout) {
    throw new Error("no command detected");
  }

  return stdout.split(/\r?\n/).filter(Boolean).at(-1) ?? stdout;
}

async function runLegacyHandler(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  config: RunnerConfig,
  startedAt: number,
  deadlineAt: number
): Promise<RunnerResult> {
  const entrypoint = config.legacyEntrypoint?.trim();
  const handler = config.legacyHandler?.trim();
  if (!entrypoint || !handler || !isSafePythonEntrypoint(entrypoint) || !isSafePythonIdentifier(handler)) {
    return {
      kind: "failed",
      output: null,
      stdout: "",
      stderr: "",
      elapsedMs: Date.now() - startedAt,
      error: {
        phase: "run",
        stderr_tail: "",
        detail: "Invalid legacy app entrypoint or handler",
      },
    };
  }

  const moduleName = entrypoint.replace(/\.py$/, "");
  const wrapper = [
    "import json",
    "import sys",
    'sys.path.insert(0, "/home/user")',
    'sys.path.insert(0, "/home/user/.deps")',
    `from ${moduleName} import ${handler}`,
    "",
    'with open("/home/user/inputs.json") as handle:',
    "    inputs = json.load(handle)",
    `result = ${handler}(inputs)`,
    'with open("/home/user/output.json", "w") as handle:',
    "    json.dump(result, handle)",
    "",
  ].join("\n");

  await sandbox.files.write("/home/user/runner.py", wrapper);
  await sandbox.files.write("/home/user/inputs.json", JSON.stringify(config.inputs ?? {}));

  const runResult = await runCommand(
    sandbox,
    "python3 /home/user/runner.py",
    undefined,
    "/home/user",
    config.secrets,
    deadlineAt
  );
  const elapsedMs = Date.now() - startedAt;
  if (runResult.kind !== "success") {
    return {
      ...runResult,
      elapsedMs,
    };
  }

  const outputText = await sandbox.files.read("/home/user/output.json", {
    requestTimeoutMs: Math.max(1, Math.min(REQUEST_TIMEOUT_MS, deadlineAt - Date.now())),
  }).catch(() => null);
  if (outputText === null) {
    return {
      kind: "failed",
      output: null,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      elapsedMs,
      error: {
        phase: "output_validation",
        stderr_tail: tailBytes(runResult.stderr, MAX_STDERR_TAIL_BYTES),
        detail: "output.json was not written",
      },
    };
  }
  if (Buffer.byteLength(outputText, "utf8") > MAX_OUTPUT_BYTES) {
    return {
      kind: "failed",
      output: null,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      elapsedMs,
      error: {
        phase: "output_validation",
        stderr_tail: tailBytes(runResult.stderr, MAX_STDERR_TAIL_BYTES),
        detail: "App output is too large",
      },
    };
  }

  let output: unknown;
  try {
    output = JSON.parse(outputText);
  } catch {
    return {
      kind: "failed",
      output: null,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      elapsedMs,
      error: {
        phase: "output_validation",
        stderr_tail: tailBytes(runResult.stderr, MAX_STDERR_TAIL_BYTES),
        detail: "output.json must contain valid JSON",
      },
    };
  }

  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return {
      kind: "failed",
      output: null,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      elapsedMs,
      error: {
        phase: "output_validation",
        stderr_tail: tailBytes(runResult.stderr, MAX_STDERR_TAIL_BYTES),
        detail: "App output must be a JSON object",
      },
    };
  }

  return {
    kind: "success",
    output,
    stdout: runResult.stdout,
    stderr: runResult.stderr,
    elapsedMs,
  };
}

async function readStructuredOutput(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  stdout: string
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const outputJsonPath = "/home/user/app/output.json";
  const legacyOutputJsonPath = "/home/user/output.json";
  const candidatePaths = [outputJsonPath, legacyOutputJsonPath];

  for (const filePath of candidatePaths) {
    const exists = await fileExists(sandbox, filePath);
    if (!exists) {
      continue;
    }

    const text = await sandbox.files.read(filePath, {
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    });
    if (Buffer.byteLength(text, "utf8") > MAX_OUTPUT_BYTES) {
      return { ok: false, error: "structured output exceeds the 1 MB limit" };
    }

    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      return { ok: false, error: `${pathLabel(filePath)} must contain valid JSON` };
    }
  }

  const parsed = parseJsonLastLine(stdout);
  if (!parsed.ok) {
    return { ok: false, error: "stdout final line must be valid JSON or write /home/user/output.json" };
  }

  return parsed;
}

async function runCommand(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  command: string,
  inputs?: unknown,
  cwd?: string,
  envs: RuntimeSecrets = {},
  deadlineAt?: number
): Promise<
  | {
      kind: "success";
      stdout: string;
      stderr: string;
    }
  | {
      kind: "failed" | "timed_out";
      output: null;
      stdout: string;
      stderr: string;
      error: RunnerErrorDetail;
    }
> {
  const timeoutOptions = deadlineAt ? commandTimeoutOptions(deadlineAt) : {
    timeoutMs: COMMAND_TIMEOUT_MS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
  };
  if (deadlineAt && deadlineAt <= Date.now()) {
    return {
      kind: "timed_out",
      output: null,
      stdout: "",
      stderr: "",
      error: {
        phase: "run",
        stderr_tail: "",
        elapsed_ms: SANDBOX_TIMEOUT_MS,
      },
    };
  }

  const inputText = inputs === undefined ? "" : JSON.stringify(inputs);
  await sandbox.files.write("/home/user/.floom-inputs.json", inputText);

  try {
    const result = await sandbox.commands.run(
      `sh -lc ${shellEscape(command)} < /home/user/.floom-inputs.json`,
      {
        ...timeoutOptions,
        envs: {
          FLOOM_INPUTS: inputText,
          ...envs,
        },
        cwd: cwd ?? "/home/user",
      }
    );

    return {
      kind: "success",
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error: unknown) {
    const stdout = readCommandStdout(error);
    const stderr = readCommandStderr(error);
    const exitCode = readCommandExitCode(error);
    const timedOut = looksLikeTimeout(error);

    if (timedOut) {
      return {
        kind: "timed_out",
        output: null,
        stdout,
        stderr,
        error: {
          phase: "run",
          stderr_tail: tailBytes(stderr, MAX_STDERR_TAIL_BYTES),
          elapsed_ms: SANDBOX_TIMEOUT_MS,
        },
      };
    }

    return {
      kind: "failed",
      output: null,
      stdout,
      stderr,
      error: {
        phase: "run",
        stderr_tail: tailBytes(stderr, MAX_STDERR_TAIL_BYTES),
        ...(exitCode !== undefined ? { exit_code: exitCode } : {}),
      },
    };
  }
}

async function fileExists(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  filePath: string,
  deadlineAt?: number
) {
  const result = await sandbox.commands.run(
    `[ -f ${shellEscape(filePath)} ] && echo yes || true`,
    deadlineAt ? commandTimeoutOptions(deadlineAt) : {
      timeoutMs: COMMAND_TIMEOUT_MS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    }
  );
  return result.stdout.trim() === "yes";
}

function commandTimeoutOptions(deadlineAt: number) {
  return deadlineTimeoutOptions(deadlineAt, COMMAND_TIMEOUT_MS);
}

function sandboxTimeoutOptions(deadlineAt: number) {
  return deadlineTimeoutOptions(deadlineAt, SANDBOX_TIMEOUT_MS);
}

function deadlineTimeoutOptions(deadlineAt: number, maxTimeoutMs: number) {
  const remainingMs = deadlineAt - Date.now();
  const timeoutMs = Math.max(1, Math.min(maxTimeoutMs, remainingMs));
  return {
    timeoutMs,
    requestTimeoutMs: Math.max(1, Math.min(REQUEST_TIMEOUT_MS, timeoutMs)),
  };
}

function parseJsonLastLine(stdout: string): { ok: true; value: unknown } | { ok: false } {
  const lastLine = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!lastLine) {
    return { ok: false };
  }

  try {
    return { ok: true, value: JSON.parse(lastLine) };
  } catch {
    return { ok: false };
  }
}

function pathLabel(filePath: string) {
  return filePath.replace("/home/user/", "");
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function tailBytes(text: string, maxBytes: number) {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.byteLength <= maxBytes) {
    return text;
  }

  return buffer.subarray(buffer.byteLength - maxBytes).toString("utf8");
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function readCommandStdout(error: unknown) {
  if (error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string") {
    return error.stdout;
  }
  return "";
}

function readCommandStderr(error: unknown) {
  if (error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string") {
    return error.stderr;
  }
  return "";
}

function readCommandExitCode(error: unknown) {
  if (error && typeof error === "object" && "exitCode" in error && typeof error.exitCode === "number") {
    return error.exitCode;
  }
  return undefined;
}

function looksLikeTimeout(error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /timeout|timed out|sandbox timeout/i.test(message);
}

function fakeRunnerResult(config: RunnerConfig): RunnerResult {
  if (config.hasOutputSchema) {
    return {
      kind: "success",
      output: { result: "hello from fake mode", inputs: config.inputs },
      stdout: JSON.stringify({ result: "hello from fake mode", inputs: config.inputs }),
      stderr: "",
      elapsedMs: 1,
    };
  }

  return {
    kind: "success",
    output: {
      stdout: "hello from fake mode",
      exit_code: 0,
    },
    stdout: "hello from fake mode",
    stderr: "",
    elapsedMs: 1,
  };
}

function sandboxOptions({
  allowInternetAccess,
  deadlineAt,
}: {
  allowInternetAccess: boolean;
  deadlineAt: number;
}) {
  return {
    apiKey: process.env.E2B_API_KEY,
    allowInternetAccess,
    secure: true,
    ...sandboxTimeoutOptions(deadlineAt),
    lifecycle: { onTimeout: "kill" },
  } as const;
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
