# Motorical SMTP Nodemailer

Send email from Node.js with Nodemailer over Motorical's SMTP relay (`mail.motorical.com`) using credentials from a Motorical SMTP Motor Block (isolated sending stream).

Use this when your application or framework already supports SMTP and you want each app, domain, or environment isolated through its own SMTP Motor Block.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in SMTP credentials from your Motorical SMTP dashboard:

```bash
MOTORICAL_SMTP_HOST=smtp.motorical.com
MOTORICAL_SMTP_PORT=587
MOTORICAL_SMTP_USER=your_smtp_motor_block_username
MOTORICAL_SMTP_PASSWORD=your_smtp_motor_block_password
MOTORICAL_SMTP_FROM=sender@yourdomain.com
MOTORICAL_SMTP_TO=recipient@example.com
```

Run:

```bash
set -a
. ./.env
set +a
npm run send
```

## Security Notes

- Keep SMTP passwords server-side.
- Use one SMTP Motor Block per app or environment when you need separate credentials, logs, rates, or webhooks.
- Rotate credentials if they are exposed.

## Docs

- SMTP code examples: https://docs.motorical.com/smtp-integration/code-examples
- SMTP setup guide: https://docs.motorical.com/email-mailboxes/setup-guide
