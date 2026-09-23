/**
 * The server catalogue.
 *
 * Each entry is a distinct canonical URI, therefore a distinct RFC 8707
 * audience. That is what makes connecting a narrow server actually reduce
 * authority instead of merely shortening the tool list: a token minted for
 * /v1/motorical_contacts/mcp fails the audience check on every other server.
 *
 * This file is data on purpose. Adding a server is a row here plus its tools —
 * no change to transport, auth or metadata code.
 */

import {
  MCP_HOST, SERVER_TOOLS, TOOL_SCOPES, scopesForTools,
} from '@motorical/scope-catalog';

export { MCP_HOST, TOOL_SCOPES };

const TRANSACTIONAL_TOOLS = SERVER_TOOLS.transactional;
const ANALYTICS_TOOLS = SERVER_TOOLS.analytics;
const DOMAIN_TOOLS = SERVER_TOOLS.domains;
const SANDBOX_TOOLS = SERVER_TOOLS.sandbox;
const WEBHOOK_TOOLS = SERVER_TOOLS.webhooks;

export const ALL_TOOLS = SERVER_TOOLS.main;

/**
 * server.js registers these, but they are NOT in the published catalogue:
 * both need env-provided credentials (an operator API key, a dashboard JWT)
 * that no OAuth grant can supply, so they are local-server-only.
 */
export const LOCAL_ONLY_TOOLS = ['motorical_mint_public_token', 'motorical_web_handoff'];

const SIGNUP_TOOLS = ['motorical_signup_handoff'];

/**
 * The mirror image of LOCAL_ONLY_TOOLS: this tool exists ONLY on the hosted
 * server's dedicated, unauthenticated `signup` audience. It needs no
 * env-provided credential (the opposite problem LOCAL_ONLY_TOOLS solves), and
 * running it locally makes no sense -- a local server operator already has
 * SOME credential configured, which is the whole scenario this tool exists
 * to bridge past. Excluded from ALL_TOOLS for the same reason
 * LOCAL_ONLY_TOOLS is: it needs no TOOL_SCOPES/TOOL_ROUTES entry, and the
 * guards below only walk ALL_TOOLS / Object.keys(TOOL_SCOPES).
 */
export const HOSTED_ONLY_TOOLS = SIGNUP_TOOLS;

/**
 * In the catalogue, but registered as an MCP *prompt* rather than a tool — so
 * it counts toward the catalogue and against the local server's tool count.
 */
export const PROMPT_TOOLS = ['motorical_integrate_send'];

/**
 * How many tools the local (npm) server registers.
 *
 * The docs state this number in prose, and it went stale — the pages claimed
 * 30 while the server really registered 37, because the only thing keeping
 * them in step was somebody remembering to retype it. The docs gate now
 * checks the pages against this value, and server.test.js checks this value
 * against a live `tools/list`, so adding a tool moves the number on its own
 * or fails a test. Derived, never typed.
 */
export const LOCAL_SERVER_TOOL_COUNT =
  ALL_TOOLS.length - PROMPT_TOOLS.length + LOCAL_ONLY_TOOLS.length;

/** A tool with no TOOL_SCOPES entry must never silently require nothing. */
for (const t of ALL_TOOLS) {
  if (!TOOL_SCOPES[t]) {
    throw new Error(`servers.js: tool "${t}" has no TOOL_SCOPES entry`);
  }
}

/**
 * Tools that act on the ACCOUNT, not on one Motor Block.
 *
 * Domains are account-wide — `domains.user_id`, with no motor_block_id column
 * — and a Motor Block is created FROM a verified domain
 * (motor_blocks.domain_id -> domains), not the other way around. Demanding a
 * block for these inverted that order and locked a fresh account out of the
 * setup it must do first. Listing Motor Blocks is account-wide for the same
 * reason: you cannot name one before you know what you have.
 *
 * Everything absent from this set stays strictly block-scoped.
 */
export const ACCOUNT_SCOPED_TOOLS = new Set([
  'motorical_domain_list',
  'motorical_domain_add',
  'motorical_domain_verify',
  'motorical_domain_check_dns',
  'motorical_list_motor_blocks',
  'motorical_get_account_rate_limits',
  'motorical_get_onboarding_state',
  'motorical_sandbox_status',
  'motorical_sandbox_provision',
  'motorical_sandbox_convert',
]);

/** An account-scoped entry naming no real tool is a typo, not a feature. */
for (const t of ACCOUNT_SCOPED_TOOLS) {
  if (!TOOL_SCOPES[t]) {
    throw new Error(`servers.js: account-scoped tool "${t}" is not a known tool`);
  }
}

/**
 * Which Public API route each tool wraps. This is the keystone of docs
 * symmetry: the docs gate cross-checks it against api-contract.json, so a tool
 * cannot ship wrapping an endpoint nobody documented.
 *
 * `null` means "deliberately no Public API route" — a prompt, or a
 * dashboard-session-only operation the hosted OAuth server refuses anyway
 * (see UNAVAILABLE_TOOL_FOR_METHOD in delegatedClient.js). Null is explicit on
 * purpose: an omission is indistinguishable from an oversight, which is
 * exactly how a tool gets shipped undocumented.
 */
