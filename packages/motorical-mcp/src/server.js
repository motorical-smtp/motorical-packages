import { readFileSync } from 'node:fs';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MotoricalClient, loadConfig } from './client.js';
import { TOOLS } from './registry.js';
import { HOSTED_ONLY_TOOLS } from './servers.js';
import { RESOURCES, RESOURCE_TEMPLATES } from './resources.js';
import { instructionsFor } from './instructions.js';

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

  // McpServer's signature is (serverInfo: Implementation, options?: ServerOptions).
  // `instructions` is read off the SECOND argument (Server reads
  // options?.instructions and emits it as a TOP-LEVEL InitializeResult field).
  // Passing it inside the first argument silently absorbs it into serverInfo --
  // _instructions stays undefined, result.instructions is never sent, and every
  // legacy client (which is every @motorical/mcp install in the field) reads
  // nothing. It also pollutes serverInfo, whose spec type is {name, title?,
  // version}, with a ~660-char blob on every handshake.
  const server = new McpServer(
    { name: 'motorical', version: PACKAGE_VERSION },
    { instructions: instructionsFor(options.serverKey) }
  );

  // The stdio/CLI entrypoint (index.js) calls this with no allowedTools and
  // gets every tool, unaffected. The HTTP resource server (http.js) passes
  // the connected server's own tool list: without this, tools/list would
  // advertise every tool on every path — e.g. motorical_send_email on the
  // analytics-only server — even though calling it there would be refused.
  // The advertisement must match what's actually callable.
  const allowedTools = options.allowedTools || null;

  // Every tool's name, description, inputSchema and handler come from the
  // registry (src/registry.js) -- there is deliberately no second place a
  // tool can be defined. The try/catch here is the ONE call site where a raw
  // handler result becomes an MCP tool result: 37 identical try/catch blocks
  // collapsed into this loop.
  for (const tool of TOOLS) {
    if (allowedTools && !allowedTools.includes(tool.name)) continue;
    // The unscoped case (no allowedTools -- the stdio/CLI entrypoint) would
    // otherwise register every registry tool including HOSTED_ONLY_TOOLS, but
    // those exist solely for the hosted signup server's unauthenticated
    // audience (servers.js) -- a local operator already has some credential
    // configured, which is the exact scenario this tool exists to bridge past.
    if (!allowedTools && HOSTED_ONLY_TOOLS.includes(tool.name)) continue;
    const run = tool.handler(client);
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {})
      },
      async (args) => {
        try {
          return jsonResult(await run(args));
        } catch (err) {
          return errorResult(err);
        }
      }
    );
  }

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

  // Resources/resource-templates are analytics-server-only (Global
  // Constraints), exactly the way the native dispatch path gates them via
  // `server.key === 'analytics'` (dispatch.js's resources/list,
  // resources/templates/list, resources/read). `options.serverKey` here is
  // the SAME value as that `server.key` -- both trace back to one SERVERS
  // catalogue entry's `.key` (servers.js), just plumbed through a narrower
  // parameter name by http.js's legacy call site. Only `undefined` (the
  // stdio/CLI entrypoint, index.js, which calls this with no options at all
  // and is deliberately unscoped -- see `allowedTools` above) is exempt from
  // the gate, matching that same entrypoint's "gets every tool, unaffected"
  // treatment for TOOLS. Every hosted server, 'main' included, must agree
  // with the native path or a legacy-protocol client on e.g. the `domains`
  // server could list and read `motorical://account/state` when the native
  // path on that exact server correctly refuses it -- proven live before this
  // fix.
  const resourcesEnabled = options.serverKey === undefined || options.serverKey === 'analytics';

  // Task 5's declarative resource/template table (src/resources.js) is the
  // one place these are defined -- the legacy path here and the native
  // dispatcher (dispatch.js) both read it, so neither can advertise or serve
  // something the other doesn't.
  if (resourcesEnabled) {
    for (const resource of RESOURCES) {
      server.registerResource(
        resource.name.toLowerCase().replace(/\s+/g, '-'),
        resource.uri,
        { description: resource.description, mimeType: resource.mimeType },
        async () => resource.handler(client)()
      );
    }

    for (const template of RESOURCE_TEMPLATES) {
      server.registerResource(
        template.name.toLowerCase().replace(/\s+/g, '-'),
        // `list: undefined` is required by the SDK's ResourceTemplate constructor
        // (present, even as undefined, "to avoid accidentally forgetting resource
        // listing") -- these templates are deliberately not enumerable via
        // resources/list, since resolving one requires a domain/block id the
        // client must already know.
        new ResourceTemplate(template.uriTemplate, { list: undefined }),
        { description: template.description, mimeType: template.mimeType },
        async (uri, variables) => template.handler(client)(variables)
      );
    }
  }

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

// Exported so any other module that needs the package version (http.js's
// native dispatch path, for `serverInfo.version` in server/discover) reads
// THIS value rather than re-parsing package.json a second time -- two reads
// of the same file are two chances for the reported version to drift.
export { loadConfig, MotoricalClient, PACKAGE_VERSION };
