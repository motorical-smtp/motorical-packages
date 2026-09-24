/**
 * A MotoricalClient that authenticates upstream with a per-call delegation
 * assertion instead of a user credential, and refuses tools this server does
 * not expose before any network call happens.
 */

import { MotoricalClient } from './client.js';
import { mintDelegation } from './delegation.js';
import { assertToolAllowed } from './resourceAuth.js';
import { ACCOUNT_SCOPED_TOOLS } from './servers.js';

export const TOOL_FOR_METHOD = {
  sendEmail: 'motorical_send_email',
  getMessage: 'motorical_get_message',
  getMessageEvents: 'motorical_get_message_events',
  // motorical_wait_for_outcome's handler isn't a one-line client-method
  // pass-through (it polls resolveTask, which calls this internally) --
  // but the delegation wrapping operates on the client OBJECT, not on
  // registry.js's handler shape, so this row is still what makes the
  // Delegation header (not a placeholder credential) reach the upstream
  // call resolveTask makes on the hosted OAuth path.
  getMessageRecipients: 'motorical_wait_for_outcome',
  getSendApiStatus: 'motorical_get_send_status',
  listMotorBlocks: 'motorical_list_motor_blocks',
  domainList: 'motorical_domain_list',
  domainAdd: 'motorical_domain_add',
  domainVerify: 'motorical_domain_verify',
  domainCheckDns: 'motorical_domain_check_dns',
  getOverview: 'motorical_get_overview',
  getDailySummary: 'motorical_get_daily_summary',
  getMetrics: 'motorical_get_metrics',
  getDeliverability: 'motorical_get_deliverability',
  getReputation: 'motorical_get_reputation',
  getAnomalies: 'motorical_get_anomalies',
  getProviders: 'motorical_get_providers',
  getErrorCodes: 'motorical_get_error_codes',
  getRateLimits: 'motorical_get_rate_limits',
  getAccountRateLimits: 'motorical_get_account_rate_limits',
  getAccountState: 'motorical_get_onboarding_state',
  getLogs: 'motorical_get_logs',
  getMessageBySmtpId: 'motorical_get_message_by_smtp_id',
  getConfig: 'motorical_get_config',
  getDomainHealth: 'motorical_get_domain_health',
  webhookList: 'motorical_webhook_list',
  webhookCreate: 'motorical_webhook_create',
  webhookUpdate: 'motorical_webhook_update',
  webhookDelete: 'motorical_webhook_delete',
  webhookTest: 'motorical_webhook_test',
  webhookGetDeliveries: 'motorical_webhook_get_deliveries',
  webhookGetStats: 'motorical_webhook_get_stats',
  sandboxStatus: 'motorical_sandbox_status',
  sandboxProvision: 'motorical_sandbox_provision',
  sandboxConvert: 'motorical_sandbox_convert',
  motorBlockList: 'motorical_motor_block_list',
  motorBlockCreate: 'motorical_motor_block_create',
  motorBlockRename: 'motorical_motor_block_rename',
  motorBlockChangeType: 'motorical_motor_block_change_type',
  motorBlockAssignDomain: 'motorical_motor_block_assign_domain',
  motorBlockDeactivate: 'motorical_motor_block_deactivate',
  motorBlockReactivate: 'motorical_motor_block_reactivate',
  motorBlockDelete: 'motorical_motor_block_delete',
  motorBlockDeleteStatus: 'motorical_motor_block_delete_status',
};

/**
 * server.js registers these tools too (sandbox allowlisting is a dashboard-
 * session-only flow with no Public API equivalent; mint_public_token/
 * web_handoff need env-provided credentials), but none of them has a sane
 * meaning under a delegated OAuth call — there is no dashboard session or
 * operator API key to hand them. Rather than let them run with the
 * placeholder credential (an upstream 401 with a confusing message), fail
 * closed: refuse before any network call.
 */
export const UNAVAILABLE_TOOL_FOR_METHOD = {
  sandboxAllowlistRequest: 'motorical_sandbox_allowlist_request',
  sandboxAllowlistConfirm: 'motorical_sandbox_allowlist_confirm',
  mintPublicToken: 'motorical_mint_public_token',
  webHandoff: 'motorical_web_handoff',
};

/**
 * Catalogue tools with no client method and no network call — they return
 * instructional text assembled in server.js. They need no delegation wrapping,
 * and the parity test allowlists them here rather than treating them as gaps.
 */
export const NO_CLIENT_METHOD_TOOLS = new Set([
  'motorical_integrate_send',
]);

// Never a real credential — it only has to be truthy so the pre-existing
// requireMk()/requireDashboardJwt()/getBearer() helpers on MotoricalClient
// don't refuse "no credentials configured". It is always stripped back out
// in requestFor() below before anything reaches the network, so it never
// travels upstream.
const PLACEHOLDER_CREDENTIAL = 'mcp-delegated';

/**
 * The public `signup` server's client: no claims, no delegation, because the
 * caller has no account yet. Its one tool (motorical_signup_handoff) makes
 * an unauthenticated backend call itself -- this is a plain, credential-less
 * MotoricalClient, safe because dispatch.js's own per-server tool-list check
 * (tools/call: `!server.tools.includes(name)`) means nothing but
 * motorical_signup_handoff can ever be invoked against this server, and that
 * method never reads any of the empty credential fields below.
 */
