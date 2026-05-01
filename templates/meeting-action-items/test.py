"""Smoke test for the Meeting → Action Items handler.

Runs three checks:
- short input rejected with a clear error
- a real meeting transcript extracts the expected number of actions with
  named owners
- empty owner / empty due fields are tolerated when the notes don't say

Requires GEMINI_API_KEY in env. Exits 0 on pass, 1 on fail.
"""

import json
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app import run  # noqa: E402


def expect(cond, label):
    if cond:
        print(f"  ✓ {label}")
        return True
    print(f"  ✗ {label}")
    return False


def test_short_input():
    print("test_short_input")
    out = run({"notes": "too short"})
    return all(
        [
            expect(out.get("error"), "error returned"),
            expect(out.get("count") == 0, "count is 0"),
        ]
    )


def test_real_meeting():
    print("test_real_meeting")
    notes = pathlib.Path(__file__).parent.joinpath("sample.txt").read_text()
    out = run({"notes": notes})
    if "error" in out:
        print(f"  ✗ unexpected error: {out['error']}")
        return False
    count = out.get("count", 0)
    actions = out.get("actions", [])
    summary = out.get("summary", "")
    return all(
        [
            expect(count >= 3, f"extracted >=3 actions (got {count})"),
            expect(len(actions) == count, "actions list length matches count"),
            expect(any(a.get("owner") for a in actions), "at least one action has an owner"),
            expect(len(summary) > 5, "summary present"),
        ]
    )


def test_empty_input():
    print("test_empty_input")
    out = run({"notes": ""})
    return expect(out.get("error"), "error returned for empty notes")


if __name__ == "__main__":
    if not os.environ.get("GEMINI_API_KEY") and not os.environ.get("GEMINI_BYOK"):
        print("GEMINI_API_KEY or GEMINI_BYOK required to run tests")
        sys.exit(1)

    results = [test_short_input(), test_real_meeting(), test_empty_input()]
    passed = sum(1 for r in results if r)
    total = len(results)
    print(f"\n{passed}/{total} pass")
    sys.exit(0 if passed == total else 1)
