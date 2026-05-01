"""
PDF to JSON extractor — Floom handler.

Accepts a PDF as a base64 data-url (or a URL string), extracts raw text with
pypdf, then sends it to Gemini 3 for structured JSON extraction.

Inputs:
  pdf     (str, required) — data:application/pdf;base64,<...> OR https://...
  extract (str, optional) — what to extract, default "invoice line items"

Outputs:
  extracted (dict)  — the structured JSON Gemini returned
  pages     (int)   — number of pages in the PDF
  error     (str)   — only present when something went wrong
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import urllib.request

import pypdf


# ---------------------------------------------------------------------------
# Gemini helpers
# ---------------------------------------------------------------------------

def _gemini_key() -> str:
    """Return the Gemini API key from env or the ai-sidecar keys file."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    # Fall back to ai-sidecar keys file (AX41 convention)
    keys_path = os.path.expanduser("~/.config/ai-sidecar/keys.json")
    if os.path.exists(keys_path):
        with open(keys_path) as fh:
            data = json.load(fh)
        key = data.get("gemini", "").strip()
        if key:
            return key
    raise RuntimeError(
        "No Gemini API key found. Set GEMINI_API_KEY or add 'gemini' to "
        "~/.config/ai-sidecar/keys.json"
    )


def _call_gemini(prompt: str, api_key: str) -> dict:
    """
    Call gemini-3-flash-preview with JSON output mode.
    Returns parsed dict from the response.

    Gemini may return either a JSON object or a JSON array depending on the
    data shape.  When it returns an array we wrap it under "items" so the
    Floom output_schema (which expects an object) is always satisfied.
    """
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )

    raw = response.text.strip()
    # Strip markdown code fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    parsed = json.loads(raw)

    # Normalise: always return a dict
    if isinstance(parsed, list):
        return {"items": parsed}
    return parsed


# ---------------------------------------------------------------------------
# PDF helpers
# ---------------------------------------------------------------------------

def _pdf_bytes_from_data_url(data_url: str) -> bytes:
    """Decode a data:application/pdf;base64,... string to bytes."""
    # Tolerate URLs and plain base64 strings too
    if data_url.startswith("http://") or data_url.startswith("https://"):
        with urllib.request.urlopen(data_url, timeout=30) as resp:  # noqa: S310
            return resp.read()
    # data URL
    if "," in data_url:
        _, encoded = data_url.split(",", 1)
    else:
        encoded = data_url
    # Fix padding if needed
    encoded = encoded.strip()
    padding = 4 - len(encoded) % 4
    if padding != 4:
        encoded += "=" * padding
    return base64.b64decode(encoded)


def _extract_text(pdf_bytes: bytes) -> tuple[str, int]:
    """Extract full text and page count from PDF bytes using pypdf."""
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    pages = len(reader.pages)
    chunks = []
    for page in reader.pages:
        text = page.extract_text() or ""
        chunks.append(text)
    return "\n\n".join(chunks), pages


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_PROMPT_TEMPLATE = """\
You are a precise data-extraction assistant.

Extract the following from the PDF text below: {extract}

Return ONLY a JSON object with the extracted data. Use clear, descriptive keys.
If a field is not present in the text, omit it rather than returning null.

PDF TEXT (may be truncated to {char_limit} chars):
---
{pdf_text}
---
"""

_MAX_CHARS = 30_000  # ~7 500 tokens — generous but within Gemini's context


# ---------------------------------------------------------------------------
# Main handler
# ---------------------------------------------------------------------------

def run(inputs: dict) -> dict:
    """
    Main Floom handler.

    inputs = {
        "pdf": "data:application/pdf;base64,...",  # or https:// URL
        "extract": "invoice line items",            # optional
    }
    returns {"extracted": {...}, "pages": <int>}
           or {"error": "<message>"} on failure
    """
    pdf_input = inputs.get("pdf", "")
    if not pdf_input:
        return {"error": "No PDF provided. Pass a data-url or URL in the 'pdf' field."}

    extract = str(inputs.get("extract", "invoice line items")).strip() or "invoice line items"

    try:
        pdf_bytes = _pdf_bytes_from_data_url(pdf_input)
    except Exception as exc:
        return {"error": f"Failed to decode PDF: {exc}"}

    try:
        pdf_text, pages = _extract_text(pdf_bytes)
    except Exception as exc:
        return {"error": f"Failed to parse PDF: {exc}"}

    if not pdf_text.strip():
        return {"error": "PDF appears to contain no extractable text (scanned image?)."}

    # Truncate to avoid blowing up the context window
    truncated = pdf_text[:_MAX_CHARS]

    prompt = _PROMPT_TEMPLATE.format(
        extract=extract,
        char_limit=_MAX_CHARS,
        pdf_text=truncated,
    )

    try:
        api_key = _gemini_key()
        extracted = _call_gemini(prompt, api_key)
    except json.JSONDecodeError as exc:
        return {"error": f"Gemini returned invalid JSON: {exc}"}
    except Exception as exc:
        return {"error": f"Gemini extraction failed: {exc}"}

    return {"extracted": extracted, "pages": pages}
