from datetime import datetime, timezone


def main():
    print(f"cron tick {datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
