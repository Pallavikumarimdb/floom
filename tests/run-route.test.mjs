import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { buildRunResponse, resolveRunBundleDir } from "../lib/run-route.mjs";

test("resolves the demo slug to the Python echo fixture", () => {
  assert.equal(
    resolveRunBundleDir("demo", "/Users/federicodeponte/floom-60sec"),
    path.resolve("/Users/federicodeponte/floom-60sec", "fixtures/python-echo"),
  );
  assert.equal(resolveRunBundleDir("missing", "/Users/federicodeponte/floom-60sec"), null);
});

test("builds a success payload with execution metadata", () => {
  assert.deepEqual(
    buildRunResponse({
      executionId: "exec_123",
      result: { ok: true, output: { message: "hello" } },
    }),
    {
      execution_id: "exec_123",
      status: "succeeded",
      output: { message: "hello" },
    },
  );
});

