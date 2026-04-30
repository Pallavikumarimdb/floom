import { loadAppBundle } from "../e2b/bundle.mjs";
import { FakeRunner } from "./fake.mjs";
import { LocalRunner } from "./local.mjs";

export { FakeRunner } from "./fake.mjs";
export { LocalRunner } from "./local.mjs";

export async function createRunner(mode, options = {}) {
  switch (mode) {
    case "fake":
      return new FakeRunner(options);
    case "local":
      return new LocalRunner(options);
    case "e2b": {
      const { E2BRunner } = await import("./e2b.mjs");
      return new E2BRunner(options);
    }
    default:
      throw new Error(`Unknown runner mode "${mode}"`);
  }
}

export async function runAppBundle({ bundleDir, input, mode = "fake", runnerOptions = {} }) {
  const bundle = await loadAppBundle(bundleDir);
  const runner = await createRunner(mode, runnerOptions);
  return runner.run(bundle, input);
}
