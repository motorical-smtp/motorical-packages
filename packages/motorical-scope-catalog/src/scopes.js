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
  'manage:motor-blocks': {
    resource: 'motor-blocks',
    level: 'manage',
    publicScopes: ['config.read', 'config.manage'],
    agentDescription: 'List and manage the ordinary lifecycle of production Motor Blocks: create, rename, change type, assign domain, deactivate, reactivate, and delete. Includes no credential values and cannot change the active auth method.',
    customerAction: 'Manage production Motor Blocks',
  },
  'manage:sandbox': {
    resource: 'sandbox',
    level: 'manage',
    publicScopes: ['sandbox.manage'],
    agentDescription: 'Check, provision, and convert the developer sandbox. Allowlisting by 6-digit code is dashboard-only and not available over OAuth; to allow recipients over OAuth use the manage:recipients scope.',
    customerAction: 'Manage your developer sandbox',
  },
  'manage:recipients': {
    resource: 'recipients',
    level: 'manage',
    publicScopes: ['recipients.manage'],
    agentDescription: 'Request permission to send test email to an address you name, and see which addresses have confirmed or stopped. The recipient confirms by clicking an emailed link; an agent can never confirm on their behalf.',
    customerAction: 'Ask recipients to allow your test emails, and see who has confirmed',
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
    agentDescription: 'List and read sending domains, their DNS records and email-authentication health, and read a Motor Block\'s configuration, without adding or verifying any domain.',
    customerAction: 'View your sending domains and Motor Block configuration',
  },
  // Communications (marketing). One area per scope so the consent screen shows sending on its own line. No Public API scopes:
  // the Comms API is not a Public API route, the Communications Block checks these itself. There is deliberately no scope for
  // permanent delete, recycle-bin cleanup or GDPR export/erase: those stay human-only.
  'read:comms': {
    resource: 'comms',
    level: 'read',
    publicScopes: [],
    agentDescription: 'Read Communications data for the workspaces the person chose: lists and contacts, templates, campaigns, reports and events, the workspace map and readiness, and run read-only checks (template preview, lint, link check, starter render). Never changes anything.',
    customerAction: 'View your lists, templates, campaigns and results',
  },
  'write:comms.audience': {
    resource: 'comms-audience',
    level: 'manage',
    publicScopes: [],
    agentDescription: 'Create and change lists and contacts, add contacts (with a dry run), derive lists from lists, import, and add or remove suppressions. Includes everything read:comms grants. Cannot delete anything permanently.',
    customerAction: 'Add and change your lists and contacts',
  },
  'write:comms.content': {
    resource: 'comms-content',
    level: 'manage',
    publicScopes: [],
    agentDescription: 'Create and change templates, the brand kit and campaign drafts, duplicate and compile campaigns, and send a test email to the account owner only. Includes everything read:comms grants. Does not send to your contacts.',
    customerAction: 'Create and edit email templates and campaign drafts, and send test emails to you',
  },
  'send:comms.campaign': {
    resource: 'comms-sending',
    level: 'manage',
    publicScopes: [],
    agentDescription: 'Schedule a campaign (which sends it to the audience) and cancel a scheduled or sending one. Cancelling is final. Includes everything read:comms grants.',
    customerAction: 'Send campaigns to your contacts (this is what actually emails people)',
  },
  'manage:comms.workspace': {
    resource: 'comms-workspace',
    level: 'manage',
    publicScopes: [],
    agentDescription: 'Change workspace settings (consent, open tracking, unsubscribe page) and which marketing Motor Blocks a workspace uses. Includes everything read:comms grants.',
    customerAction: 'Change workspace settings and which sending addresses a workspace uses',
  },
  'manage:comms.webhooks': {
    resource: 'comms-webhooks',
    level: 'manage',
    publicScopes: [],
    agentDescription: 'Create, update, delete and test campaign event webhooks of the workspaces the person chose. Includes everything read:comms grants.',
    customerAction: 'Manage your campaign event webhooks',
  },
};

function listGrantableScopes() {
  return Object.keys(SCOPES);
}

module.exports = { SCOPES, listGrantableScopes };
