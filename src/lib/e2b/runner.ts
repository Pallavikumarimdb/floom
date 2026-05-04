import { FileNotFoundError, Sandbox, SandboxNotFoundError } from "e2b";
import { isSafePythonEntrypoint, isSafePythonIdentifier } from "../floom/manifest";
import type { RuntimeDependencies } from "../floom/requirements";
import type { RuntimeSecrets } from "../floom/runtime-secrets";
import {
  COMMAND_TIMEOUT_MS,
  MAX_OUTPUT_BYTES,
  MAX_SOURCE_BYTES,
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

export type SandboxStartResult = {
  sandboxId: string;
  pid: number;
};

export type SandboxPollResult = {
  status: "running" | "succeeded" | "failed" | "timed_out";
  output?: Record<string, unknown>;
  error?: string;
  progress?: unknown | null;
  stdoutChunk: string;
  stderrChunk: string;
  stdoutOffset: number;
  stderrOffset: number;
};

type SandboxRunner = typeof runInSandbox;

type StartSandboxExecutionArgs = {
  source: string;
  inputs: Record<string, unknown>;
  runtime: "python";
  entrypoint: string;
  handler: string;
  dependencies?: RuntimeDependencies;
  secrets?: RuntimeSecrets;
  /** Override the E2B sandbox lifetime. Defaults to SANDBOX_TIMEOUT_MS (250 s). */
  timeoutMs?: number;
};

type PollSandboxExecutionArgs = {
  sandboxId: string;
  pid: number | null;
  stdoutOffset?: number;
  stderrOffset?: number;
};

export async function startSandboxExecution({
  source,
  inputs,
  runtime,
  entrypoint,
  handler,
  dependencies = {},
  secrets = {},
  timeoutMs = SANDBOX_TIMEOUT_MS,
}: StartSandboxExecutionArgs): Promise<SandboxStartResult> {
  if (!process.env.E2B_API_KEY) {
    if (!isExplicitFakeMode()) {
      throw new Error("E2B execution is not configured");
    }

    return { sandboxId: `fake:${Date.now()}`, pid: 0 };
  }

  if (runtime !== "python") {
    throw new Error("v0.1 only supports runtime: python");
  }

  if (!isSafePythonEntrypoint(entrypoint) || !isSafePythonIdentifier(handler)) {
    throw new Error("Invalid app entrypoint or handler");
  }

  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    throw new Error("App source is too large");
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

    runSbx = await Sandbox.create("base", sandboxOptions({ allowInternetAccess: true, deadlineAt: Date.now() + timeoutMs }));
    await prepareSandboxFiles(runSbx, source, inputs, entrypoint, handler, dependencies, dependencyArchive);

    const handle = await runSbx.commands.run(
      "python3 /home/user/runner.py > /home/user/stdout.log 2> /home/user/stderr.log",
      {
        background: true,
        timeoutMs: SANDBOX_TIMEOUT_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        envs: {
          ...secrets,
          FLOOM_PROGRESS_PATH: "/home/user/progress.json",
        },
      }
    );

    return { sandboxId: runSbx.sandboxId, pid: handle.pid };
  } catch (error) {
    await runSbx?.kill().catch(() => undefined);
    throw error;
  } finally {
    await installSbx?.kill().catch(() => undefined);
  }
}

export async function pollSandboxExecution({
  sandboxId,
  pid,
  stdoutOffset = 0,
  stderrOffset = 0,
}: PollSandboxExecutionArgs): Promise<SandboxPollResult> {
  if (sandboxId.startsWith("fake:")) {
    return {
      status: "succeeded",
      output: { result: "hello from fake mode" },
      stdoutChunk: "",
      stderrChunk: "",
      stdoutOffset,
      stderrOffset,
      progress: null,
    };
  }

  let sbx: Awaited<ReturnType<typeof Sandbox.connect>>;
  try {
    sbx = await Sandbox.connect(sandboxId, sandboxConnectOptions());
  } catch (error) {
    if (error instanceof SandboxNotFoundError) {
      return {
        status: "failed",
        error: "App execution failed",
        stdoutChunk: "",
        stderrChunk: "",
        stdoutOffset,
        stderrOffset,
        progress: null,
      };
    }
    throw error;
  }

  const { chunk: stdoutChunk, offset: nextStdoutOffset } = await readIncrementalText(
    sbx,
    "/home/user/stdout.log",
    stdoutOffset
  );
  const { chunk: stderrChunk, offset: nextStderrOffset } = await readIncrementalText(
    sbx,
    "/home/user/stderr.log",
    stderrOffset
  );
  const progress = await readJsonFile(sbx, "/home/user/progress.json");
  const result = await readJsonFile(sbx, "/home/user/result.json");

  if (result && typeof result === "object" && !Array.isArray(result)) {
    const parsed = result as { ok?: unknown; output?: unknown; error?: unknown };
    if (parsed.ok === true) {
      if (!parsed.output || typeof parsed.output !== "object" || Array.isArray(parsed.output)) {
        return {
          status: "failed",
          error: "App output must be a JSON object",
          stdoutChunk,
          stderrChunk,
          stdoutOffset: nextStdoutOffset,
          stderrOffset: nextStderrOffset,
          progress,
        };
      }

      const outputText = JSON.stringify(parsed.output);
      if (Buffer.byteLength(outputText, "utf8") > MAX_OUTPUT_BYTES) {
        return {
          status: "failed",
          error: "App output is too large",
          stdoutChunk,
          stderrChunk,
          stdoutOffset: nextStdoutOffset,
          stderrOffset: nextStderrOffset,
          progress,
        };
      }

      return {
        status: "succeeded",
        output: parsed.output as Record<string, unknown>,
        stdoutChunk,
        stderrChunk,
        stdoutOffset: nextStdoutOffset,
        stderrOffset: nextStderrOffset,
        progress,
      };
    }

    return {
      status: "failed",
      error: typeof parsed.error === "string" ? parsed.error : "App execution failed",
      stdoutChunk,
      stderrChunk,
      stdoutOffset: nextStdoutOffset,
      stderrOffset: nextStderrOffset,
      progress,
    };
  }

  if (pid !== null) {
    const running = await isCommandRunning(sbx, pid);
    if (!running) {
      return {
        status: "failed",
        error: "App execution failed",
        stdoutChunk,
        stderrChunk,
        stdoutOffset: nextStdoutOffset,
        stderrOffset: nextStderrOffset,
        progress,
      };
    }
  }

  return {
    status: "running",
    stdoutChunk,
    stderrChunk,
    stdoutOffset: nextStdoutOffset,
    stderrOffset: nextStderrOffset,
    progress,
  };
}