export function createUnauthenticatedClient({ apiBaseUrl }) {
  return new MotoricalClient({
    apiBaseUrl,
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '', akApiKey: '', bearerToken: '', dashboardJwt: '',
    motorBlockId: '', defaultFrom: '', oauthCredentials: null,
  });
}

export function createDelegatedClient({ claims, server, signer, apiBaseUrl }) {
  const blocks = claims.motorBlockIds || [];

  const client = new MotoricalClient({
    apiBaseUrl,
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '', akApiKey: '', bearerToken: '', dashboardJwt: '',
    motorBlockId: blocks.length === 1 ? blocks[0] : '',
    defaultFrom: '',
    oauthCredentials: null,
  });

  // The access token's block array is a frozen mint-time convenience only.
  // Keep it for the one-block default and task indexing; never use it as
  // current authority for an explicitly named block. The backend's live,
  // non-revoked grant row plus ownership check is authoritative.
  client.motorBlockIds = blocks;

  function resolveBlock(explicit) {
    const id = explicit || (blocks.length === 1 ? blocks[0] : null);
    if (!id) {
      throw new Error(
        'motorBlockId is required: this authorization covers multiple Motor Blocks'
      );
    }
    return String(id);
  }

  /**
   * The account-scoped counterpart to resolveBlock: a block is optional here,
   * but if one IS named it must still be covered by this authorization — the
   * relaxation is about what is REQUIRED, never about what is allowed.
   */
  function optionalBlock(explicit) {
    if (!explicit) return undefined;
    return String(explicit);
  }

  /**
   * The block selector isn't always args[0]: sendEmail/listMotorBlocks take
   * it as a property of their single options object, but getMessage/
   * getMessageEvents take a positional messageId first and the options
   * object (with motorBlockId) second. Scan every argument for the first
   * plain object carrying motorBlockId instead of assuming a position, so
   * this stays correct for whichever argument actually carries it — including
   * a future method with a different shape.
   */
  function explicitBlockFrom(args) {
    for (const a of args) {
      if (a && typeof a === 'object' && !Array.isArray(a) && a.motorBlockId) return a.motorBlockId;
    }
    return null;
  }

  function authFor(motorBlockId) {
    return {
      Authorization: `Delegation ${mintDelegation({
        grantId: claims.grantId,
        userId: claims.userId,
        motorBlockId,
        scopes: claims.scopes,
        canonicalUri: server.canonicalUri,
      }, signer)}`,
    };
  }

  /**
   * Builds a one-call view of the client: same prototype (so the method's
   * own validation and shaping logic runs unmodified), but with its own
   * `config`/cached-credential fields so the credential-resolution helpers
   * see a harmless placeholder instead of throwing "no credentials", and its
   * own `request` that strips whatever apiKey/bearer the method resolved and
   * forces the Delegation header on regardless.
   *
   * This — not a shared field toggled on `client` itself — is what "auth
   * travels on the call" means here: every field above is a fresh object
   * built for this one call, so two concurrent tool calls sharing the same
   * `client` can never observe or stomp each other's auth, whatever order
   * their internal awaits resolve in.
   */
  function callView(authHeaders, motorBlockId) {
    const view = Object.create(client);
    view.config = {
      ...client.config,
      mkApiKey: PLACEHOLDER_CREDENTIAL,
      dashboardJwt: PLACEHOLDER_CREDENTIAL,
      motorBlockId,
    };
    view._cachedBearer = PLACEHOLDER_CREDENTIAL;
    // Marks this as a delegated call so client.js's legacy /api/domains
    // fallback stays out of the way — see hasNoBlockToScopeAPublicToken.
    view._delegated = true;
    view.request = (method, path, opts = {}) => client.withAuth(authHeaders, () => (
      client.request.call(client, method, path, {
        ...opts,
        apiKey: undefined,
        bearer: undefined,
        headers: { ...(opts.headers || {}), ...authHeaders },
      })
    ));
    return view;
  }

  // Private infrastructure method, deliberately absent from TOOL_FOR_METHOD:
  // native tasks/list and Motor Block resource reads need a live authorization
  // decision before touching local state, but exposing this as an MCP tool
  // would turn an internal coverage check into a probing surface.
  client.authorizeMotorBlock = async (motorBlockId) => {
    if (!motorBlockId) throw new Error('motorBlockId is required');
    const id = String(motorBlockId);
    const view = callView(authFor(id), id);
    return await view.request(
      'GET',
      `/api/public/v1/account/authorization/motor-blocks/${encodeURIComponent(id)}`
    );
  };

  // Wrap each method: gate on the server's tool list, resolve the single
  // block being acted on, then run the original method against a call view
  // carrying that call's own delegation — never against `client` directly.
  for (const [method, tool] of Object.entries(TOOL_FOR_METHOD)) {
    const original = client[method];
    if (typeof original !== 'function') continue;
    const accountScoped = ACCOUNT_SCOPED_TOOLS.has(tool);
    client[method] = async (...args) => {
      assertToolAllowed(server, tool, claims.scopes);
      const explicit = explicitBlockFrom(args);
      const blockId = accountScoped ? optionalBlock(explicit) : resolveBlock(explicit);
      const view = callView(authFor(blockId), blockId);
      return await original.apply(view, args);
    };
  }

  // Fail closed on every tool this server does NOT delegate — never fall
  // through to the original (credential-less) method.
  for (const [method, tool] of Object.entries(UNAVAILABLE_TOOL_FOR_METHOD)) {
    client[method] = async () => {
      throw new Error(`${tool} is not available over an OAuth authorization`);
    };
  }

  return client;
}
