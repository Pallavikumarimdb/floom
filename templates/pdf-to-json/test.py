"""
Smoke test for the PDF to JSON handler.

Usage:
    python templates/pdf-to-json/test.py

Exit 0 = pass. Prints extracted JSON so you can eyeball the output.
"""

import base64
import json
import os
import sys
from pathlib import Path

# Add the template dir to the path so handler imports work cleanly
TEMPLATE_DIR = Path(__file__).parent
sys.path.insert(0, str(TEMPLATE_DIR))

import handler  # noqa: E402  (local import after path manipulation)


def load_sample_pdf_as_data_url(path: Path) -> str:
    raw = path.read_bytes()
    b64 = base64.b64encode(raw).decode()
    return f"data:application/pdf;base64,{b64}"


def test_invoice_extraction():
    sample_pdf = TEMPLATE_DIR / "sample.pdf"
    assert sample_pdf.exists(), f"sample.pdf not found at {sample_pdf}"

    pdf_data_url = load_sample_pdf_as_data_url(sample_pdf)

    result = handler.run({
        "pdf": pdf_data_url,
        "extract": "invoice line items",
    })

    print("\n=== handler.run() output ===")
    print(json.dumps(result, indent=2))
    print("============================\n")

    # Must not be an error
    assert "error" not in result, f"handler returned error: {result['error']}"

    # Must have the expected keys
    assert "extracted" in result, "Missing 'extracted' key"
    assert "pages" in result, "Missing 'pages' key"
    assert isinstance(result["pages"], int) and result["pages"] > 0, \
        f"pages must be a positive int, got {result['pages']}"
    assert isinstance(result["extracted"], dict), \
        f"extracted must be a dict, got {type(result['extracted'])}"
    assert len(result["extracted"]) > 0, "extracted dict is empty"

    print(f"PASS: pages={result['pages']}, extracted keys={list(result['extracted'].keys())}")


def test_missing_pdf():
    result = handler.run({})
    assert "error" in result, "Expected error for missing PDF"
    print(f"PASS (missing pdf): {result['error']}")


def test_default_extract():
    sample_pdf = TEMPLATE_DIR / "sample.pdf"
    pdf_data_url = load_sample_pdf_as_data_url(sample_pdf)
    # Don't pass 'extract' — should use the default
    result = handler.run({"pdf": pdf_data_url})
    assert "error" not in result, f"Unexpected error: {result.get('error')}"
    print(f"PASS (default extract): pages={result['pages']}, keys={list(result['extracted'].keys())}")


if __name__ == "__main__":
    print("Running smoke tests for pdf-to-json handler...\n")
    test_missing_pdf()
    test_invoice_extraction()
    test_default_extract()
    print("\nAll tests passed.")
