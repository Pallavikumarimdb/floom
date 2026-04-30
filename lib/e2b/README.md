# Floom app bundle contract

An app bundle is a directory containing:

- `floom.yaml`: bundle metadata and runtime command.
- `input.schema.json`: JSON Schema for runner input.
- `output.schema.json`: JSON Schema for runner output.
- Runtime files needed by the app entrypoint.

Supported `floom.yaml` shape:

```yaml
name: app-name
version: 0.1.0
runtime:
  kind: python
  entrypoint: main.py
  command: python main.py
schemas:
  input: input.schema.json
  output: output.schema.json
runner:
  timeoutMs: 10000
```

The runner sends validated input as JSON on stdin. The app must write one JSON object to stdout matching `output.schema.json`. Bundle manifests cannot contain raw E2B host, token, API key, or secret fields; E2B credentials stay in environment/config outside the bundle.
