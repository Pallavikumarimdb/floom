import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadAppBundle } from "../../lib/e2b/bundle.mjs";
import { E2BRunner } from "../../lib/runner/e2b.mjs";
import { FakeRunner, LocalRunner } from "../../lib/runner/index.mjs";

test("fake runner validates input and returns deterministic schema output", async () => {
  const bundle = await loadAppBundle(path.resolve("fixtures/typescript-echo"));
  const runner = new FakeRunner({ now: () => 100 });
  const result = await runner.run(bundle, { text: "hello" });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "fake");
  assert.deepEqual(result.output, { upper: "EXAMPLE", length: 7 });
});

test("fake runner rejects invalid input before execution", async () => {
  const bundle = await loadAppBundle(path.resolve("fixtures/typescript-echo"));
  const runner = new FakeRunner();
  await assert.rejects(() => runner.run(bundle, { text: "" }), /input failed schema validation/);
});

test("local runner executes the Python fixture with sanitized E2B env", async () => {
  const bundle = await loadAppBundle(path.resolve("fixtures/python-echo"));
  const runner = new LocalRunner();
  const result = await runner.run(bundle, {
    topic: "localhost to live",
    audience: "coworker",
    tone: "direct",
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "local");
  assert.deepEqual(result.output, {
    brief: "Direct brief for coworker: localhost to live.",
  });
});

test("local runner executes the TypeScript fixture via compiled JavaScript", async () => {
  const bundle = await loadAppBundle(path.resolve("fixtures/typescript-echo"));
  const runner = new LocalRunner();
  const result = await runner.run(bundle, { text: "floom" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.output, { upper: "FLOOM", length: 5 });
});

test("local runner installs python requirements before executing the bundle", async () => {
  const bundle = await loadAppBundle(path.resolve("fixtures/python-with-deps"));
  const calls = [];
  const runner = new LocalRunner({
    commandRunner: async (command, options) => {
      calls.push([command, options]);
      if (command === "python3 -m pip install -r requirements.txt") {
        return { exitCode: 0, stdout: "", stderr: "", logs: "" };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({ message: "floom" }),
        stderr: "",
        logs: "",
      };
    },
  });

  const result = await runner.run(bundle, { name: "floom" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.output, { message: "floom" });
  assert.deepEqual(
    calls.map(([command]) => command),
    [
      "python3 -m venv .floom-venv && . .floom-venv/bin/activate && python3 -m pip install -r requirements.txt",
      "PATH=.floom-venv/bin:$PATH python3 main.py",
    ],
  );
});

test("e2b runner installs npm dependencies before executing the bundle", async () => {
  const bundle = await loadAppBundle(path.resolve("fixtures/typescript-with-deps"));
  const calls = [];
  const runner = new E2BRunner({
    now: () => 100,
    sdkLoader: async () => ({
      Sandbox: {
        create: async () => ({
          files: {
            makeDir: async (targetPath) => calls.push(["mkdir", targetPath]),
            write: async (targetPath) => calls.push(["write", targetPath]),
          },
          commands: {
            run: async (command, options) => {
              calls.push(["run", command, options.stdin]);
              if (command === "npm install") {
                return {
                  exitCode: 0,
                  stdout: "",
                  stderr: "",
                };
              }
              return {
                exitCode: 0,
                stdout: JSON.stringify({ upper: "FLOOM" }),
                stderr: "",
              };
            },
          },
          kill: async () => calls.push(["kill"]),
        }),
      },
    }),
  });

  const result = await runner.run(bundle, { text: "floom" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.output, { upper: "FLOOM" });
  const runCommands = calls.filter((call) => call[0] === "run").map((call) => call[1]);
  assert.deepEqual(runCommands, [
    "cd /home/user/app && npm install",
    "cd /home/user/app && node main.js",
  ]);
  assert.deepEqual(calls.at(-1), ["kill"]);
});

test("E2B runner stays behind an SDK interface", async () => {
  const bundle = await loadAppBundle(path.resolve("fixtures/typescript-echo"));
  const calls = [];
  const runner = new E2BRunner({
    now: () => 100,
    sdkLoader: async () => ({
      Sandbox: {
        create: async () => ({
          files: {
            makeDir: async (targetPath) => calls.push(["mkdir", targetPath]),
            write: async (targetPath) => calls.push(["write", targetPath]),
          },
          commands: {
            run: async (command, options) => {
              calls.push(["run", command, options.stdin]);
              return {
                exitCode: 0,
                stdout: JSON.stringify({ upper: "FLOOM", length: 5 }),
                stderr: "",
              };
            },
          },
          kill: async () => calls.push(["kill"]),
        }),
      },
    }),
  });

  const result = await runner.run(bundle, { text: "floom" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.output, { upper: "FLOOM", length: 5 });
  assert(calls.some((call) => call[0] === "write" && call[1].endsWith("/floom.yaml")));
  assert(calls.some((call) => call[0] === "run" && call[1].includes("node main.js")));
  assert.deepEqual(calls.at(-1), ["kill"]);
});
