// packages/motorical-scope-catalog/src/scopes.js

/**
 * The one source of truth for what an MCP scope IS: which resource area it
 * belongs to, whether it's read or manage, which Public API scopes it
 * unlocks (backend/src/services/oauth/mcpTokens.js used to hand-declare
 * this as MCP_TO_PUBLIC_SCOPES), and the two audiences that need to
 * understand it in different words — an agent deciding what to request,
 * and a customer deciding what to approve.
 *
 * publicScopes values below are copied verbatim from the MCP_TO_PUBLIC_SCOPES
 * this package replaces. logs.pii is deliberately absent everywhere here —
 * it is never reachable from any MCP scope, by design (P6).
 */
// Insertion order matters: Object.keys(SCOPES) drives listGrantableScopes(),
// which backend/src/routes/oauth.js's MCP_SCOPES_SUPPORTED derives from
// (Task 9). oauthDiscoveryMetadata.test.js asserts scopes_supported as an
// EXACT ordered array — this order matches that existing test byte-for-byte
// so that test needs no change. Do not reorder without checking it first.
const SCOPES = {
  'send:transactional': {
    resource: 'transactional',
    level: 'manage',
    publicScopes: [],
    agentDescription: 'Send transactional email through the caller\'s Motor Block(s).',
    customerAction: 'Send transactional email through your Motor Blocks',
  },
  'read:analytics': {
    resource: 'analytics',
    level: 'read',
    publicScopes: ['logs.read', 'analytics.read', 'usage.read'],
    agentDescription: 'Read delivery logs, analytics, and usage for the caller\'s Motor Block(s). Never includes unmasked recipient PII (logs.pii) regardless of what is requested.',
    customerAction: 'Read delivery logs, analytics and usage',
  },
  'manage:domains': {
    resource: 'domains',
    level: 'manage',
    publicScopes: ['config.read', 'config.manage'],
    agentDescription: 'Add, verify, and read sending domains and their DNS health. Includes everything read:domains grants.',
    customerAction: 'Add and verify sending domains',
  },
  'manage:sandbox': {
    resource: 'sandbox',
    level: 'manage',
    publicScopes: ['sandbox.manage'],
    agentDescription: 'Check, provision, and convert the developer sandbox. Sandbox allowlist requests/confirmations additionally require a dashboard session — this scope alone does not make them callable over OAuth.',
    customerAction: 'Manage your developer sandbox',
  },
  'manage:webhooks': {
    resource: 'webhooks',
    level: 'manage',
    publicScopes: ['webhooks.manage'],
    agentDescription: 'Create, update, delete, and test webhook endpoints on the caller\'s Motor Block(s). Includes everything read:webhooks grants.',
    customerAction: 'Manage your webhook endpoints',
  },
  'read:webhooks': {
    resource: 'webhooks',
    level: 'read',
    publicScopes: ['webhooks.read'],
    agentDescription: 'List webhook endpoints and read their delivery history and stats, without creating, updating, deleting, or testing any.',
    customerAction: 'View your webhook endpoints and delivery history',
  },
  'read:domains': {
    resource: 'domains',
    level: 'read',
    publicScopes: ['config.read'],
    agentDescription: 'List and read sending domains, without adding or verifying any.',
    customerAction: 'View your sending domains',
  },
};

function listGrantableScopes() {
  return Object.keys(SCOPES);
}

module.exports = { SCOPES, listGrantableScopes };
