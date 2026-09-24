# Security

These examples are intentionally minimal. Use them as starting points for production integrations with Motorical SMTP.

## Secrets

- Keep Motorical SMTP API keys, SMTP passwords, webhook secrets, and tenant IDs server-side.
- Do not expose `mk_live_...` keys in browser JavaScript, mobile apps, logs, screenshots, or support tickets.
- Use one Motorical SMTP Motor Block per application or environment when you need separate domains, rates, credentials, logs, or webhooks.
- Rotate credentials immediately if a key or SMTP password is exposed.

## Webhooks

- Verify every webhook with `X-Motorical-Signature`.
- Use the raw request body for HMAC verification.
- Return a fast `2xx` response and process work asynchronously.
- Make event handling idempotent because webhook delivery can be retried.

## Reporting Issues

For security issues in Motorical SMTP itself, contact Motorical SMTP support instead of opening a public issue with sensitive details.
