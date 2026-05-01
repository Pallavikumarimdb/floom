# PDF to JSON

> **Status: experimental.** This template is a working reference for the
> PDF → structured-JSON pattern, with passing local tests. It is **not yet
> wired into the canonical Floom runtime** — the v0 deploy path does not yet
> ship `pypdf` / `google-genai` in the sandbox image, and per-app
> `requirements.txt` resolution is a planned follow-up. Treat this as a
> reference handler you can run locally; full end-to-end deploy on
> floom-60sec.vercel.app will land alongside the runtime work tracked in
> floomhq/floom-minimal.

Extract structured data from any PDF using a Python sandbox and Gemini 3.

**Why this exists:** PDF parsing requires native libraries (`pypdf`) that can't
run in a browser. Floom's Python sandbox handles the heavy lifting so callers
get clean JSON back from a simple API call.

---

## What it does

1. Accepts a PDF as a base64 data-url (or an HTTPS URL).
2. Extracts raw text with **pypdf** (runs server-side — no browser support).
3. Sends the text to **Gemini 3 Flash** with your extraction prompt.
4. Returns a structured JSON object.

Works out of the box for invoices, resumes, academic papers, contracts, and
any other text-based PDF.

---

## Inputs

| Field     | Type   | Required | Default              | Description |
|-----------|--------|----------|----------------------|-------------|
| `pdf`     | string | yes      | —                    | PDF as `data:application/pdf;base64,...` or an HTTPS URL |
| `extract` | string | no       | `invoice line items` | What to extract — plain English description |

### Example `extract` prompts

- `invoice line items` — line numbers, descriptions, quantities, prices
- `resume sections` — work experience, education, skills
- `paper title and authors` — metadata for an academic paper
- `contract clauses` — key obligations and parties
- `financial summary` — revenue, costs, EBITDA from an annual report

---

## Output

```json
{
  "extracted": { ... },
  "pages": 1,
  "error": "only present on failure"
}
```

`extracted` is a plain JSON object whose shape matches the data — Gemini picks
the keys. `pages` is the page count from `pypdf`.

---

## Worked example

Running `handler.run({"pdf": <sample.pdf as data-url>, "extract": "invoice line items"})`:

```json
{
  "extracted": {
    "invoice_line_items": [
      {
        "item_number": 1,
        "description": "Consulting — AI Strategy Workshop (2 days)",
        "quantity": 2,
        "unit_price": 1200.0,
        "vat_percentage": "19%",
        "total": 2400.0
      },
      {
        "item_number": 2,
        "description": "Software License — Floom Pro (annual)",
        "quantity": 1,
        "unit_price": 3600.0,
        "vat_percentage": "19%",
        "total": 3600.0
      },
      {
        "item_number": 3,
        "description": "Data Pipeline Setup & Configuration",
        "quantity": 1,
        "unit_price": 850.0,
        "vat_percentage": "19%",
        "total": 850.0
      },
      {
        "item_number": 4,
        "description": "Technical Documentation (20 h × €85)",
        "quantity": 20,
        "unit_price": 85.0,
        "vat_percentage": "19%",
        "total": 1700.0
      },
      {
        "item_number": 5,
        "description": "Cloud Infrastructure (March 2024)",
        "quantity": 1,
        "unit_price": 340.0,
        "vat_percentage": "19%",
        "total": 340.0
      },
      {
        "item_number": 6,
        "description": "Support & Maintenance Retainer (Q1)",
        "quantity": 1,
        "unit_price": 500.0,
        "vat_percentage": "19%",
        "total": 500.0
      },
      {
        "item_number": 7,
        "description": "Travel & Accommodation — Berlin Summit",
        "quantity": 1,
        "unit_price": 620.0,
        "vat_percentage": "0%",
        "total": 620.0
      }
    ]
  },
  "pages": 1
}
```

---

## Deploy (planned)

This template will be deployable once the Floom v0 runtime supports per-app
`requirements.txt` resolution and the sandbox image bundles `pypdf` and
`google-genai`. Today, only the demo-app handler is wired into canonical.

When the runtime work lands, deploy will be:

```bash
cd templates/pdf-to-json
floom publish .
```

The CLI packages `handler.py`, `floom.yaml`, and `requirements.txt` into a
bundle, uploads it, and returns the public run endpoint.

---

## Local test

```bash
python templates/pdf-to-json/test.py
```

Runs three checks: missing-PDF error handling, full invoice extraction, and
default `extract` fallback. Exit 0 = all pass.

---

## Environment

`GEMINI_API_KEY` — set this in the sandbox environment (or in
`~/.config/ai-sidecar/keys.json` on AX41). The handler reads from the env var
first, then falls back to the sidecar keys file.

Model used: `gemini-3-flash-preview` (Gemini 3 only — no 2.x).

---

## Limitations

- Scanned PDFs (images only, no text layer) will return an error. Use a
  separate OCR step first.
- Input is capped at 30,000 characters of extracted text (~7,500 tokens).
  Very long documents are truncated before being sent to Gemini.
- Password-protected PDFs are not supported.
