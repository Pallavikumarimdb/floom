# Meeting → Action Items

Paste raw meeting notes, transcript, or chat log. Get a structured list of action items: who owns each task, when it's due, and a one-line summary of the meeting.

> **Status: experimental.** Local-runnable today; deploys to canonical Floom once the v0.1 runtime ships per-app `requirements.txt` resolution and bundles `google-genai` in the sandbox image.

## Why this exists

Action items get lost in transcripts. This app extracts them deterministically as JSON so any agent or tool can act on them — assign in Linear, post to Slack, or hand off to another Floom app.

---

## Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `notes` | string | yes | Raw meeting notes, transcript, or chat log. 20–8000 characters. |

## Outputs

```json
{
  "actions": [
    { "task": "Write migration docs", "owner": "Sarah", "due": "EOW" },
    { "task": "Fix /reports 500 error", "owner": "Marcus", "due": "by lunch" }
  ],
  "summary": "Standup: ingestion fix shipped, /reports 500 in progress, Q3 OKR draft on Thursday.",
  "count": 2
}
```

`owner` and `due` are empty strings when the notes don't say.

## How it works

1. Validates input length (20–8000 chars).
2. Single Gemini 2.5 Flash Lite call with `response_json_schema` so the output is structured JSON, not parsed prose.
3. Returns the actions list, a one-line summary, and a count.

Cost: ~1 Gemini call per run. Latency: ~2–4s typical.

---

## Local test

```bash
cd templates/meeting-action-items
pip install -r requirements.txt
GEMINI_API_KEY=<your-key> python test.py
```

Three smoke tests: short-input rejected, real meeting extracts ≥3 owned actions, empty input rejected.

## Deploy (planned)

When the v0.1 runtime supports per-app `requirements.txt`:

```bash
cd templates/meeting-action-items
floom publish .
```

The CLI packages `app.py`, `floom.yaml`, `input.schema.json`, `output.schema.json`, and `requirements.txt` into a bundle, uploads it, and returns the public run endpoint.

---

## Why this is a better launch demo than Pitch Coach

Pitch Coach is thin: paste a pitch, get back the same pitch + a length count. It doesn't show off what Floom can do.

Meeting → Action Items returns a structured array with owner + due fields. Three usable downstream patterns:
- Pipe into Linear / Asana via webhook
- Post to Slack as a checklist
- Feed into another Floom app (e.g. an "owner reminder" scheduler)

It's also more universal — every team has meetings.
