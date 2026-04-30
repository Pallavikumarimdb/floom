export const demoApp = {
  id: "demo-app",
  slug: "demo-app",
  name: "Pitch Coach",
  runtime: "python",
  entrypoint: "app.py",
  handler: "run",
  public: true,
  input_schema: {
    type: "object",
    properties: {
      pitch: {
        type: "string",
        title: "Your Pitch",
        description: "Enter your elevator pitch",
      },
    },
    required: ["pitch"],
  },
  output_schema: {
    type: "object",
    properties: {
      result: { type: "string" },
      length: { type: "integer" },
    },
    required: ["result", "length"],
  },
  dependencies: { python: [] },
  secrets: [],
};

export function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function runDemoApp(inputs: Record<string, unknown>) {
  const pitch = typeof inputs.pitch === "string" ? inputs.pitch : "";
  return {
    result: `Great pitch! You said: ${pitch}`,
    length: pitch.length,
  };
}
