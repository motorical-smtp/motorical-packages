#!/usr/bin/env node
/**
 * Motorical MCP server — stdio transport for Cursor / Claude Desktop / etc.
 * Credentials via env (see README). Log only to stderr.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMotoricalMcpServer } from './server.js';

async function main() {
  const { server } = createMotoricalMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[motorical-mcp] ready on stdio');
}

main().catch((err) => {
  console.error('[motorical-mcp] fatal:', err);
  process.exit(1);
});
