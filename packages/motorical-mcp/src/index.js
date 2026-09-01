#!/usr/bin/env node
/**
 * Motorical MCP server — stdio transport for Cursor / Claude Desktop / etc.
 * Auth: `motorical-mcp login` (OAuth 2.1), or env credentials (see README).
 * Log only to stderr — stdout is the MCP stream.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMotoricalMcpServer } from './server.js';

const USAGE = `motorical-mcp — Motorical MCP server

  motorical-mcp             start the MCP server on stdio (default)
  motorical-mcp login       authorize with Motorical in your browser
  motorical-mcp logout      remove locally stored credentials
  motorical-mcp status      show the current connection
`;

async function main() {
  const cmd = process.argv[2];

  if (cmd === 'login' || cmd === 'logout' || cmd === 'status') {
    const mod = await import('./login.js');
    if (cmd === 'login') await mod.login();
    if (cmd === 'logout') mod.logout();
    if (cmd === 'status') mod.status();
    return;
  }

  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.error(USAGE);
    return;
  }

  const { server } = createMotoricalMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[motorical-mcp] ready on stdio');
}

main().catch((err) => {
  console.error('[motorical-mcp] fatal:', err.message || err);
  process.exit(1);
});
