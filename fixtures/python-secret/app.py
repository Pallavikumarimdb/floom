import os


def run(inputs):
    secret = os.environ["FLOOM_TEST_SECRET"]
    return {
        "result": secret,
        "secret_present": bool(secret),
        "secret_length": len(secret),
        "message": inputs["message"],
    }
