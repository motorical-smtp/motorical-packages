const { test } = require('node:test');
const assert = require('node:assert/strict');
const { listGrantableScopes } = require('../src/scopes');
const {
  MCP_HOST, SERVER_TOOLS, TOOL_SCOPES, scopesForTools, RESOURCE_SCOPES,
} = require('../src/tools');

test('MCP_HOST is the one fixed audience host', () => {
  assert.equal(MCP_HOST, 'https://mcp.motorical.com');
});

test('every tool referenced by any SERVER_TOOLS list has a TOOL_SCOPES entry', () => {
  const allTools = new Set(Object.values(SERVER_TOOLS).flat());
  for (const t of allTools) {
    if (t === 'motorical_signup_handoff') continue; // signup: explicitly no scope
    assert.ok(TOOL_SCOPES[t], `${t} has no TOOL_SCOPES entry`);
  }
});

test('every TOOL_SCOPES value only ever names a real grantable scope', () => {
  const grantable = new Set(listGrantableScopes());
  for (const [tool, scopes] of Object.entries(TOOL_SCOPES)) {
    for (const s of scopes) assert.ok(grantable.has(s), `${tool} names unknown scope "${s}"`);
  }
});

test('scopesForTools unions TOOL_SCOPES over a tool list, deduplicated', () => {
  assert.deepEqual(
    scopesForTools(['motorical_webhook_list', 'motorical_webhook_create']).sort(),
    ['manage:webhooks', 'read:webhooks'],
  );
  assert.deepEqual(scopesForTools(['motorical_signup_handoff']), []); // no TOOL_SCOPES entry -> []
});

test('RESOURCE_SCOPES has exactly the eight authenticated servers (seven core plus communications), keyed by canonical URI, never signup', () => {
  assert.deepEqual(Object.keys(RESOURCE_SCOPES).sort(), [
    'https://mcp.motorical.com/v1/motorical/mcp',
    'https://mcp.motorical.com/v1/motorical_analytics/mcp',
    'https://mcp.motorical.com/v1/motorical_communications/mcp',
    'https://mcp.motorical.com/v1/motorical_domains/mcp',
    'https://mcp.motorical.com/v1/motorical_motor_blocks/mcp',
    'https://mcp.motorical.com/v1/motorical_sandbox/mcp',
    'https://mcp.motorical.com/v1/motorical_transactional/mcp',
    'https://mcp.motorical.com/v1/motorical_webhooks/mcp',
  ]);
});

test('the Motor Blocks server exposes exactly the nine bounded lifecycle tools (plus the any-grant motorical_whoami)', () => {
  assert.deepEqual(SERVER_TOOLS.motorBlocks, [
    'motorical_motor_block_list',
    'motorical_motor_block_create',
    'motorical_motor_block_rename',
    'motorical_motor_block_change_type',
    'motorical_motor_block_assign_domain',
    'motorical_motor_block_deactivate',
    'motorical_motor_block_reactivate',
    'motorical_motor_block_delete',
    'motorical_motor_block_delete_status',
    'motorical_whoami',
  ]);
  for (const tool of SERVER_TOOLS.motorBlocks.filter((t) => t !== 'motorical_whoami')) {
    assert.deepEqual(TOOL_SCOPES[tool], ['manage:motor-blocks']);
  }
});

test('the Motor Blocks resource allows exactly manage:motor-blocks', () => {
  assert.deepEqual(
    RESOURCE_SCOPES['https://mcp.motorical.com/v1/motorical_motor_blocks/mcp'],
    ['manage:motor-blocks'],
  );
});

test('the main/all-tools resource allows every grantable scope EXCEPT the Communications scopes, which only the communications server offers', () => {
  // A grant for the main server must never carry a marketing scope: sending to a customer's contacts has its own server and consent.
  const comms = new Set(require('../src/comms').COMMS_SCOPES);
  assert.deepEqual(
    RESOURCE_SCOPES['https://mcp.motorical.com/v1/motorical/mcp'].sort(),
    listGrantableScopes().filter((s) => !comms.has(s)).sort(),
  );
});

test('the transactional resource allows exactly send:transactional and read:analytics', () => {
  assert.deepEqual(
    RESOURCE_SCOPES['https://mcp.motorical.com/v1/motorical_transactional/mcp'].sort(),
    ['read:analytics', 'send:transactional'],
  );
});

test('the newly-registered webhooks resource allows exactly manage:webhooks and read:webhooks', () => {
  assert.deepEqual(
    RESOURCE_SCOPES['https://mcp.motorical.com/v1/motorical_webhooks/mcp'].sort(),
    ['manage:webhooks', 'read:webhooks'],
  );
});

// motorical_whoami tells a connection what it holds, so ANY OAuth grant may call it (2026-10-22). It carries no scope, and every
// hosted server except the unauthenticated signup one lists it, otherwise a grant that holds only, say, send:transactional could
// never ask. Found when it was listed under read:analytics while the route behind it needed config.read.
test('motorical_whoami needs no scope and is listed on every authenticated hosted server', () => {
  assert.deepEqual(TOOL_SCOPES.motorical_whoami, []);
  for (const [server, tools] of Object.entries(SERVER_TOOLS)) {
    if (server === 'signup') continue;
    assert.ok(tools.includes('motorical_whoami'), `${server} does not list motorical_whoami`);
  }
  assert.ok(!SERVER_TOOLS.signup.includes('motorical_whoami'));
});

test('a tool that needs no scope adds none to the servers that list it', () => {
  assert.deepEqual(scopesForTools(['motorical_whoami']), []);
  const withoutWhoami = SERVER_TOOLS.transactional.filter((t) => t !== 'motorical_whoami');
  assert.deepEqual(scopesForTools(SERVER_TOOLS.transactional), scopesForTools(withoutWhoami));
});

test('main still lists motorical_whoami exactly once, where analytics had it', () => {
  assert.equal(SERVER_TOOLS.main.filter((t) => t === 'motorical_whoami').length, 1);
});

// motorical_get_onboarding_state wraps GET /account/state, which needs the Public API scope config.read. read:analytics does not carry
// it, so the tool was listed on the analytics server and refused (403 missing_scope) for a read:analytics-only grant (proved live
// 2026-10-22). It reports domain verification, DNS readiness and Motor Block state, so it is a domains read: it needs read:domains
// (which carries config.read) and lives on the domains server, not the analytics one.
test('motorical_get_onboarding_state needs read:domains and is on the domains server, not analytics', () => {
  assert.deepEqual(TOOL_SCOPES.motorical_get_onboarding_state, ['read:domains']);
  assert.ok(SERVER_TOOLS.domains.includes('motorical_get_onboarding_state'));
  assert.ok(!SERVER_TOOLS.analytics.includes('motorical_get_onboarding_state'));
  assert.equal(SERVER_TOOLS.main.filter((t) => t === 'motorical_get_onboarding_state').length, 1);
});
