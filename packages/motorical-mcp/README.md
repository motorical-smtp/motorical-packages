# @motorical/mcp

MCP tools for **transactional HTTP send and delivery inspection** on Motorical Sending SMTP (same job class as SendGrid/Postmark-style email APIs).

Agents can **execute** Motorical APIs (not only read docs): dry-run / send email, mint public tokens, list Motor Blocks, inspect message events. Discovery docs remain at [docs.motorical.com/llms.txt](https://docs.motorical.com/llms.txt).

A **Motorical SMTP Motor Block** is an isolated sending stream (similar to a per-app/per-tenant ESP project).

## Tools (v1)

| Tool | Auth | Purpose |
|------|------|---------|
| `motorical_get_send_status` | none | `GET /v1/status` |
| `motorical_mint_public_token` | `ak_live_…` | Mint Public API bearer |
| `motorical_list_motor_blocks` | bearer (auto-mint) | List Motor Blocks |
| `motorical_send_email` | `mk_live_…` | Transactional `POST /v1/send` (**default `dryRun: true`**; optional **`fromName`**) |
| `motorical_get_message` | bearer | Message by UUID |
| `motorical_get_message_events` | bearer | Delivery lifecycle events |
| `motorical_sandbox_status` | `MOTORICAL_JWT` | Developer sandbox status |
| `motorical_sandbox_provision` | `MOTORICAL_JWT` | Provision `*.sandbox.motorical.com` |
| `motorical_sandbox_convert` | `MOTORICAL_JWT` | Convert sandbox → verified domain |

**Resources:** `motorical://docs/llms.txt`, `motorical://docs/openapi.json`  
**Prompt:** `motorical_integrate_send`

Safety: real sends require `dryRun: false` **and** `confirmRealSend: true`. Sandbox outbound is allowlist-locked until convert. Optional `fromName` sets the inbox display name (same as HTTP `/v1/send` / CLI `--from-name`); do not put `From` in custom headers.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `MOTORICAL_MK_API_KEY` | for send | Motor Block key `mk_live_…` |
| `MOTORICAL_AK_API_KEY` | for public API tools | Account key `ak_live_…` |
| `MOTORICAL_JWT` | for sandbox tools | Dashboard JWT from signup/login |
| `MOTORICAL_MOTOR_BLOCK_ID` | recommended | UUID used when minting tokens |
| `MOTORICAL_DEFAULT_FROM` | optional | Default From address |
| `MOTORICAL_BEARER_TOKEN` | optional | Pre-minted public bearer |
| `MOTORICAL_API_BASE_URL` | optional | default `https://api.motorical.com` |
| `MOTORICAL_DOCS_BASE_URL` | optional | default `https://docs.motorical.com` |

## Cursor install

Add to MCP config (e.g. Cursor Settings → MCP):

```json
{
  "mcpServers": {
    "motorical": {
      "command": "npx",
      "args": ["-y", "@motorical/mcp"],
      "env": {
        "MOTORICAL_MK_API_KEY": "mk_live_…",
        "MOTORICAL_AK_API_KEY": "ak_live_…",
        "MOTORICAL_MOTOR_BLOCK_ID": "your-block-uuid",
        "MOTORICAL_DEFAULT_FROM": "noreply@yourdomain.com",
        "MOTORICAL_JWT": "optional-dashboard-jwt-for-sandbox-tools"
      }
    }
  }
}
```

From a clone of this repo:

```bash
cd packages/motorical-mcp && npm ci
# point command/args at node + absolute path to src/index.js
```

## Develop / test

```bash
cd packages/motorical-mcp
npm test                 # unit + in-memory MCP
npm run smoke            # ovh24 live dry-run (creates/revokes temp keys)
```

## Out of scope (v1)

- Communications Block tools (lists/campaigns) — later
- OAuth consent / SMTP / mTLS execution — use docs + out-of-band clients
- Hosted remote MCP HTTP
