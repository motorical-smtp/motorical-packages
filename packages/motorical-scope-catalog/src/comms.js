/**
 * Communications (marketing) MCP constants. Spec: motorical-docs specs/2026-10-27-comms-mcp-m2-auth-delegation-scopes-design.md.
 *
 * Shared by the backend (grant resolver, OAuth consent), the Communications Block (delegation verification, route to scope table)
 * and @motorical/mcp (the `communications` server), so the audience and the scope names cannot drift between them.
 */
const { MCP_HOST } = require('./tools');

/** Fixed order; also the order the scopes appear in SCOPES (after the nine core scopes, so existing order is untouched). */
const COMMS_SCOPES = [
  'read:comms',
  'write:comms.audience',
  'write:comms.content',
  'send:comms.campaign',
  'manage:comms.workspace',
  'manage:comms.webhooks',
];

/** What the FIRST consent asks for. Sending and managing are a step-up, so sending always has its own consent moment. */
const COMMS_INITIAL_SCOPES = ['read:comms', 'write:comms.audience', 'write:comms.content'];

/** The hosted server's canonical URI = its RFC 8707 audience = the `resource` stored on its grants. */
const COMMS_CANONICAL_URI = `${MCP_HOST}/v1/motorical_communications/mcp`;

/** Audience of the delegation assertion minted for this server. Distinct from the backend's `.../internal/mcp`, so neither can be replayed at the other. */
const COMMS_DELEGATION_AUDIENCE = 'https://api.motorical.com/internal/mcp/comms';

/**
 * How a NEW oauth_resource_servers row is created for a resource that needs more than the transactional defaults. The sync inserts
 * these and never changes `enabled` or `block_types` of an existing row. The communications server is marketing-only and starts
 * DISABLED: nobody can consent to it until it is switched on deliberately (Comms MCP M2d).
 */
const RESOURCE_SERVER_DEFAULTS = {
  [COMMS_CANONICAL_URI]: { blockTypes: ['marketing'], enabled: false },
};

module.exports = { COMMS_SCOPES, COMMS_INITIAL_SCOPES, COMMS_CANONICAL_URI, COMMS_DELEGATION_AUDIENCE, RESOURCE_SERVER_DEFAULTS };
