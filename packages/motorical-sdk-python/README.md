# motorical (Python)

Python client for the Motorical APIs: the transactional Send API, the Public API (analytics, logs, domains, webhooks, Motor Blocks) and the Communications API. One method per `operationId` in [openapi.json](https://docs.motorical.com/openapi.json), in snake_case, generated from it. Standard library only (Python 3.8+).

```python
from motorical import Motorical, MotoricalError

m = Motorical(api_key="mk_live_...")  # Motor Block key
res = m.send_email(body={"from": "you@yourdomain.com", "to": "someone@example.com", "subject": "Hello", "text": "Hi", "dryRun": True})
```

**Arguments:** keyword arguments for path, query and header parameters (`id=`, `days=`; `webhook_id=` and `webhookId=` both work), the request body as `body=`, and `workspace_id=` for Communications calls.

**Credentials:** `api_key`, `bearer_token`, `account_key`, `dashboard_token`, `workspace_id`. Each method sends the credential its operation accepts.

**Errors** raise `MotoricalError` with `status`, `code` (branch on it: [error codes](https://docs.motorical.com/api-reference/errors)), `request_id` and `body`.

**A successful send is acceptance, not delivery:** read the outcome with `get_message` or a webhook.
