import humanize


def run(inputs):
    count = int(inputs["count"])
    return {
        "formatted": humanize.intcomma(count),
        "package": "humanize",
    }
