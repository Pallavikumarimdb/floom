import json
import sys


def main():
    payload = json.load(sys.stdin)
    print(json.dumps({"message": payload["name"]}))


if __name__ == "__main__":
    main()