export const TOOL_ROUTES = {
  motorical_send_email: { method: 'POST', path: '/v1/send' },
  motorical_get_send_status: { method: 'GET', path: '/v1/status' },
  motorical_get_message: { method: 'GET', path: '/api/public/v1/messages/{id}' },
  motorical_get_message_events: { method: 'GET', path: '/api/public/v1/messages/{id}/events' },
  // Not a 1:1 REST endpoint of its own; documents the underlying data source it polls.
  motorical_wait_for_outcome: { method: 'GET', path: '/api/public/v1/messages/{id}/recipients' },
  motorical_get_message_by_smtp_id: { method: 'GET', path: '/api/public/v1/messages' },
  motorical_list_motor_blocks: { method: 'GET', path: '/api/public/v1/motor-blocks' },
  motorical_domain_list: { method: 'GET', path: '/api/public/v1/domains' },
  motorical_domain_add: { method: 'POST', path: '/api/public/v1/domains' },
  motorical_domain_verify: { method: 'POST', path: '/api/public/v1/domains/{id}/verify' },
  motorical_domain_check_dns: { method: 'POST', path: '/api/public/v1/domains/{id}/check-dns' },
  motorical_get_overview: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/overview' },
  motorical_get_daily_summary: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/daily-summary' },
  motorical_get_metrics: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/metrics' },
  motorical_get_deliverability: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/deliverability' },
  motorical_get_reputation: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/reputation' },
  motorical_get_anomalies: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/anomalies' },
  motorical_get_providers: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/providers' },
  motorical_get_error_codes: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/error-codes' },
  motorical_get_config: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/config' },
  motorical_get_domain_health: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/domain-health' },
  motorical_get_rate_limits: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/rate-limits' },
  motorical_get_account_rate_limits: { method: 'GET', path: '/api/public/v1/account/rate-limits' },
  motorical_get_onboarding_state: { method: 'GET', path: '/api/public/v1/account/state' },
  motorical_get_logs: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/logs' },

  // Dashboard-session-only (MOTORICAL_JWT); refused over an OAuth grant.
  motorical_webhook_list: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/webhooks' },
  motorical_webhook_create: { method: 'POST', path: '/api/public/v1/motor-blocks/{id}/webhooks' },
  motorical_webhook_update: { method: 'PUT', path: '/api/public/v1/motor-blocks/{id}/webhooks/{webhookId}' },
  motorical_webhook_delete: { method: 'DELETE', path: '/api/public/v1/motor-blocks/{id}/webhooks/{webhookId}' },
  motorical_webhook_test: { method: 'POST', path: '/api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/test' },
  motorical_webhook_get_deliveries: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/deliveries' },
  motorical_webhook_get_stats: { method: 'GET', path: '/api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/stats' },

  // Account-scoped public API routes -- reachable over both a dashboard JWT
  // (via client.js's `this._delegated` branch on each sandbox method) and an
  // OAuth Delegation header.
  motorical_sandbox_status: { method: 'GET', path: '/api/public/v1/account/sandbox' },
  motorical_sandbox_provision: { method: 'POST', path: '/api/public/v1/account/sandbox/provision' },
  motorical_sandbox_convert: { method: 'POST', path: '/api/public/v1/account/sandbox/convert' },
  motorical_sandbox_allowlist_request: null,
  motorical_sandbox_allowlist_confirm: null,

  // A prompt, not a tool — returns instructional text, calls nothing.
  motorical_integrate_send: null,
};

/** A tool with no TOOL_ROUTES entry cannot be validated against the docs. */
for (const t of Object.keys(TOOL_SCOPES)) {
  if (!(t in TOOL_ROUTES)) {
    throw new Error(`servers.js: tool "${t}" has no TOOL_ROUTES entry`);
  }
}

function server(key, slug, tools) {
  const path = `/v1/${slug}/mcp`;
  return { key, slug, path, canonicalUri: `${MCP_HOST}${path}`, scopes: scopesForTools(tools), tools };
}

export const SERVERS = [
  server('main', 'motorical', ALL_TOOLS),
  server('transactional', 'motorical_transactional', TRANSACTIONAL_TOOLS),
  server('analytics', 'motorical_analytics', ANALYTICS_TOOLS),
  server('domains', 'motorical_domains', DOMAIN_TOOLS),
  server('sandbox', 'motorical_sandbox', SANDBOX_TOOLS),
  server('webhooks', 'motorical_webhooks', WEBHOOK_TOOLS),
  // The one deliberate exception: `public: true` is read by authenticateMcp
  // (http.js) and clientFactory (serve.js) to skip bearer verification
  // entirely for this ONE server -- a caller with no Motorical account yet
  // has no token to present. Scoped narrowly: only this server's path
  // (byPath resolves the exact route before the bypass is even consulted),
  // only this one tool, no scopes (see scopesForTools' `|| []` above), and no
  // access to any other server's canonical URI or credentials.
  { ...server('signup', 'signup', SIGNUP_TOOLS), public: true },
];

/** Exact match only — a trailing slash is a different URI and must not resolve. */
export function byPath(path) {
  return SERVERS.find((s) => s.path === path) || null;
}

export function canonicalUriFor(key) {
  const s = SERVERS.find((x) => x.key === key);
  if (!s) throw new Error(`Unknown MCP server: ${key}`);
  return s.canonicalUri;
}
