"""Meeting -> Action Items.

Paste raw meeting notes, transcript, or chat log. Returns a structured list
of action items: who owns each task, when it's due. Plus a one-line summary.

Single Gemini 2.5 Flash Lite call via the REST API (urllib, stdlib only).
response_mime_type=application/json + responseSchema -> deterministic JSON.
"""

import json
import os
import urllib.request
import urllib.error


_GEMINI_MODEL = "gemini-2.5-flash-lite"
_GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{_GEMINI_MODEL}:generateContent"
)

_PROMPT = """Extract action items from these meeting notes.

For each action: identify the task, the owner (if named), and the due date
or timeframe (if mentioned). Use exactly the names that appear in the notes
for owner. If owner or due is not stated, use an empty string.

Also write a one-line summary of the meeting outcome.

Be concise in task wording. Return only items that name a concrete action;
skip pure decisions or context.

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
                "propertyOrdering": ["task", "owner", "due"],
            },
        },
        "summary": {"type": "string"},
    },
    "required": ["actions", "summary"],
    "propertyOrdering": ["actions", "summary"],
}


def _err(message):
    return {
        "error": message,
        "actions": [],
        "summary": "",
        "count": 0,
        "items": [],
    }


def run(inputs):
    raw = (inputs or {}).get("transcript") or (inputs or {}).get("notes") or ""
    notes = str(raw).strip()
    if len(notes) < 20:
        return _err(
            "Notes are too short - paste at least 20 characters of meeting content."
        )

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GEMINI_BYOK")
    if not api_key:
        return _err("GEMINI_API_KEY is not configured for this app.")

    body = {
        "contents": [{"parts": [{"text": _PROMPT.format(notes=notes[:8000])}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": _RESPONSE_SCHEMA,
            "temperature": 0.1,
        },
    }
    req = urllib.request.Request(
        f"{_GEMINI_URL}?key={api_key}",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode("utf-8"))
            msg = detail.get("error", {}).get("message", str(e))
        except Exception:
            msg = f"HTTP {e.code}"
        return _err(f"Gemini call failed: {msg}")
    except Exception as e:
        return _err(f"Gemini call failed: {type(e).__name__}: {e}")

    candidates = payload.get("candidates", [])
    if not candidates:
        return _err("Gemini returned no candidates.")
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        return _err("Gemini returned an empty response.")

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        return _err(f"Gemini returned invalid JSON: {e}")

    actions = parsed.get("actions") or []
    default_owner = (inputs or {}).get("default_owner") or ""
    if default_owner:
        for a in actions:
            if not a.get("owner"):
                a["owner"] = default_owner

    items = [
        {
            "task": str(a.get("task", "")),
            "owner": str(a.get("owner", "")),
            "due": str(a.get("due", "")),
        }
        for a in actions
    ]

    return {
        "count": len(items),
        "items": items,
        "actions": items,
        "summary": str(parsed.get("summary", "")),
    }
