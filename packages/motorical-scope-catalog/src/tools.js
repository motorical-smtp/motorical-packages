/**
 * Declarative tool/resource membership — moved out of
 * packages/motorical-mcp/src/servers.js (P7 second review round: that
 * file's own comment already said "a server's advertised scopes are the
 * union of its tools' required scopes," so a second hand-maintained
 * resource->scopes map would have duplicated exactly that logic).
 *
 * TOOL_ROUTES, LOCAL_ONLY_TOOLS, HOSTED_ONLY_TOOLS, PROMPT_TOOLS,
 * LOCAL_SERVER_TOOL_COUNT, ACCOUNT_SCOPED_TOOLS, byPath, and
 * canonicalUriFor all stay in servers.js — those are @motorical/mcp's own
 * implementation wiring, not shared policy. Only the tool-name lists, the
 * scope map, and their derivation move here.
 */
const MCP_HOST = 'https://mcp.motorical.com';

const TRANSACTIONAL_TOOLS = [
  'motorical_send_email',
  'motorical_get_message',
  'motorical_get_message_events',
  'motorical_wait_for_outcome',
  'motorical_get_send_status',
  'motorical_integrate_send',
];

const ANALYTICS_TOOLS = [
  'motorical_list_motor_blocks',
  'motorical_get_overview',
  'motorical_get_daily_summary',
  'motorical_get_metrics',
  'motorical_get_deliverability',
  'motorical_get_reputation',
  'motorical_get_anomalies',
  'motorical_get_providers',
  'motorical_get_error_codes',
  'motorical_get_rate_limits',
  'motorical_get_account_rate_limits',
  'motorical_get_onboarding_state',
  'motorical_get_logs',
  'motorical_get_message_by_smtp_id',
];

const DOMAIN_TOOLS = [
  'motorical_domain_list',
  'motorical_domain_add',
  'motorical_domain_verify',
  'motorical_domain_check_dns',
  'motorical_get_config',
  'motorical_get_domain_health',
];

const SANDBOX_TOOLS = [
  'motorical_sandbox_status',
  'motorical_sandbox_provision',
  'motorical_sandbox_convert',
  'motorical_sandbox_allowlist_request',
  'motorical_sandbox_allowlist_confirm',
];

const WEBHOOK_TOOLS = [
  'motorical_webhook_list',
  'motorical_webhook_create',
  'motorical_webhook_update',
  'motorical_webhook_delete',
  'motorical_webhook_test',
  'motorical_webhook_get_deliveries',
  'motorical_webhook_get_stats',
];

const MOTOR_BLOCK_TOOLS = [
  'motorical_motor_block_list',
  'motorical_motor_block_create',
  'motorical_motor_block_rename',
  'motorical_motor_block_change_type',
  'motorical_motor_block_assign_domain',
  'motorical_motor_block_deactivate',
  'motorical_motor_block_reactivate',
  'motorical_motor_block_delete',
  'motorical_motor_block_delete_status',
];

const ALL_TOOLS = [
  ...new Set([
    ...TRANSACTIONAL_TOOLS,
    ...ANALYTICS_TOOLS,
    ...DOMAIN_TOOLS,
    ...SANDBOX_TOOLS,
    ...WEBHOOK_TOOLS,
    ...MOTOR_BLOCK_TOOLS,
  ]),
];

const SERVER_TOOLS = {
  main: ALL_TOOLS,
  transactional: TRANSACTIONAL_TOOLS,
  analytics: ANALYTICS_TOOLS,
  domains: DOMAIN_TOOLS,
  sandbox: SANDBOX_TOOLS,
  webhooks: WEBHOOK_TOOLS,
  motorBlocks: MOTOR_BLOCK_TOOLS,
  signup: ['motorical_signup_handoff'],
};

