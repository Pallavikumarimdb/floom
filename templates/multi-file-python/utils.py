from textwrap import shorten


def summarize(inputs):
    text = str(inputs.get("text") or "").strip()
    return {
        "preview": shorten(text, width=40, placeholder="..."),
        "length": len(text),
        "word_count": len([part for part in text.split() if part]),
    }
