"use client";

import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import { useState } from "react";
import { runApp } from "@/lib/schemas";
import type { FloomApp, JsonValue, RunAppInput } from "@/lib/types";
import { OutputRenderer } from "./output-renderer";

type AppRunnerProps = {
  app: FloomApp;
};

export function AppRunner({ app }: AppRunnerProps) {
  const [output, setOutput] = useState<JsonValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  return (
    <main className="shell">
      <section className="panel">
        <div className="header">
          <p className="eyebrow">/{app.slug}</p>
          <h1>{app.name}</h1>
          {app.description ? <p>{app.description}</p> : null}
        </div>

        <Form
          schema={app.inputSchema}
          validator={validator}
          disabled={isRunning}
          onSubmit={async ({ formData }) => {
            setIsRunning(true);
            setError(null);

            try {
              const result = await runApp(app.slug, formData as RunAppInput);
              setOutput(result.output);
            } catch (submissionError) {
              setError(
                submissionError instanceof Error
                  ? submissionError.message
                  : "Something went wrong."
              );
            } finally {
              setIsRunning(false);
            }
          }}
        >
          <button className="button" type="submit">
            {isRunning ? "Running..." : "Run"}
          </button>
        </Form>

        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="panel">
        <h2>Output</h2>
        <OutputRenderer value={output} />
      </section>
    </main>
  );
}
