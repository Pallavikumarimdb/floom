# Contributing

Floom is in active development. We welcome bug reports and focused fixes across:

- browser-authorized CLI setup
- single-file Python app publishing
- exact-pinned Python dependencies
- encrypted app secrets
- browser, REST API, and MCP runs

Please keep reports factual and reproducible. Include the command, URL, expected
result, actual result, and any sanitized logs. Do not include raw tokens, API
keys, Supabase service-role keys, cookies, or private app secrets.

For code changes, keep the patch narrow and run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
