# @motorical/sdk

Node.js client for the Motorical APIs: the transactional Send API, the Public API (analytics, logs, domains, webhooks, Motor Blocks) and the Communications API. One method per `operationId` in [openapi.json](https://docs.motorical.com/openapi.json), generated from it, no dependencies (Node 18+, built-in `fetch`).

```js
const { Motorical, MotoricalError } = require('@motorical/sdk');

const m = new Motorical({ apiKey: process.env.MOTORICAL_API_KEY }); // mk_live_... Motor Block key

const res = await m.sendEmail({
  body: { from: 'you@yourdomain.com', to: 'someone@example.com', subject: 'Hello', text: 'Hi', dryRun: true },
});
```

**Arguments:** one object with path, query and header parameters by their API name (`{ id, days }`, `{ 'Idempotency-Key': ... }` or `idempotencyKey`), the request body as `body`, and `workspaceId` for Communications calls.

**Credentials** (pass the ones you use): `apiKey` (Motor Block key, Send API), `bearerToken` (Public API token or OAuth access token), `accountKey` (`ak_live_...`, token minting and the Communications API), `dashboardToken`, `workspaceId`. Each method sends the credential its operation accepts.

**Errors** throw `MotoricalError` with `status`, `code` (branch on it: [error codes](https://docs.motorical.com/api-reference/errors)), `requestId` (quote it to support) and `body`.

**A successful send is acceptance, not delivery:** read the outcome with `getMessage` or a webhook.

Method names never change once published ([versioning policy](https://docs.motorical.com/api-reference/versioning)). Regenerate with `node packages/sdk-generator/generate.js` after the OpenAPI changes.
