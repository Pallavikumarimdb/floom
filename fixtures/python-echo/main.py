import json
import sys


def main():
    payload = json.load(sys.stdin)
    topic = payload["topic"]
    audience = payload.get("audience", "busy operator")
    tone = payload.get("tone", "direct")
    print(json.dumps({
        "brief": f"{tone.title()} brief for {audience}: {topic}.",
    }))


if __name__ == "__main__":
    main()
