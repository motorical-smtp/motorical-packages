# @motorical/mcp

MCP tools for **transactional HTTP send and delivery inspection** on Motorical Sending SMTP (same job class as SendGrid/Postmark-style email APIs).

Agents can **execute** Motorical APIs (not only read docs): dry-run / send email, manage production Motor Blocks, inspect message events, and guide sandbox-to-production setup. Discovery docs remain at [docs.motorical.com/llms.txt](https://docs.motorical.com/llms.txt).

**Agents: start here.** Not sure this package is the right route? [docs.motorical.com/agents](https://docs.motorical.com/agents) has the route chooser (this local server vs. the hosted OAuth server at `mcp.motorical.com` vs. the plain HTTP API), a rulebook, and journeys for every starting situation.

A **Motorical SMTP Motor Block** is an isolated sending stream (similar to a per-app/per-tenant ESP project).

## Tools (v1.18.0)

| Tool | Auth | Purpose |
|------|------|---------|
| `motorical_get_send_status` | none | `GET /v1/status` |
| `motorical_mint_public_token` | `ak_live_…` | Mint Public API bearer |
| `motorical_list_motor_blocks` | bearer (auto-mint) | List Motor Blocks |
| `motorical_send_email` | `mk_live_…` | Transactional `POST /v1/send` (**default `dryRun: true`**; optional **`fromName`**) |
| `motorical_get_message` | bearer | Message by UUID |
| `motorical_get_message_events` | bearer | Delivery lifecycle events |
| `motorical_sandbox_status` | `MOTORICAL_JWT` | Developer sandbox status |
| `motorical_sandbox_provision` | `MOTORICAL_JWT` | Provision the sandbox on a Motorical-owned `.sandbox` domain (a Free account with its own fully verified domain gets one on it automatically when automatic provisioning is enabled) |
| `motorical_sandbox_convert` | `MOTORICAL_JWT` | Convert sandbox → verified domain |
| `motorical_motor_block_list` | dashboard JWT / OAuth | List manageable production blocks |
| `motorical_motor_block_create` | dashboard JWT / OAuth | Create a transactional or general-purpose block |
| `motorical_motor_block_rename` | dashboard JWT / OAuth | Rename display identity; SMTP username is unchanged |
| `motorical_motor_block_change_type` | dashboard JWT / OAuth | Switch transactional ↔ general-purpose (confirmation required) |
| `motorical_motor_block_assign_domain` | dashboard JWT / OAuth | Assign a verified production domain (confirmation required) |
| `motorical_motor_block_deactivate` | dashboard JWT / OAuth | Reversibly pause sending (confirmation required) |
| `motorical_motor_block_reactivate` | dashboard JWT / OAuth | Resume a deactivated block |
| `motorical_motor_block_delete` | dashboard JWT / OAuth | Queue irreversible permanent deletion (confirmation required) |
| `motorical_motor_block_delete_status` | dashboard JWT / OAuth | Poll an asynchronous deletion job |

**Resources:** `motorical://docs/llms.txt`, `motorical://docs/openapi.json`  
**Prompt:** `motorical_integrate_send`

Safety: real sends require `dryRun: false` **and** `confirmRealSend: true`. Type/domain changes, deactivation, sandbox conversion, and permanent deletion use argument-bound MRTR confirmation. Sandbox conversion changes the SMTP username but preserves the password, API keys, and auth method. Ordinary rename never changes credentials. Optional `fromName` sets the inbox display name (same as HTTP `/v1/send`); do not put `From` in custom headers.

The dedicated least-privilege hosted server is `https://mcp.motorical.com/v1/motorical_motor_blocks/mcp` with OAuth scope `manage:motor-blocks`. A newly created block is appended to the live grant and can be used immediately by explicit id without refreshing the access token.

## Hosted or local?

This package is the **local** stdio server. Which one do I use? Three routes exist (hosted MCP, agent-led onboarding over the HTTP API, and this package); the comparison is at https://docs.motorical.com/ai-mcp#which-route. If you only want to give Claude Code, Claude Desktop or Claude.ai access to your Motorical account, you do not need it: use the hosted server instead, with nothing to install.

**Connect (hosted, nothing to install).** In your terminal, in a normal shell and not inside a Claude session, run `claude mcp add --transport http motorical https://mcp.motorical.com/v1/motorical/mcp`. Then start a new Claude Code session (one that was already open may not list the new server), type `/mcp`, pick `motorical`, and choose Authenticate. If you would rather have an account first, create it at https://motorical.com/register and then connect; sign-in at the consent step works the same. A browser opens: sign in, or create your account (two-factor authentication is required and cannot be skipped), then press Allow. Back in the session the Motorical tools are there; you do not run Authenticate a second time. In Claude Desktop or Claude.ai, add a custom connector with the same URL (`https://mcp.motorical.com/v1/motorical/mcp`). Other agents (ChatGPT, Codex, Cursor, VS Code, any MCP client): see https://docs.motorical.com/ai-mcp-hosted#connect. This is the hosted MCP server: no install and no key. The npm package `@motorical/mcp` is a different, local option for API-key setups, and `@motorical/cli` is retired.

Use this package when you need a client that only speaks local stdio, allowlisting by 6-digit code, browser handoff, or unmasked PII.

## Authorization (recommended)

Sign in once; no keys to paste, copy, or rotate by hand:

```bash
npx @motorical/mcp login
```

This opens your browser, you approve the scopes on Motorical's consent screen,
and the grant is stored at `~/.motorical/mcp-credentials.json` (owner-only,
`0600`). Access tokens last an hour and refresh silently.

- `motorical-mcp status` — show the current connection

An authorization covers **every Motor Block you own**, so block-scoped calls
must say which one they mean. Set `MOTORICAL_MOTOR_BLOCK_ID` (or pass
`motorBlockId` per call); the tools fail with a clear message rather than a bare
API error if it is missing.
- `motorical-mcp logout` — remove the local credentials

Logging out only deletes the local file. To cut the agent's access off at the
server, revoke the connection in **Settings → API Access → Connected AI
Agents**; that takes effect immediately, on every device, and does not sign you
out of your own dashboard.

Under the hood this is OAuth 2.1: PKCE `S256`, a loopback redirect, RFC 8707
audience-bound tokens, and RFC 9207 issuer checking on the callback. The client
is public, so refresh tokens rotate on every use.

The environment variables below still work and are the right choice for CI or a
headless server, where no browser is available. When an OAuth session is present
it takes precedence over them.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `MOTORICAL_MK_API_KEY` | for send | Motor Block key `mk_live_…` |
| `MOTORICAL_AK_API_KEY` | for public API tools | Account key `ak_live_…` |
| `MOTORICAL_JWT` | for sandbox tools | Dashboard JWT from signup/login |
| `MOTORICAL_MOTOR_BLOCK_ID` | recommended | UUID used when minting tokens |
| `MOTORICAL_SMTP_USERNAME` | optional | Cached local SMTP username; sandbox conversion will not overwrite an explicit value |
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
