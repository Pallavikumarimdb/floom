"use client";

import Form from "@rjsf/core";
import type { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";

export type RunFormData = Record<string, unknown>;
export type RunResult = Record<string, unknown> | null;

interface AppRunSurfaceProps {
  inputSchema: RJSFSchema;
  formData: RunFormData;
  runError: string | null;
  runLoading: boolean;
  runResult: RunResult;
  onFormDataChange: (formData: RunFormData) => void;
  onReset: () => void;
  onRun: () => void;
}

export function AppRunSurface({
  inputSchema,
  formData,
  runError,
  runLoading,
  runResult,
  onFormDataChange,
  onReset,
  onRun,
}: AppRunSurfaceProps) {
  return (
    <div className="max-w-full overflow-hidden rounded-2xl border border-[#ded8cc] bg-white shadow-xl shadow-neutral-200/60">
      <div className="border-b border-[#ded8cc] px-6 py-4 font-mono text-xs font-bold uppercase tracking-widest text-neutral-500">
        Run ready
      </div>
      <div className="grid min-h-[420px] min-w-0 md:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="min-w-0 border-b border-[#ded8cc] p-5 md:border-b-0 md:border-r md:p-8">
          <p className="mb-5 font-mono text-xs font-bold uppercase tracking-widest text-neutral-500">
            Inputs
          </p>
          <Form
            className="floom-run-form"
            schema={inputSchema}
            validator={validator}
            formData={formData}
            onChange={(event) =>
              onFormDataChange((event.formData ?? {}) as RunFormData)
            }
            onSubmit={onRun}
          >
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={runLoading}
                className="rounded-lg bg-emerald-700 px-8 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
              >
                {runLoading ? "Running..." : "Run"}
              </button>
              <button
                type="button"
                onClick={onReset}
                className="rounded-lg border border-[#ded8cc] bg-white px-5 py-3 font-semibold text-neutral-600"
              >
                Reset
              </button>
            </div>
          </Form>
        </div>

        <div className="flex min-h-[360px] min-w-0 flex-col p-5 md:p-8">
          <p className="mb-5 font-mono text-xs font-bold uppercase tracking-widest text-neutral-500">
            Output
          </p>
          {runError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="font-medium text-red-700">Error</p>
              <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-words text-sm text-red-600">
                {runError}
              </pre>
            </div>
          )}
          {!runError && !runResult && (
            <div className="flex flex-1 items-center justify-center text-center">
              <div>
                <p className="font-semibold">Output will appear here</p>
                <p className="mt-2 text-sm text-neutral-500">
                  Fill the form and press Run.
                </p>
              </div>
            </div>
          )}
          {runResult && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words text-sm leading-7 text-emerald-900">
                {JSON.stringify(runResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
