/**
 * "Manage implies read" at the MCP layer. Was resourceAuth.js's
 * IMPLIED_READ_MCP_SCOPES (packages/motorical-mcp/src/resourceAuth.js).
 * Kept separate from PUBLIC_IMPLIED_READ below because the two vocabularies
 * are genuinely different namespaces — see that map's own comment.
 */
const MCP_IMPLIED_READ = {
  'manage:webhooks': 'read:webhooks',
  'manage:domains': 'read:domains',
};

function expandMcpImplied(grantedScopes) {
  const expanded = new Set(grantedScopes);
  for (const manageScope of Object.keys(MCP_IMPLIED_READ)) {
    if (expanded.has(manageScope)) expanded.add(MCP_IMPLIED_READ[manageScope]);
  }
  return Array.from(expanded);
}

/**
 * "Manage implies read" at the Public API layer. Was authenticatePublic.js's
 * IMPLIED_READ_SCOPES (backend/src/middleware/authenticatePublic.js).
 *
 * This is NOT derivable from MCP_IMPLIED_READ above: this map also has to
 * cover callers that never touch an MCP scope at all (a legacy dashboard-JWT
 * Public API token, "authenticatePublicMcpAudience.test.js"'s "legacy HS256
 * tokens keep working unchanged" case) — so it has to exist as its own
 * independent fact about the Public API's own scope vocabulary, not as a
 * side effect of the MCP-scope map.
 */
const PUBLIC_IMPLIED_READ = {
  'webhooks.manage': 'webhooks.read',
  'config.manage': 'config.read',
};

function expandPublicImplied(grantedScopes) {
  const expanded = new Set(grantedScopes);
  for (const manageScope of Object.keys(PUBLIC_IMPLIED_READ)) {
    if (expanded.has(manageScope)) expanded.add(PUBLIC_IMPLIED_READ[manageScope]);
  }
  return Array.from(expanded);
}

module.exports = { MCP_IMPLIED_READ, expandMcpImplied, PUBLIC_IMPLIED_READ, expandPublicImplied };
