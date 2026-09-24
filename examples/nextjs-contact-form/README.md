# Motorical SMTP Next.js Contact Form

Send contact form messages through Motorical's transactional email API from a server-side Next.js route.

The Motor Block API key (`mk_live_...`) stays on the server. Do not call the HTTP Send API directly from browser code.

## Setup

Copy the environment file:

```bash
cp .env.example .env.local
```

Fill in values from your Motorical SMTP Motor Block:

```bash
MOTORICAL_SMTP_API_KEY=mk_live_YOUR_MOTOR_BLOCK_API_KEY
MOTORICAL_SMTP_FROM=contact@yourdomain.com
MOTORICAL_SMTP_TO=support@yourdomain.com
```

Place `app/api/contact/route.js` in your Next.js app. Submit JSON to `/api/contact`:

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "message": "Can you tell me more about Motorical SMTP?"
}
```

## Test Mode

Set this while developing:

```bash
MOTORICAL_SMTP_DRY_RUN=true
```

The route will validate the Motorical SMTP payload without queueing a real email.

## Security Notes

- Keep `MOTORICAL_SMTP_API_KEY` server-side.
- Validate and rate-limit public form submissions before production use.
- Use a dedicated SMTP Motor Block for contact form mail if you want separate logs, rates, credentials, and webhook events.

## Docs

- HTTP Send API quickstart: https://docs.motorical.com/send-email/http-api-quickstart
- Delivery logs: https://docs.motorical.com/guides/delivery-logs-status
