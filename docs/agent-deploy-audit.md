# Agent Deploy Audit — Floom MCP
**Date:** 2026-05-01  
**Audited endpoint:** `https://floom-60sec.vercel.app/mcp`  
**Method:** Simulated agent (no prior prose context, MCP tools only)

---

## Top-Line Score

| Dimension | Score |
|-----------|-------|
| Tool discoverability (descriptions only) | 62/100 |
| Contract completeness | 45/100 |
| Template quality | 72/100 |
| Validation feedback quality | 78/100 |
| Run experience | 80/100 |
| **Overall agent-friction score** | **67/100** |

**"60 seconds without help" verdict:** No. An agent hits two hard blockers before it can write a valid `floom.yaml` from scratch: the contract does not state the Python version, and it does not state _any_ size/rate limits. An agent guessing 3.9 vs 3.11 on stdlib availability would produce subtle bugs. An agent discovering limits only at publish time wastes a round trip.

---

## Top 3 Fixes (Highest Agent-UX Return)

### Fix 1 — Add limits and Python version to `get_app_contract` (🔴 Blocking)
The contract is the single authoritative reference an agent reads before writing code. It is missing:
- Python version (`python3` is run, but the e2b "base" sandbox version is not documented anywhere in the MCP)
- Max source size (64 KB)
- Max input size (16 KB)
- Max output size (64 KB)
- Max bundle/request size (128 KB)
- Rate limit: 20 req/60s per caller, 100 req/60s per app (actual defaults differ from the "20 req/30s" stated in the task brief — audit found the window is 60s, not 30s)

An agent cannot write a safe app without knowing what will be truncated.

### Fix 2 — Surface all 8 templates on canonical (`list_app_templates` returns 4, source has 8) (🔴 Blocking)
PR #11 adds `slugify`, `password_strength`, `regex_tester`, `markdown_to_text` but is not merged. The `available_keys` field in `get_app_contract` hard-codes only 4 keys. An agent looking for "data extraction" or "text processing" sees nothing useful and either builds from scratch (wasting time) or picks the wrong template. **Merge PR #11 before launch.**

### Fix 3 — Document `run_app` response envelope in the contract (🟠 Confusing)
`run_app` returns `{ execution_id, status, output, error }` — a wrapper that is **not described anywhere in the MCP**. An agent expecting the tool to return the raw output object (as implied by "run a Floom app with JSON inputs") will write broken downstream logic. The contract should state: "run_app returns `{ execution_id: string, status: 'success'|'error', output: <your output schema object>, error: string|null }`".

---

## Section-by-Section Findings

### 1. Discovery — `tools/list`

9 tools returned. Per-tool description scores:

| Tool | Score | Issue |
|------|-------|-------|
| `auth_status` | 9/10 | Clear. Minor: does not say what "agent token" means vs user token. |
| `get_app_contract` | 8/10 | Clear intent. Missing: no hint that this is the first thing to call. |
| `list_app_templates` | 7/10 | "v0-safe" is jargon without definition. An agent doesn't know why unsafe templates exist. |
| `get_app_template` | 8/10 | Fine. `key` parameter could link to `list_app_templates` more explicitly. |
| `validate_manifest` | 9/10 | Excellent. Schemas are optional — clearly indicated. |
| `publish_app` | 7/10 | Does not say auth is required. An agent will call it, fail, and waste a round trip. Add "Requires Authorization bearer token." to the description. |
| `find_candidate_apps` | 6/10 | "deployable Floom app candidates from caller-provided repository file contents" is vague. What's a candidate? What does it return? Should say: "Scan a repo's file map for floom.yaml manifests that are ready to publish." |
| `get_app` | 8/10 | Clear. "or an app owned by the bearer token user" is good. |
| `run_app` | 6/10 | Critically missing: does not describe the response shape. "Run a Floom app with JSON inputs" — what comes back? An agent will assume the raw output schema, but gets a wrapper. |

**Aggregate tool description score: 7.6/10.** The main gap is that `publish_app` hides its auth requirement, `run_app` hides its response shape, and `find_candidate_apps` is opaque.

---

### 2. Contract — `get_app_contract`

Returned fields:

