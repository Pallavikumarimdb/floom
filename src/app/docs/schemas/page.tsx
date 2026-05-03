import type { Metadata } from "next";
import { IC, CodeBlock, Section } from "@/components/docs/DocsPrimitives";

export const metadata: Metadata = {
  title: "Input / output schemas",
  description: "JSON Schema for Floom app inputs and outputs — enum, min/max, pattern, oneOf, x-floom-format extensions.",
  alternates: { canonical: "https://floom.dev/docs/schemas" },
};

const inputSchemaExample = `{
  "type": "object",
  "required": ["transcript"],
  "properties": {
    "transcript": {
      "type": "string",
      "title": "Meeting transcript",
      "description": "Paste the full text of your meeting.",
      "x-floom-format": "textarea"
    },
    "language": {
      "type": "string",
      "title": "Output language",
      "default": "English"
    }
  }
}`;

const outputSchemaExample = `{
  "type": "object",
  "properties": {
    "action_items": {
      "type": "array",
      "items": { "type": "string" }
    },
    "summary": { "type": "string" }
  }
}`;

const outputModes = `# With output_schema declared:
# app prints JSON on stdout (last line), or writes /home/user/output.json
# Floom validates and returns parsed JSON

# No output_schema, stdout is valid JSON:
# Floom returns the parsed JSON directly

# No output_schema, plain stdout:
# Floom returns { "stdout": "<last 4 KB>", "exit_code": 0 }`;

const schemaEnumExample = `{
  "type": "string",
  "title": "Size",
  "enum": ["small", "medium", "large"]
}`;

const schemaMinMaxExample = `{
  "type": "integer",
  "title": "Count",
  "minimum": 1,
  "maximum": 100
}`;

const schemaPatternExample = `{
  "type": "string",
  "title": "Slug",
  "pattern": "^[a-z][a-z0-9-]{0,30}$"
}`;

const schemaOneOfExample = `{
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "kind": { "const": "url" },
        "url": { "type": "string" }
      },
      "required": ["kind", "url"]
    },
    {
      "type": "object",
      "properties": {
        "kind": { "const": "text" },
        "text": { "type": "string" }
      },
      "required": ["kind", "text"]
    }
  ]
}`;

export default function SchemasPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Build</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          Input / output schemas
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Schemas are standard{" "}
          <a className="underline" href="https://json-schema.org" target="_blank" rel="noreferrer">JSON Schema</a>{" "}
          files. They drive the browser form UI, API validation, and MCP argument descriptions.
        </p>
      </div>

      <Section id="input" title="Input schema">
        <CodeBlock label="input.schema.json">{inputSchemaExample}</CodeBlock>
      </Section>

      <Section id="extensions" title="x-floom-format extension">
        <p>
          Floom-specific extension on any <IC>string</IC> field. Controls how the browser UI renders the field.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#ded8cc]">
                <th className="text-left py-2 pr-4 font-semibold text-[#11110f]">Value</th>
                <th className="text-left py-2 font-semibold text-[#11110f]">Renders as</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ede6]">
              <tr>
                <td className="py-2 pr-4 font-mono text-sm text-[#2a2520]">textarea</td>
                <td className="py-2 text-neutral-600">Multiline text area</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-sm text-[#2a2520]">file</td>
                <td className="py-2 text-neutral-600">File picker. File is base64-encoded and sent as the field value.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="output" title="Output schema">
        <CodeBlock label="output.schema.json">{outputSchemaExample}</CodeBlock>
        <p>
          If <IC>output_schema</IC> is declared, your app must print a JSON object as the last line of stdout, or write it to <IC>/home/user/output.json</IC>.
        </p>
        <CodeBlock label="Output behaviour by config">{outputModes}</CodeBlock>
      </Section>

      <Section id="constraints" title="Schema constraints">
        <p>
          Floom passes standard JSON Schema constraints through to validation. Use any of these in your input or output schemas.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <CodeBlock label="Enum — restrict to a fixed set of values">{schemaEnumExample}</CodeBlock>
          <CodeBlock label="Min / max — bound a numeric range">{schemaMinMaxExample}</CodeBlock>
          <CodeBlock label="Pattern — validate a string with regex">{schemaPatternExample}</CodeBlock>
          <CodeBlock label="oneOf — discriminated union of shapes">{schemaOneOfExample}</CodeBlock>
        </div>
      </Section>
    </>
  );
}
