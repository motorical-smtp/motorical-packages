#!/usr/bin/env node
/**
 * Emits the published MCP catalogue from servers.js.
 *
 * This artifact is DERIVED — never hand-edit docs-site/static/mcp-catalogue.json.
 * It exists so the tool catalogue is discoverable without connecting to the
 * server, and so the docs gate has something to check symmetry against: every
 * tool's route is cross-checked against api-contract.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVERS, TOOL_SCOPES, TOOL_ROUTES, ACCOUNT_SCOPED_TOOLS } from '../src/servers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../../docs-site/static/mcp-catalogue.json');

export function buildCatalogue() {
  return {
    description:
      'Motorical MCP tool catalogue. Generated from packages/motorical-mcp/src/servers.js — do not hand-edit.',
    servers: SERVERS.map((s) => ({
      key: s.key,
      canonicalUri: s.canonicalUri,
      scopes: s.scopes,
      tools: s.tools,
    })),
    tools: Object.keys(TOOL_SCOPES).sort().map((name) => ({
      name,
      scopes: TOOL_SCOPES[name],
      accountScoped: ACCOUNT_SCOPED_TOOLS.has(name),
      route: TOOL_ROUTES[name],
    })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(out, `${JSON.stringify(buildCatalogue(), null, 2)}\n`);
  console.log(`wrote ${out}`);
}
