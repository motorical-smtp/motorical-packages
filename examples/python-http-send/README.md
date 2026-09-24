# Motorical SMTP Python HTTP Send

Send transactional email from Python with Motorical's transactional email API (`POST /v1/send`) using a Motor Block API key.

This example defaults to `dryRun: true`, so you can validate the payload before sending a real email.

## Setup

```bash
python3 -m venv .venv
. ./.venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Fill in values from your Motorical SMTP Motor Block:

```bash
MOTORICAL_SMTP_API_KEY=mk_live_YOUR_MOTOR_BLOCK_API_KEY
MOTORICAL_SMTP_FROM=sender@yourdomain.com
MOTORICAL_SMTP_TO=recipient@example.com
MOTORICAL_SMTP_DRY_RUN=true
```

Run:

```bash
set -a
. ./.env
set +a
python send_email.py
```

## Send a Real Email

After the dry run succeeds, set:

```bash
MOTORICAL_SMTP_DRY_RUN=false
```

## Security Notes

- Keep the Motorical SMTP API key server-side.
- Use separate SMTP Motor Blocks for staging and production.
- Use idempotency keys when retrying requests.

## Docs

- HTTP Send API quickstart: https://docs.motorical.com/send-email/http-api-quickstart
- API authentication: https://docs.motorical.com/api-reference/authentication
