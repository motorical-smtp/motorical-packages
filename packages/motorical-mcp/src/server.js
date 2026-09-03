import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MotoricalClient, loadConfig } from './client.js';

const PACKAGE_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url))
).version;

function jsonResult(data, { isError = false } = {}) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: typeof data === 'object' && data !== null ? data : { value: data },
    isError
  };
}

function errorResult(err) {
  return jsonResult(
    {
      error: err.message,
      status: err.status || null,
      details: err.data || null
    },
    { isError: true }
  );
}

/**
 * Create a configured Motorical MCP server (stdio/HTTP transport attached by caller).
 */
export function createMotoricalMcpServer(options = {}) {
  const client = options.client || new MotoricalClient(options.config || loadConfig());

  const server = new McpServer({
    name: 'motorical',
    version: PACKAGE_VERSION
  });

  // The stdio/CLI entrypoint (index.js) calls this with no allowedTools and
  // gets every tool, unaffected. The HTTP resource server (http.js) passes
  // the connected server's own tool list: without this, tools/list would
  // advertise every tool on every path — e.g. motorical_send_email on the
  // analytics-only server — even though calling it there would be refused.
  // The advertisement must match what's actually callable.
  const allowedTools = options.allowedTools || null;
  function registerTool(name, config, cb) {
    if (allowedTools && !allowedTools.includes(name)) return;
    server.registerTool(name, config, cb);
  }

  registerTool(
    'motorical_get_send_status',
    {
      description:
        'Check Motorical transactional email HTTP Send API status (GET /v1/status). No auth required.',
      inputSchema: {}
    },
    async () => {
      try {
        return jsonResult(await client.getSendApiStatus());
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_mint_public_token',
    {
      description:
        'Mint a short-lived Public Analytics API bearer token using MOTORICAL_AK_API_KEY (ak_live_...) ' +
        'or, when none is configured, MOTORICAL_JWT. ' +
        'Use for /api/public/v1 logs, analytics, webhooks, config. Not for POST /v1/send.',
      inputSchema: {
        motorBlockId: z.string().uuid().optional().describe('Defaults to MOTORICAL_MOTOR_BLOCK_ID'),
        scopes: z.array(z.string()).optional(),
        ttlSeconds: z.number().int().min(60).max(900).optional()
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.mintPublicToken(args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_list_motor_blocks',
    {
      description:
        'List Motor Blocks (isolated sending streams) visible to a Public API bearer token (auto-mints with ak_live_ if needed).',
      inputSchema: {
        motorBlockId: z.string().uuid().optional().describe('Optional. Listing is account-wide; a block is only used when minting a legacy public token on the non-OAuth path.')
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.listMotorBlocks(args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_send_email',
    {
      description:
        'Transactional email: send or validate via POST /v1/send using MOTORICAL_MK_API_KEY (mk_live_...). ' +
        'Defaults to dryRun:true. Real sends require dryRun:false AND confirmRealSend:true. ' +
        'Do not use OAuth access tokens or Bearer tokens here. ' +
        'For developer-sandbox accounts, a non-allowlisted recipient is redirected to the account ' +
        'email rather than rejected — check the response\'s sandboxRedirect field.',
      inputSchema: {
        from: z.string().email().optional().describe('Defaults to MOTORICAL_DEFAULT_FROM'),
        fromName: z
          .string()
          .max(78)
          .optional()
          .describe('Optional From display name (do not put From in headers — use this field)'),
        to: z.union([z.string().email(), z.array(z.string().email())]),
        subject: z.string().min(1),
        text: z.string().optional(),
        html: z.string().optional(),
        dryRun: z.boolean().optional().describe('Default true — validate without queueing'),
        confirmRealSend: z
          .boolean()
          .optional()
          .describe('Required true when dryRun is false'),
        idempotencyKey: z.string().optional(),
        motorBlockId: z
          .string()
          .uuid()
          .optional()
          .describe('Required when the authorization covers more than one Motor Block')
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.sendEmail(args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_get_message',
    {
      description: 'Get a message by send UUID (GET /api/public/v1/messages/{id}). Auto-mints bearer if needed.',
      inputSchema: {
        messageId: z.string().uuid(),
        includePII: z.boolean().optional(),
        motorBlockId: z.string().uuid().optional()
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.getMessage(args.messageId, args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_get_message_events',
    {
      description:
        'Get delivery lifecycle events for a message (GET /api/public/v1/messages/{id}/events).',
      inputSchema: {
        messageId: z.string().uuid(),
        includePII: z.boolean().optional(),
        motorBlockId: z.string().uuid().optional()
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.getMessageEvents(args.messageId, args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_sandbox_status',
    {
      description:
        'Get developer sandbox status (domain, Motor Block, outbound lock, allowlist). ' +
        'Check data.stage to determine provisioning state: "not_started" (no sandbox yet — call ' +
        'motorical_sandbox_provision), "sandbox_active" (sandbox exists, outbound-locked), or "live" ' +
        '(converted to production, no lock). allowlist/caps are always present in the response regardless ' +
        'of stage — do not infer provisioning state from their presence. Requires MOTORICAL_JWT.',
      inputSchema: {}
    },
    async () => {
      try {
        return jsonResult(await client.sandboxStatus());
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_sandbox_allowlist_request',
    {
      description:
        'Request to add a new recipient to the developer sandbox outbound allowlist. ' +
        'Sends a 6-digit confirmation code to that address (not the account owner) — ' +
        'call motorical_sandbox_allowlist_confirm with the code the recipient receives. Requires MOTORICAL_JWT.',
      inputSchema: {
        email: z.string().email()
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.sandboxAllowlistRequest(args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_sandbox_allowlist_confirm',
    {
      description:
        'Confirm a sandbox allowlist recipient using the 6-digit code sent by ' +
        'motorical_sandbox_allowlist_request. On success the address is added to the ' +
        'allowlist and can receive real (non-dryRun) sandbox sends. Requires MOTORICAL_JWT.',
      inputSchema: {
        email: z.string().email(),
        code: z.string().length(6)
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.sandboxAllowlistConfirm(args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_sandbox_provision',
    {
      description:
        'Provision unpaid developer sandbox (*.sandbox.motorical.com + outbound-locked Motor Block). ' +
        'Returns mk_live_ once. Requires MOTORICAL_JWT from signup/login. channel defaults to agent.',
      inputSchema: {
        handle: z.string().optional(),
        channel: z.enum(['cli', 'agent', 'web']).optional()
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.sandboxProvision(args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_sandbox_convert',
    {
      description:
        'Convert sandbox Motor Block onto a verified customer domain. Requires active Motorical Plan + MOTORICAL_JWT. ' +
        'If no sandbox exists yet (check motorical_sandbox_status first — data.stage: "not_started"), call ' +
        'motorical_sandbox_provision instead; this endpoint returns 404 "No developer sandbox to convert" otherwise.',
      inputSchema: {
        domainId: z.string().uuid()
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.sandboxConvert(args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_domain_add',
    {
      description:
        'Add a customer domain (POST /api/domains). Returns verification DNS instructions. ' +
        'For cname_managed DKIM publish the CNAME in verification.records.dkim / dnsRecords (not a TXT p= key). ' +
        'On 409 (domain already registered), call motorical_domain_list first to check whether it is already on ' +
        'this account before asking the user to resolve the conflict. Requires MOTORICAL_JWT.',
      inputSchema: {
        domain: z.string().min(3),
        verificationMethod: z.enum(['dns', 'email']).optional(),
        motorBlockId: z
          .string()
          .uuid()
          .optional()
          .describe('Optional. This operation acts on the whole account, so a Motor Block is never needed; pass one only to record which block the call was made on behalf of.')
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.domainAdd(args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_domain_list',
    {
      description:
        'List domains already on this account (GET /api/domains) — id, domain, verified, DNS auth flags. ' +
        'Call this before motorical_domain_add on a 409 conflict to self-diagnose whether the domain is already ' +
        'yours (proceed with the existing id) or genuinely owned by someone else (stop, do not guess). Requires MOTORICAL_JWT.',
      inputSchema: {
        motorBlockId: z
          .string()
          .uuid()
          .optional()
          .describe('Optional. This operation acts on the whole account, so a Motor Block is never needed; pass one only to record which block the call was made on behalf of.')
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.domainList(args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_domain_verify',
    {
      description:
        'Verify domain ownership and refresh DKIM/SPF/DMARC send-readiness flags (POST /api/domains/{id}/verify). ' +
        'Safe to re-call after ownership is done — returns sendReady. Requires MOTORICAL_JWT.',
      inputSchema: {
        domainId: z.string().uuid(),
        method: z.enum(['dns', 'email']).optional(),
        motorBlockId: z
          .string()
          .uuid()
          .optional()
          .describe('Optional. This operation acts on the whole account, so a Motor Block is never needed; pass one only to record which block the call was made on behalf of.')
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.domainVerify(args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_domain_check_dns',
    {
      description:
        'Live-check DKIM/SPF/DMARC and persist dkim_configured/spf_configured (POST /api/domains/{id}/check-dns). ' +
        'Required before /v1/send when ownership is verified but send returns DOMAIN_DNS_INCOMPLETE. Requires MOTORICAL_JWT.',
      inputSchema: {
        domainId: z.string().uuid(),
        recordType: z.enum(['dkim', 'spf', 'dmarc', 'mx']).optional(),
        motorBlockId: z
          .string()
          .uuid()
          .optional()
          .describe('Optional. This operation acts on the whole account, so a Motor Block is never needed; pass one only to record which block the call was made on behalf of.')
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.domainCheckDns(args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool(
    'motorical_web_handoff',
    {
      description:
        'Mint a one-time CLI→browser handoff URL (POST /api/auth/web-handoff). ' +
        'Open the URL so the human can set a dashboard password / use the UI. Requires MOTORICAL_JWT.',
      inputSchema: {
        path: z.string().optional().describe('Optional in-app path after handoff, e.g. /usage')
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.webHandoff(args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ---- Analytics & health tools ----
  // Each wraps one existing Public API route one-to-one. See
  // motorical-docs/plans/2026-09-02-mcp-analytics-health-tools-implementation.md.
  // .optional() on purpose, matching every pre-existing block-scoped tool: a
  // grant covering exactly one Motor Block resolves it automatically, so the
  // caller only has to name one when the grant covers several. Making it
  // required forces single-block users to supply an id they should never need,
  // and turns the multi-block case into a Zod type error instead of
  // resolveBlock's actionable message.
  const blockSelector = z.string().uuid().optional()
    .describe('Required when the authorization covers more than one Motor Block');
  const isoDate = (bound) => z.string().optional().describe(`ISO date or datetime, ${bound}`);

  registerTool(
    'motorical_get_overview',
    {
      description:
        'Sending overview for one Motor Block over a date range — volume, delivery and bounce '
        + 'rates, and current usage against plan limits (GET /api/public/v1/motor-blocks/{id}/overview).',
      inputSchema: {
        motorBlockId: blockSelector,
        from: isoDate('inclusive'),
        to: isoDate('inclusive')
      }
    },
    async (args) => {
      try {
        return jsonResult(await client.getOverview(args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  registerTool('motorical_get_daily_summary', {
    description: 'Per-day send counts and outcomes for one Motor Block (GET /api/public/v1/motor-blocks/{id}/daily-summary).',
    inputSchema: {
      motorBlockId: blockSelector,
      days: z.number().int().positive().optional().describe('How many days back, counting today')
    }
  }, async (args) => { try { return jsonResult(await client.getDailySummary(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_get_metrics', {
    description: 'Time-series send metrics for one Motor Block, bucketed by hour or day (GET /api/public/v1/motor-blocks/{id}/metrics).',
    inputSchema: {
      motorBlockId: blockSelector,
      from: isoDate('inclusive'),
      to: isoDate('inclusive'),
      interval: z.enum(['hour', 'day']).optional().describe('Bucket size; defaults to the API default')
    }
  }, async (args) => { try { return jsonResult(await client.getMetrics(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_get_deliverability', {
    description: 'Deliverability broken down by recipient domain (GET /api/public/v1/motor-blocks/{id}/deliverability).',
    inputSchema: {
      motorBlockId: blockSelector,
      from: isoDate('inclusive'),
      to: isoDate('inclusive'),
      limit: z.number().int().positive().optional().describe('Max recipient domains returned')
    }
  }, async (args) => { try { return jsonResult(await client.getDeliverability(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_get_reputation', {
    description: 'Current sending reputation for one Motor Block (GET /api/public/v1/motor-blocks/{id}/reputation).',
    inputSchema: { motorBlockId: blockSelector }
  }, async (args) => { try { return jsonResult(await client.getReputation(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_get_anomalies', {
    description: 'Detected sending anomalies for one Motor Block — volume spikes, bounce surges, unusual patterns (GET /api/public/v1/motor-blocks/{id}/anomalies).',
    inputSchema: { motorBlockId: blockSelector }
  }, async (args) => { try { return jsonResult(await client.getAnomalies(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_get_providers', {
    description: 'Send outcomes grouped by receiving mailbox provider (GET /api/public/v1/motor-blocks/{id}/providers).',
    inputSchema: {
      motorBlockId: blockSelector,
      from: isoDate('inclusive'),
      to: isoDate('inclusive'),
      limit: z.number().int().positive().optional().describe('Max providers returned')
    }
  }, async (args) => { try { return jsonResult(await client.getProviders(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_get_error_codes', {
    description: 'SMTP error codes seen for one Motor Block, with counts and diagnostics (GET /api/public/v1/motor-blocks/{id}/error-codes).',
    inputSchema: {
      motorBlockId: blockSelector,
      from: isoDate('inclusive'),
      to: isoDate('inclusive'),
      limit: z.number().int().positive().optional().describe('Max distinct error codes returned')
    }
  }, async (args) => { try { return jsonResult(await client.getErrorCodes(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_get_rate_limits', {
    description: "Current hourly and daily send usage against this Motor Block's limits (GET /api/public/v1/motor-blocks/{id}/rate-limits).",
    inputSchema: { motorBlockId: blockSelector }
  }, async (args) => { try { return jsonResult(await client.getRateLimits(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_get_account_rate_limits', {
    description:
      'Account-wide send ceiling and current usage across every Motor Block '
      + '(GET /api/public/v1/account/rate-limits). Account-scoped: no Motor Block needed.',
    inputSchema: {
      motorBlockId: z.string().uuid().optional()
        .describe('Optional. This operation acts on the whole account, so a Motor Block is never needed; pass one only to record which block the call was made on behalf of.')
    }
  }, async (args) => { try { return jsonResult(await client.getAccountRateLimits(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_get_logs', {
    description:
      'Search send logs for one Motor Block (GET /api/public/v1/motor-blocks/{id}/logs). '
      + 'Paginate with cursor. Recipient addresses are masked unless the token carries logs.pii, '
      + 'which OAuth tokens never do.',
    inputSchema: {
      motorBlockId: blockSelector,
      from: isoDate('inclusive'),
      to: isoDate('inclusive'),
      currentOutcome: z.string().optional().describe('Filter to one delivery outcome, e.g. delivered, bounced, deferred'),
      query: z.string().optional().describe('Free-text match against recipient, subject or message id'),
      limit: z.number().int().positive().optional().describe('Page size'),
      cursor: z.string().optional().describe('Opaque cursor from a previous page'),
      includePII: z.boolean().optional().describe('Unmask recipient addresses. Requires the logs.pii scope, which is never granted to OAuth tokens — the API returns 403.')
    }
  }, async (args) => { try { return jsonResult(await client.getLogs(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_get_message_by_smtp_id', {
    description:
      'Look up one message by its SMTP Message-ID header (GET /api/public/v1/messages?smtpMessageId=). '
      + 'This is a lookup, not a listing: an exact id is required and at most one message is returned. '
      + 'Use motorical_get_message when you have the internal send UUID instead.',
    inputSchema: {
      smtpMessageId: z.string().describe('The exact SMTP Message-ID, angle brackets included'),
      motorBlockId: blockSelector,
      includePII: z.boolean().optional().describe('Unmask the recipient address. Requires the logs.pii scope, which is never granted to OAuth tokens — the API returns 403.')
    }
  }, async (args) => { try { return jsonResult(await client.getMessageBySmtpId(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_get_config', {
    description: "Configuration of one Motor Block — its sending domain, limits and delivery settings (GET /api/public/v1/motor-blocks/{id}/config).",
    inputSchema: { motorBlockId: blockSelector }
  }, async (args) => { try { return jsonResult(await client.getConfig(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_get_domain_health', {
    description: "DNS and email-authentication health for the Motor Block's sending domain — SPF, DKIM, DMARC, MX (GET /api/public/v1/motor-blocks/{id}/domain-health).",
    inputSchema: {
      motorBlockId: blockSelector,
      refresh: z.boolean().optional().describe('Re-run the live DNS checks now instead of returning the last cached result')
    }
  }, async (args) => { try { return jsonResult(await client.getDomainHealth(args)); } catch (err) { return errorResult(err); } });

  const webhookIdArg = z.string().describe('The webhook endpoint id, from motorical_webhook_list or the create response');

  registerTool('motorical_webhook_list', {
    description: 'List webhook endpoints registered on one Motor Block (GET /api/public/v1/motor-blocks/{id}/webhooks).',
    inputSchema: { motorBlockId: blockSelector }
  }, async (args) => { try { return jsonResult(await client.webhookList(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_webhook_create', {
    description:
      'Register a new webhook endpoint on one Motor Block (POST /api/public/v1/motor-blocks/{id}/webhooks). '
      + 'The response includes the full signing secret exactly once — store it immediately, it is only masked on every later read.',
    inputSchema: {
      motorBlockId: blockSelector,
      url: z.string().url().describe('HTTPS endpoint that will receive webhook deliveries'),
      events: z.array(z.string()).optional().describe('Event types to subscribe to; defaults to all event types when omitted')
    }
  }, async (args) => { try { return jsonResult(await client.webhookCreate(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_webhook_update', {
    description: 'Update a webhook endpoint\'s url, events, or enabled state (PUT /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}). Only the fields you pass are changed.',
    inputSchema: {
      motorBlockId: blockSelector,
      webhookId: webhookIdArg,
      url: z.string().url().optional(),
      events: z.array(z.string()).optional(),
      enabled: z.boolean().optional()
    }
  }, async (args) => { try { return jsonResult(await client.webhookUpdate(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_webhook_delete', {
    description: 'Delete a webhook endpoint (DELETE /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}).',
    inputSchema: { motorBlockId: blockSelector, webhookId: webhookIdArg }
  }, async (args) => { try { return jsonResult(await client.webhookDelete(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_webhook_test', {
    description: 'Send a synthetic test delivery to a webhook endpoint (POST /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/test).',
    inputSchema: { motorBlockId: blockSelector, webhookId: webhookIdArg }
  }, async (args) => { try { return jsonResult(await client.webhookTest(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_webhook_get_deliveries', {
    description: 'Recent delivery attempts for one webhook endpoint (GET /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/deliveries).',
    inputSchema: {
      motorBlockId: blockSelector,
      webhookId: webhookIdArg,
      limit: z.number().int().positive().max(200).optional().describe('Default 50, max 200')
    }
  }, async (args) => { try { return jsonResult(await client.webhookGetDeliveries(args)); } catch (err) { return errorResult(err); } });

  registerTool('motorical_webhook_get_stats', {
    description: 'Delivery success/failure counts and average latency for one webhook endpoint over a time window (GET /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/stats).',
    inputSchema: {
      motorBlockId: blockSelector,
      webhookId: webhookIdArg,
      hours: z.number().int().positive().max(168).optional().describe('Default 24, max 168 (7 days)')
    }
  }, async (args) => { try { return jsonResult(await client.webhookGetStats(args)); } catch (err) { return errorResult(err); } });

  server.registerResource(
    'motorical-llms',
    'motorical://docs/llms.txt',
    {
      description: 'Motorical llms.txt — transactional email API discovery index for agents',
      mimeType: 'text/plain'
    },
    async () => ({
      contents: [
        {
          uri: 'motorical://docs/llms.txt',
          mimeType: 'text/plain',
          text: await client.fetchDocs('/llms.txt')
        }
      ]
    })
  );

  server.registerResource(
    'motorical-openapi',
    'motorical://docs/openapi.json',
    {
      description: 'Motorical OpenAPI snapshot from docs.motorical.com',
      mimeType: 'application/json'
    },
    async () => ({
      contents: [
        {
          uri: 'motorical://docs/openapi.json',
          mimeType: 'application/json',
          text: await client.fetchDocs('/openapi.json')
        }
      ]
    })
  );

  server.registerPrompt(
    'motorical_integrate_send',
    {
      description: 'Guidance for integrating Motorical transactional email (HTTP Send) safely',
      argsSchema: {
        language: z.string().optional().describe('e.g. node, python, curl')
      }
    },
    async ({ language }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Help me integrate Motorical transactional email (HTTP Send API)${language ? ` in ${language}` : ''}.`,
              'Motorical is a transactional email API and SMTP provider; Motor Blocks are isolated sending streams.',
              'Rules: use mk_live_ ApiKey for POST /v1/send; start with dryRun:true;',
              'use ak_live_ only to mint bearer tokens for /api/public/v1;',
              'never put OAuth access tokens on /v1/send;',
              'SMTP is mail.motorical.com:2587/2465 (password / OAuth / mTLS).',
              'Canonical docs: https://docs.motorical.com/llms.txt'
            ].join(' ')
          }
        }
      ]
    })
  );

  return { server, client };
}

export { loadConfig, MotoricalClient };