export async function killSandboxExecution(sandboxId: string | null, pid?: number | null) {
  if (!sandboxId || sandboxId.startsWith("fake:")) {
    return;
  }

  try {
    const sbx = await Sandbox.connect(sandboxId, sandboxConnectOptions());
    if (pid !== null && pid !== undefined) {
      await sbx.commands.kill(pid, { requestTimeoutMs: REQUEST_TIMEOUT_MS }).catch(() => undefined);
    }
    await sbx.kill().catch(() => undefined);
  } catch {
    return;
  }
}

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
    const runResult = await runCommand(sandbox, command, config.inputs, "/home/user/app", config.secrets, deadlineAt, SANDBOX_TIMEOUT_MS);
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
    deadlineAt,
    SANDBOX_TIMEOUT_MS
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
  deadlineAt?: number,
  maxTimeoutMs: number = COMMAND_TIMEOUT_MS
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
  const timeoutOptions = deadlineAt ? deadlineTimeoutOptions(deadlineAt, maxTimeoutMs) : {
    timeoutMs: maxTimeoutMs,
    requestTimeoutMs: Math.max(1, Math.min(REQUEST_TIMEOUT_MS, maxTimeoutMs)),
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

function sandboxConnectOptions() {
  return {
    apiKey: process.env.E2B_API_KEY,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
  } as const;
}

async function prepareSandboxFiles(
  sbx: Awaited<ReturnType<typeof Sandbox.create>>,
  source: string,
  inputs: Record<string, unknown>,
  entrypoint: string,
  handler: string,
  dependencies: RuntimeDependencies,
  dependencyArchive: Uint8Array | null
) {
  await sbx.files.write(`/home/user/${entrypoint}`, source);
  if (dependencyArchive) {
    await sbx.files.write("/home/user/deps.tgz", toArrayBuffer(dependencyArchive));
    await sbx.commands.run("tar -C /home/user -xzf /home/user/deps.tgz", {
      timeoutMs: COMMAND_TIMEOUT_MS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    });
  } else if (dependencies.python_requirements?.trim()) {
    await sbx.files.write("/home/user/requirements.txt", dependencies.python_requirements);
    await sbx.commands.run(
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
import os
import sys
import traceback
sys.path.insert(0, "/home/user")
sys.path.insert(0, "/home/user/.deps")
from ${moduleName} import ${handler}

def write_result(payload):
    with open("/home/user/result.json", "w") as handle:
        json.dump(payload, handle)

try:
    inputs = json.loads(open("/home/user/inputs.json").read())
    result = ${handler}(inputs)
    if not isinstance(result, dict):
        raise TypeError("App output must be a JSON object")
    with open("/home/user/output.json", "w") as handle:
        json.dump(result, handle)
    write_result({"ok": True, "output": result, "error": None})
except Exception:
    traceback.print_exc()
    write_result({"ok": False, "output": None, "error": "App execution failed"})
`;

  await sbx.files.write("/home/user/runner.py", wrapper);
  await sbx.files.write("/home/user/inputs.json", JSON.stringify(inputs));
  await sbx.files.write("/home/user/stdout.log", "");
  await sbx.files.write("/home/user/stderr.log", "");
}

async function readIncrementalText(
  sbx: Awaited<ReturnType<typeof Sandbox.connect>>,
  path: string,
  offset: number
) {
  const text = await readTextFile(sbx, path);
  if (text.length <= offset) {
    return { chunk: "", offset: text.length };
  }
  return { chunk: text.slice(offset), offset: text.length };
}

async function readTextFile(sbx: Awaited<ReturnType<typeof Sandbox.connect>>, path: string) {
  try {
    return await sbx.files.read(path, { requestTimeoutMs: REQUEST_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      return "";
    }
    throw error;
  }
}

async function readJsonFile(sbx: Awaited<ReturnType<typeof Sandbox.connect>>, path: string) {
  const text = await readTextFile(sbx, path);
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function isCommandRunning(sbx: Awaited<ReturnType<typeof Sandbox.connect>>, pid: number) {
  const processes = await sbx.commands.list({ requestTimeoutMs: REQUEST_TIMEOUT_MS });
  return processes.some((process) => process.pid === pid);
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
  deadlineAt?: number;
}) {
  const resolvedDeadline = deadlineAt ?? Date.now() + SANDBOX_TIMEOUT_MS;
  return {
    apiKey: process.env.E2B_API_KEY,
    allowInternetAccess,
    secure: true,
    ...sandboxTimeoutOptions(resolvedDeadline),
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
