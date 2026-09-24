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

test('RESOURCE_SCOPES has exactly the seven authenticated servers, keyed by canonical URI, never signup', () => {
  assert.deepEqual(Object.keys(RESOURCE_SCOPES).sort(), [
    'https://mcp.motorical.com/v1/motorical/mcp',
    'https://mcp.motorical.com/v1/motorical_analytics/mcp',
    'https://mcp.motorical.com/v1/motorical_domains/mcp',
    'https://mcp.motorical.com/v1/motorical_motor_blocks/mcp',
    'https://mcp.motorical.com/v1/motorical_sandbox/mcp',
    'https://mcp.motorical.com/v1/motorical_transactional/mcp',
    'https://mcp.motorical.com/v1/motorical_webhooks/mcp',
  ]);
});

test('the Motor Blocks server exposes exactly the nine bounded lifecycle tools', () => {
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
  ]);
  for (const tool of SERVER_TOOLS.motorBlocks) {
    assert.deepEqual(TOOL_SCOPES[tool], ['manage:motor-blocks']);
  }
});

test('the Motor Blocks resource allows exactly manage:motor-blocks', () => {
  assert.deepEqual(
    RESOURCE_SCOPES['https://mcp.motorical.com/v1/motorical_motor_blocks/mcp'],
    ['manage:motor-blocks'],
  );
});

test('the main/all-tools resource allows every grantable scope', () => {
  assert.deepEqual(
    RESOURCE_SCOPES['https://mcp.motorical.com/v1/motorical/mcp'].sort(),
    listGrantableScopes().sort(),
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
