import os


def run(inputs):
    secret = os.environ["FLOOM_TEST_SECRET"]
    return {
        "result": secret,
        "env_present": bool(secret),
        "env_length": len(secret),
        "message": inputs["message"],
    }