| Field | Present | Adequate |
|-------|---------|----------|
| Supported cases list | Yes | Yes |
| Unsupported cases list | Yes | Yes — well-written with `case`/`reason` pairs |
| Starter files (floom.yaml + app.py + schemas) | Yes | Yes — copy-paste ready |
| Template keys list | Yes | Only 4 (canonical); source has 8 |
| Publish CLI command | Yes | Yes, but publish-via-MCP (`publish_app` tool) is not mentioned |

**Missing from contract (all 🔴 blocking for a from-scratch agent):**

1. **Python version** — e2b "base" sandbox runs `python3` but the major version is not documented. An agent writing code that depends on `3.11+` stdlib features (e.g., `tomllib`, `datetime.UTC`) will fail at runtime.
2. **Max source size** — 64 KB. Not mentioned.
3. **Max input size** — 16 KB. Not mentioned.
4. **Max output size** — 64 KB. Not mentioned.
5. **Rate limit** — 20 req/60s per caller, 100 req/60s per app (real defaults from source). Contract is silent; task brief said "20 req/30s" but source shows window is 60s — there is a discrepancy.
6. **requirements.txt syntax** — The contract correctly says "Python standard library only" and lists `requirements.txt` as unsupported. Adequate on this point.
7. **How to declare secrets** — Correctly listed as unsupported in v0. Adequate.
8. **run_app response envelope** — Not mentioned anywhere in the contract.

**Contract completeness score: 45/100.** It nails the file format and unsupported cases, but leaves an agent blind on runtime, limits, and response shape.

---

### 3. Template Browse — `list_app_templates`

