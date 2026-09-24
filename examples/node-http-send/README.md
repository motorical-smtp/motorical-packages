# Motorical SMTP Node HTTP Send

Send transactional email from Node.js with Motorical's transactional email API (`POST /v1/send`) using a Motor Block API key.

This example starts with `dryRun: true`, so the API validates authentication, sender domain, recipient shape, subject, and body without queueing an email.

## Setup

```bash
cp .env.example .env
```

Fill in values from your Motorical SMTP Motor Block:

```bash
MOTORICAL_SMTP_API_KEY=mk_live_YOUR_MOTOR_BLOCK_API_KEY
MOTORICAL_SMTP_FROM=sender@yourdomain.com
MOTORICAL_SMTP_TO=recipient@example.com
MOTORICAL_SMTP_DRY_RUN=true
```

Load the environment and run:

```bash
set -a
. ./.env
set +a
npm run send
```

## Send a Real Email

After the dry run returns `status: "validated"`, set:

```bash
MOTORICAL_SMTP_DRY_RUN=false
```

Then run the command again.

## Security Notes

- Use a Motorical SMTP Motor Block API key shaped like `mk_live_...`.
- Keep the key server-side.
- Use separate SMTP Motor Blocks for staging and production.
- Keep the `Idempotency-Key` header when requests can be retried.

## Docs

- HTTP Send API quickstart: https://docs.motorical.com/send-email/http-api-quickstart
- API authentication: https://docs.motorical.com/api-reference/authentication