/** The one source of truth for "what scope does this tool need". */
const TOOL_SCOPES = {
  motorical_send_email: ['send:transactional'],
  motorical_integrate_send: ['send:transactional'],
  motorical_get_message: ['read:analytics'],
  motorical_get_message_events: ['read:analytics'],
  motorical_wait_for_outcome: ['read:analytics'],
  motorical_get_send_status: ['read:analytics'],
  motorical_list_motor_blocks: ['read:analytics'],
  motorical_get_overview: ['read:analytics'],
  motorical_get_daily_summary: ['read:analytics'],
  motorical_get_metrics: ['read:analytics'],
  motorical_get_deliverability: ['read:analytics'],
  motorical_get_reputation: ['read:analytics'],
  motorical_get_anomalies: ['read:analytics'],
  motorical_get_providers: ['read:analytics'],
  motorical_get_error_codes: ['read:analytics'],
  motorical_get_rate_limits: ['read:analytics'],
  motorical_get_account_rate_limits: ['read:analytics'],
  motorical_get_onboarding_state: ['read:analytics'],
  motorical_get_logs: ['read:analytics'],
  motorical_get_message_by_smtp_id: ['read:analytics'],
  motorical_get_config: ['manage:domains'],
  motorical_get_domain_health: ['manage:domains'],
  motorical_domain_list: ['read:domains'],
  motorical_domain_add: ['manage:domains'],
  motorical_domain_verify: ['manage:domains'],
  motorical_domain_check_dns: ['manage:domains'],
  motorical_sandbox_status: ['manage:sandbox'],
  motorical_sandbox_provision: ['manage:sandbox'],
  motorical_sandbox_convert: ['manage:sandbox'],
  motorical_sandbox_allowlist_request: ['manage:sandbox'],
  motorical_sandbox_allowlist_confirm: ['manage:sandbox'],
  motorical_webhook_list: ['read:webhooks'],
  motorical_webhook_create: ['manage:webhooks'],
  motorical_webhook_update: ['manage:webhooks'],
  motorical_webhook_delete: ['manage:webhooks'],
  motorical_webhook_test: ['manage:webhooks'],
  motorical_webhook_get_deliveries: ['read:webhooks'],
  motorical_webhook_get_stats: ['read:webhooks'],
  motorical_motor_block_list: ['manage:motor-blocks'],
  motorical_motor_block_create: ['manage:motor-blocks'],
  motorical_motor_block_rename: ['manage:motor-blocks'],
  motorical_motor_block_change_type: ['manage:motor-blocks'],
  motorical_motor_block_assign_domain: ['manage:motor-blocks'],
  motorical_motor_block_deactivate: ['manage:motor-blocks'],
  motorical_motor_block_reactivate: ['manage:motor-blocks'],
  motorical_motor_block_delete: ['manage:motor-blocks'],
  motorical_motor_block_delete_status: ['manage:motor-blocks'],
};

/** `|| []`: a tool with no entry (signup's own tool) contributes no scopes rather than throwing. */
function scopesForTools(tools) {
  return [...new Set(tools.flatMap((t) => TOOL_SCOPES[t] || []))];
}

const SERVER_SLUGS = {
  main: 'motorical',
  transactional: 'motorical_transactional',
  analytics: 'motorical_analytics',
  domains: 'motorical_domains',
  sandbox: 'motorical_sandbox',
  webhooks: 'motorical_webhooks',
  motorBlocks: 'motorical_motor_blocks',
  signup: 'signup',
};

/** Every authenticated server, keyed by its canonical URI. signup is excluded — public, no token, never grantable. */
const RESOURCE_SCOPES = Object.fromEntries(
  Object.keys(SERVER_TOOLS)
    .filter((key) => key !== 'signup')
    .map((key) => [`${MCP_HOST}/v1/${SERVER_SLUGS[key]}/mcp`, scopesForTools(SERVER_TOOLS[key])])
);

module.exports = {
  MCP_HOST, SERVER_TOOLS, TOOL_SCOPES, scopesForTools, RESOURCE_SCOPES,
};
