import { exampleFromSchema, assertJsonSchema } from "../e2b/schema.mjs";
import { okRunResult } from "./result.mjs";

export class FakeRunner {
  constructor({ now = () => Date.now() } = {}) {
    this.mode = "fake";
    this.now = now;
  }

  async run(bundle, input) {
    const startedAt = this.now();
    assertJsonSchema(bundle.inputSchema, input, "input");
    const output = exampleFromSchema(bundle.outputSchema);
    assertJsonSchema(bundle.outputSchema, output, "fake output");

    return okRunResult({
      mode: this.mode,
      output,
      logs: "fake runner completed without executing bundle code",
      durationMs: Math.max(0, this.now() - startedAt),
    });
  }
}
