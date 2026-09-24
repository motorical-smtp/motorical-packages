# Motorical SMTP Node Webhooks

Receive Motorical delivery webhook events (transactional email outcomes) and verify `X-Motorical-Signature`.

## Setup

```bash
cp .env.example .env
```

Set the webhook secret returned when you create a webhook:

```bash
MOTORICAL_SMTP_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
PORT=3000
```

Run the server:

```bash
set -a
. ./.env
set +a
npm start
```

Configure your Motorical SMTP webhook URL to point to:

```text
https://your-app.example.com/webhooks/motorical-smtp
```

## How Verification Works

Motorical SMTP signs the raw JSON body with HMAC-SHA256 and sends the digest in `X-Motorical-Signature`. Verify the signature before parsing or processing the event.

## Production Notes

- Store processed event IDs so retries are idempotent.
- Return a fast `2xx` response, then process asynchronously.
- Use separate SMTP Motor Blocks for staging and production webhook endpoints.
- Do not log webhook secrets or raw payloads that contain customer data.

## Docs

- Webhook guide: https://docs.motorical.com/guides/webhook-delivery-events
- Webhook API reference: https://docs.motorical.com/api-reference/webhooks