Canonical returns 4 templates. Source (`tools.ts`) has 8:
- `invoice_calculator` — math/billing
- `utm_url_builder` — string manipulation  
- `csv_stats` — data extraction (parse + aggregate)
- `meeting_action_items` — text extraction / NLP
- `slugify` — string manipulation (PR #11, not on canonical)
- `password_strength` — scoring (PR #11, not on canonical)
- `regex_tester` — dev tooling (PR #11, not on canonical)
- `markdown_to_text` — text processing (PR #11, not on canonical)

Coverage gap with 4 canonical templates:
- "Scoring" use case: only covered by `invoice_calculator` (math, not a scorer). `password_strength` would fix this but is unmerged.
- "Dev tooling" / "regex": zero coverage on canonical.
- "Text processing": `meeting_action_items` is closest but is heuristic extraction, not general text transformation.

An agent looking for "data extraction" finds `csv_stats` (reasonable match). An agent looking for "string manipulation" could find `utm_url_builder` (weak match). An agent looking for "scoring" finds nothing.

**Variety score (canonical 4): 5/10.** With all 8 merged: 8/10.

---

### 4. Template Inspection

All 4 canonical templates were pulled and evaluated:

#### `invoice_calculator`
| Criterion | Score | Notes |
|-----------|-------|-------|
| Schema ↔ handler match | 10/10 | Perfect. All output fields returned, all input fields consumed. |
| Robustness to bad input | 9/10 | `Decimal(str(...))` handles string-encoded numbers. Edge: empty `items` array bypasses `minItems: 1` schema constraint only at runtime (schema validates, but the handler processes it gracefully regardless). |
| Realistic example_inputs | 10/10 | Two line items with real pricing. |
| Copy-paste-adapt success | 9/10 | Would work. Minor: `currency` max length truncation (`[:8]`) is undocumented behavior. |

**Template score: 9.5/10** — near-perfect.

#### `utm_url_builder`
| Criterion | Score | Notes |
|-----------|-------|-------|
| Schema ↔ handler match | 8/10 | `term` and `content` are optional in handler but `required` array only includes `base_url`, `source`, `medium`, `campaign`. Schema is correct. However output `warning` field is always returned (empty string when valid) — schema says required string, handler matches. Good. |
| Robustness to bad input | 7/10 | No scheme validation — `base_url: "not-a-url"` silently produces a malformed output URL. Handler returns `{'url': 'not-a-url', 'params': {...}}`. An agent copy-pasting this for URL building will not notice. |
| Realistic example_inputs | 9/10 | `content: "hero-cta"` is very realistic. |
| Copy-paste-adapt success | 8/10 | Fine for URL manipulation. The `warning` field pattern is a good model for optional error messages. |

**Template score: 8/10.** Flag: no URL scheme validation means bad inputs silently pass through.

#### `csv_stats`
| Criterion | Score | Notes |
|-----------|-------|-------|
| Schema ↔ handler match | 10/10 | Perfect. `row_count`, `columns`, `numeric_stats` all match exactly. |
| Robustness to bad input | 8/10 | Handles empty CSV gracefully (returns 0 rows, empty columns). Handles non-numeric values in numeric columns by returning empty stats (not an error). One gap: a totally malformed CSV (e.g. binary data) could throw an exception inside `csv.DictReader` — not caught. |
| Realistic example_inputs | 10/10 | Three-row, three-column example with real data. |
| Copy-paste-adapt success | 9/10 | Very adaptable pattern. |

**Template score: 9/10.**

#### `meeting_action_items`
| Criterion | Score | Notes |
|-----------|-------|-------|
| Schema ↔ handler match | 10/10 | `count` + `items[{task, owner, due}]` — handler returns exactly this. |
| Robustness to bad input | 6/10 | **Regression risk.** The regex `r'\b(?P<owner>[A-Z][a-z]+)\s+(?:will|to|needs to...)` matches ANY capitalized word before "will" — including non-names (e.g., "The team will deliver"). Also: `due_from` only handles a fixed weekday list; dates like "May 5" return empty. These are documented heuristic limitations but there is no warning in the output when heuristics produce low-confidence results. An agent copy-pasting this for a production task extractor will silently produce wrong owners/due dates. |
| Realistic example_inputs | 9/10 | Three realistic notes. |
| Copy-paste-adapt success | 7/10 | The heuristic approach is fine for the stated use case ("simple deterministic heuristics"), but an agent adapting this for a different extraction task might not realize how fragile the regex ownership detection is. |

**Template score: 8/10.** The description says "simple deterministic heuristics" — that's honest. But no confidence/warning field in the output means consumers can't distinguish high-confidence from garbage results.

---

### 5. Validation — `validate_manifest`

All test cases run:

| Test | Expected | Actual | Pass |
|------|----------|--------|------|
| Valid manifest + valid schemas | `valid: true` | `valid: true, schemas: {input_schema: "valid", output_schema: "valid"}` | PASS |
| Missing `slug` | error | `"Missing slug in floom.yaml"` | PASS |
| Missing `handler` | error | `"Missing handler in floom.yaml"` | PASS |
| Missing `entrypoint` | error | `"Missing entrypoint in floom.yaml"` | PASS |
| Wrong runtime (`typescript`) | error | `"v0 only supports runtime: python"` | PASS |
| `actions` field present | error | `"v0 only supports one handler per app; actions are not supported"` | PASS |
| `dependencies` field present | error | `"v0 only supports stdlib single-file Python apps; dependencies are not supported"` | PASS |
| Invalid JSON for `input_schema` | error | `"input_schema must be valid JSON"` | PASS |
| Valid manifest, no schemas | `valid: true, schemas: not_provided` | `valid: true, schemas: {input_schema: "not_provided", output_schema: "not_provided"}` | PASS |

**One gap found:** When `secrets` is present alongside `actions` in the manifest, the error only reports the `actions` violation. The `secrets` violation is silently swallowed (first-error-wins). An agent would fix `actions`, resubmit, then hit the `secrets` error. Better: return all violations in one call.

**Validation score: 8/10.** All required cases handled, error messages are clear. Fix: batch all violations in one response.

---

### 6. Run — `run_app`

App tested: `meeting-action-items` with the template's own `example_inputs`.

Response:
```json
{
  "execution_id": "cee9b5ac-767d-429f-8f4e-bcf5413ef7cc",
  "status": "success",
  "output": {
    "count": 3,
    "items": [
      {"task": "send the launch notes by Friday", "owner": "", "due": "Friday"},
      {"task": "review the demo copy", "owner": "Pallavi", "due": ""},
      {"task": "schedule QA follow-up tomorrow", "owner": "", "due": "tomorrow"}
    ]
  },
  "error": null
}
```

Output matches `output.schema.json` exactly. `execution_id` is present. Status is `"success"`.

**Issue:** The response envelope (`execution_id`, `status`, `output`, `error`) is **not described in the `run_app` tool description or in `get_app_contract`**. An agent parsing this will be surprised by the wrapper. If the agent tries to use `result.items` instead of `result.output.items` it will fail silently.

**Run score: 8/10.** Functionally correct, envelope undocumented.

---

### 7. Friction Inventory

#### 🔴 Blocking

1. **Python version unknown.** Contract says "Python standard library only" but doesn't state 3.x version. Agent writing `3.11`-specific code (e.g., `tomllib`, `datetime.UTC`, `match` statements) will hit a runtime error with no MCP-level feedback until execution.

2. **Size limits absent from contract.** Agent has no basis to bound inputs or source size. First time limits are surfaced is at `publish_app` runtime ("source is too large") or at run time.

3. **4 templates on canonical vs 8 in source.** Agent looking for a scoring or text-processing template finds nothing and builds from scratch — or worse, asks the user. This is the scenario that most directly violates "60 seconds without help."

#### 🟠 Confusing

4. **`run_app` response envelope undocumented.** Agent reads `output_schema` from `get_app`, calls `run_app`, receives `{ execution_id, status, output: {...}, error }` — the outer wrapper is nowhere described. Likely confusion: agent accesses `result.my_field` instead of `result.output.my_field`.

5. **`publish_app` description silent on auth requirement.** An agent that hasn't called `auth_status` first will attempt `publish_app`, get an error, then backtrack to auth. The description should say "Requires Authorization bearer token — call auth_status first to verify."

6. **`find_candidate_apps` description is opaque.** Agents won't know when to call this vs `list_app_templates`. Should clarify: "Use this when you have an existing codebase and want to discover which subdirectories already contain a `floom.yaml`."

7. **`get_app_contract` available_keys diverges from `list_app_templates`.** The contract embeds `available_keys: ["invoice_calculator", "utm_url_builder", "csv_stats", "meeting_action_items"]` — this is a hardcoded list, not derived from the same source as `list_app_templates`. When PR #11 merges, they will re-sync — but the contract's `available_keys` is not dynamically derived, it's `Object.keys(APP_TEMPLATES)`, so it will be correct post-merge. No code change needed; just merge PR #11.

8. **Rate limit in task brief (20 req/30s) differs from source code (20 req/60s).** The actual `DEFAULT_PUBLIC_RUN_RATE_LIMIT_WINDOW_SECONDS` is `60`, not `30`. Either the brief is wrong, or there is an env override in production. This should be documented accurately in the contract.

9. **`validate_manifest` only returns first error.** Multi-violation manifests (e.g., `actions` + `secrets` + wrong `runtime`) get one error message. Agent must fix and resubmit repeatedly.

#### 🟡 Polish

10. **`meeting_action_items` heuristic output has no confidence signal.** No `confidence` or `warnings` field. Consumers (and agents adapting this template) cannot detect low-confidence extractions.

11. **`utm_url_builder` silently accepts non-URL `base_url`.** Returns a malformed URL with no warning. The `warning` field is the right hook — just populate it when no scheme is detected.

12. **Contract `publish_command` is CLI-only.** `FLOOM_TOKEN=<agent-token> ... npx tsx cli/deploy.ts <app-dir>` — useful, but an agent using the MCP should know `publish_app` is the MCP-native path. The contract could add: `"publish_tool": "publish_app"` alongside `publish_command`.

13. **`auth_status` does not explain agent token vs user token.** Returns `caller_type: "agent_token"` or `"user"` but there is no description of what scopes each type gets or how to obtain an agent token.

---

## Summary Table

| Step | Status | Score | Top Gap |
|------|--------|-------|---------|
| 1. Discovery (`tools/list`) | Pass with caveats | 7.6/10 | `publish_app` hides auth requirement; `run_app` hides response shape |
| 2. Contract (`get_app_contract`) | Incomplete | 4.5/10 | No Python version, no size limits, no run envelope |
| 3. Template browse (`list_app_templates`) | Partial (canonical) | 5/10 | 4/8 templates live; no scoring/text-processing template |
| 4. Template inspection | Good | 8.6/10 | `meeting_action_items` heuristic fragility; `utm_url_builder` no URL validation |
| 5. Validation (`validate_manifest`) | Strong | 8/10 | First-error-only on multi-violation manifests |
| 6. Run (`run_app`) | Works | 8/10 | Response envelope undocumented |
| 7. Friction total | — | — | 9 items (3 🔴, 6 🟠, 4 🟡) |
