// The hosted `communications` server in the catalogue (Comms MCP M2c). Its scopes are, as for every server, exactly the union of its
// tools' scopes: write/send/manage scopes are offered only when tools that need them exist (M3).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SERVER_TOOLS, TOOL_SCOPES, RESOURCE_SCOPES, COMMS_CANONICAL_URI, COMMS_SCOPES, RESOURCE_SERVER_DEFAULTS, listGrantableScopes,
} = require('../src');

test('the communications server has the two proof tools, and whoami like every authenticated server', () => {
  assert.deepEqual(SERVER_TOOLS.communications, ['comms_get_readiness', 'comms_get_map', 'motorical_whoami']);
});

test('both tools need read:comms and nothing else', () => {
  assert.deepEqual(TOOL_SCOPES.comms_get_readiness, ['read:comms']);
  assert.deepEqual(TOOL_SCOPES.comms_get_map, ['read:comms']);
});

test('its canonical URI is the one the delegation and the grants use, and it offers only what its tools need', () => {
  assert.deepEqual(RESOURCE_SCOPES[COMMS_CANONICAL_URI], ['read:comms']);
  assert.equal(COMMS_CANONICAL_URI, 'https://mcp.motorical.com/v1/motorical_communications/mcp');
});

test('the main server and every other server carry no Communications tool or scope', () => {
  const commsTools = new Set(['comms_get_readiness', 'comms_get_map']); // whoami is deliberately shared
  for (const [key, tools] of Object.entries(SERVER_TOOLS)) {
    if (key === 'communications') continue;
    for (const t of tools) assert.ok(!commsTools.has(t), `${key} lists ${t}`);
  }
  for (const [uri, scopes] of Object.entries(RESOURCE_SCOPES)) {
    if (uri === COMMS_CANONICAL_URI) continue;
    for (const s of scopes) assert.ok(!COMMS_SCOPES.includes(s), `${uri} offers ${s}`);
  }
});

test('the other five Communications scopes stay grantable in name but are offered by no server yet', () => {
  for (const s of COMMS_SCOPES.slice(1)) {
    assert.ok(listGrantableScopes().includes(s));
    assert.ok(!RESOURCE_SCOPES[COMMS_CANONICAL_URI].includes(s));
  }
});

test('a new communications resource row is created marketing-only and DISABLED: it must be switched on deliberately', () => {
  assert.deepEqual(RESOURCE_SERVER_DEFAULTS[COMMS_CANONICAL_URI], { blockTypes: ['marketing'], enabled: false });
});
