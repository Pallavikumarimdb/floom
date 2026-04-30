def run(inputs: dict) -> dict:
    pitch = inputs.get("pitch", "")
    return {
        "result": f"Great pitch! You said: {pitch}",
        "length": len(pitch),
    }
