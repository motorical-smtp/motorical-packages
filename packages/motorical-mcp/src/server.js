import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MotoricalClient, loadConfig } from './client.js';

const PACKAGE_VERSION = '1.0.5';

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

  server.registerTool(
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

  server.registerTool(
    'motorical_mint_public_token',
    {
      description:
        'Mint a short-lived Public Analytics API bearer token using MOTORICAL_AK_API_KEY (ak_live_...). ' +
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

  server.registerTool(
    'motorical_list_motor_blocks',
    {
      description:
        'List Motor Blocks (isolated sending streams) visible to a Public API bearer token (auto-mints with ak_live_ if needed).',
      inputSchema: {
        motorBlockId: z.string().uuid().optional().describe('Block used when minting a token if none cached')
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

  server.registerTool(
    'motorical_send_email',
    {
      description:
        'Transactional email: send or validate via POST /v1/send using MOTORICAL_MK_API_KEY (mk_live_...). ' +
        'Defaults to dryRun:true. Real sends require dryRun:false AND confirmRealSend:true. ' +
        'Do not use OAuth access tokens or Bearer tokens here.',
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
        idempotencyKey: z.string().optional()
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

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
    'motorical_sandbox_status',
    {
      description:
        'Get developer sandbox status (domain, Motor Block, outbound lock, allowlist). Requires MOTORICAL_JWT.',
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

  server.registerTool(
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

  server.registerTool(
    'motorical_sandbox_convert',
    {
      description:
        'Convert sandbox Motor Block onto a verified customer domain. Requires active Motorical Plan + MOTORICAL_JWT.',
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

  server.registerTool(
    'motorical_domain_add',
    {
      description:
        'Add a customer domain (POST /api/domains). Returns verification DNS instructions. ' +
        'For cname_managed DKIM publish the CNAME in verification.records.dkim / dnsRecords (not a TXT p= key). Requires MOTORICAL_JWT.',
      inputSchema: {
        domain: z.string().min(3),
        verificationMethod: z.enum(['dns', 'email']).optional()
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

  server.registerTool(
    'motorical_domain_verify',
    {
      description:
        'Verify domain ownership and refresh DKIM/SPF/DMARC send-readiness flags (POST /api/domains/{id}/verify). ' +
        'Safe to re-call after ownership is done — returns sendReady. Requires MOTORICAL_JWT.',
      inputSchema: {
        domainId: z.string().uuid(),
        method: z.enum(['dns', 'email']).optional()
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

  server.registerTool(
    'motorical_domain_check_dns',
    {
      description:
        'Live-check DKIM/SPF/DMARC and persist dkim_configured/spf_configured (POST /api/domains/{id}/check-dns). ' +
        'Required before /v1/send when ownership is verified but send returns DOMAIN_DNS_INCOMPLETE. Requires MOTORICAL_JWT.',
      inputSchema: {
        domainId: z.string().uuid(),
        recordType: z.enum(['dkim', 'spf', 'dmarc', 'mx']).optional()
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

  server.registerTool(
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
