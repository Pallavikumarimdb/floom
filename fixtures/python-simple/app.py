def run(inputs: dict) -> dict:
    text = inputs.get("text", "")
    return {
        "result": f"Hello: {text}",
        "length": len(text),
    }
