import type { JsonValue } from "@/lib/types";

type OutputRendererProps = {
  value: JsonValue | null;
};

export function OutputRenderer({ value }: OutputRendererProps) {
  if (value === null) {
    return <p className="muted">Run the app to see output here.</p>;
  }

  if (typeof value === "string" || typeof value === "number") {
    return <p className="outputText">{value}</p>;
  }

  if (typeof value === "boolean") {
    return <p className="outputText">{value ? "true" : "false"}</p>;
  }

  return <pre className="outputJson">{JSON.stringify(value, null, 2)}</pre>;
}
