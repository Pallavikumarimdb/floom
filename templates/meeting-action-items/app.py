"""Meeting → Action Items.

Paste raw meeting notes, transcript, or chat log. Returns a structured list
of action items: who owns each task, when it's due, what the outcome was.

Runtime: Python stdlib + google-genai. The single Gemini call uses a
response_json_schema so the output is deterministic JSON — no parsing
fragile model prose.
"""

import json
import os
from google import genai
from google.genai import types

_GEMINI_MODEL = "gemini-2.5-flash-lite"

_PROMPT = """Extract action items from these meeting notes.

For each action: identify the task, the owner (if named), and the due date
or timeframe (if mentioned). Use exactly the names that appear in the notes
for owner. If owner or due is not stated, use an empty string.

Also write a one-line summary of the meeting outcome.

Notes:
{notes}
"""

_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "task": {"type": "string"},
                    "owner": {"type": "string"},
                    "due": {"type": "string"},
                },
                "required": ["task", "owner", "due"],
            },
        },
        "summary": {"type": "string"},
    },
    "required": ["actions", "summary"],
}


def run(inputs):
    notes = (inputs or {}).get("notes", "").strip()
    if len(notes) < 20:
        return {
            "error": "notes are too short — paste at least 20 characters of meeting content",
            "actions": [],
            "summary": "",
            "count": 0,
        }

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GEMINI_BYOK")
    if not api_key:
        return {
            "error": "GEMINI_API_KEY is not configured for this app",
            "actions": [],
            "summary": "",
            "count": 0,
        }

    client = genai.Client(api_key=api_key)

    prompt = _PROMPT.format(notes=notes[:8000])

    response = client.models.generate_content(
        model=_GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_json_schema=_RESPONSE_SCHEMA,
        ),
    )

    raw = response.text or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {
            "error": "model returned non-JSON output",
            "actions": [],
            "summary": "",
            "count": 0,
        }

    actions = parsed.get("actions", []) or []
    summary = parsed.get("summary", "") or ""

    return {
        "actions": actions,
        "summary": summary,
        "count": len(actions),
    }
