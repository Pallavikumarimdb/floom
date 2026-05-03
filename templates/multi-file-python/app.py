import json
import os
import sys

from utils import summarize


def main():
    raw = os.environ.get("FLOOM_INPUTS") or sys.stdin.read() or "{}"
    inputs = json.loads(raw)
    print(json.dumps(summarize(inputs)))


if __name__ == "__main__":
    main()
