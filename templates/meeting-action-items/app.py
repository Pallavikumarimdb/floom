def run(inputs):
    transcript = inputs.get("transcript", "")
    default_owner = inputs.get("default_owner", "")
    items = []

    for raw_line in transcript.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        lowered = line.lower()
        if not any(marker in lowered for marker in ["action", "todo", "will", "owns"]):
            continue

        owner = default_owner
        owner_line = line
        if ":" in owner_line and owner_line.split(":", 1)[0].strip().lower() in {"action", "todo"}:
            owner_line = owner_line.split(":", 1)[1].strip()
        words = owner_line.replace(":", " ").split()
        if words and words[0].istitle():
            owner = words[0]

        due = ""
        for marker in ["today", "tomorrow", "friday", "eow", "next week"]:
            if marker in lowered:
                due = marker
                break

        task = line
        if ":" in task:
            task = task.split(":", 1)[1].strip()

        items.append({
            "task": task,
            "owner": owner,
            "due": due,
        })

    return {
        "count": len(items),
        "items": items,
    }
