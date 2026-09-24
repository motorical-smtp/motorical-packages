import json
import os
import sys

import requests


API_URL = "https://api.motorical.com/v1/send"


def require_env(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def main():
    api_key = require_env("MOTORICAL_SMTP_API_KEY")
    dry_run = os.environ.get("MOTORICAL_SMTP_DRY_RUN", "true").lower() != "false"

    response = requests.post(
        API_URL,
        headers={
            "Authorization": f"ApiKey {api_key}",
            "Content-Type": "application/json",
            "Idempotency-Key": f"python-example-{os.getpid()}",
        },
        json={
            "from": require_env("MOTORICAL_SMTP_FROM"),
            "to": [require_env("MOTORICAL_SMTP_TO")],
            "subject": "Motorical SMTP dry run" if dry_run else "Hello from Motorical SMTP",
            "text": "This message was sent with the Motorical SMTP HTTP Send API.",
            "html": "<p>This message was sent with the <strong>Motorical SMTP</strong> HTTP Send API.</p>",
            "dryRun": dry_run,
        },
        timeout=30,
    )

    result = response.json()
    if not response.ok or not result.get("success"):
        raise RuntimeError(result.get("error") or f"Motorical SMTP send failed with {response.status_code}")

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
