# Dep Check — proxied-mode example

Clones a public git repo and scans JavaScript / TypeScript / Python source
files for relative imports that reference files that no longer exist (dead
imports). Returns the list with `file`, `import`, and `resolved_to` for each
hit.

Pure Node.js HTTP server, shells out to the system `git` binary.

## Run standalone

```bash
node examples/dep-check/server.mjs &
curl -sX POST http://localhost:4114/analyze \
  -H 'content-type: application/json' \
  -d '{"repo_url":"https://github.com/sindresorhus/slugify"}' | jq .count
```

## Run via Floom

```bash
node examples/dep-check/server.mjs &
FLOOM_APPS_CONFIG=examples/dep-check/apps.yaml \
  DATA_DIR=/tmp/floom-dep-check \
  node apps/server/dist/index.js &
curl -sX POST http://localhost:3051/api/dep-check/run \
  -H 'content-type: application/json' \
  -d '{"action":"analyze","inputs":{"repo_url":"https://github.com/sindresorhus/slugify"}}' | jq
```

## Docker

```bash
docker build -t floom-example-dep-check -f examples/dep-check/Dockerfile examples/dep-check
docker run -p 4114:4114 floom-example-dep-check
```

## Notes

- Relative specifiers only. Package-style imports (`react`, `pkg/sub`) are
  ignored because resolving them would need a full `node_modules` / `sys.path`
  walk.
- Supported extensions: `.js .jsx .ts .tsx .mjs .cjs .py`.
- Clone depth 1. File walking capped at 3000 source files / 500KB each so the
  response stays sub-second for most repos.
- Dead-import list capped at 500 hits so huge legacy repos don't overflow the
  response.
