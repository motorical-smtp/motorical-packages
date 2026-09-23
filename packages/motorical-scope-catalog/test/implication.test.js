const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  MCP_IMPLIED_READ, expandMcpImplied, PUBLIC_IMPLIED_READ, expandPublicImplied,
} = require('../src/implication');

test('MCP vocabulary: manage implies read, for domains and webhooks only', () => {
  assert.deepEqual(MCP_IMPLIED_READ, {
    'manage:webhooks': 'read:webhooks',
    'manage:domains': 'read:domains',
  });
});

test('expandMcpImplied adds the implied read scope without duplicating', () => {
  assert.deepEqual(expandMcpImplied(['manage:webhooks']).sort(), ['manage:webhooks', 'read:webhooks']);
  assert.deepEqual(expandMcpImplied(['manage:webhooks', 'read:webhooks']).sort(), ['manage:webhooks', 'read:webhooks']);
  assert.deepEqual(expandMcpImplied(['send:transactional']), ['send:transactional']);
});

test('Public API vocabulary: manage implies read, for webhooks and config only', () => {
  assert.deepEqual(PUBLIC_IMPLIED_READ, {
    'webhooks.manage': 'webhooks.read',
    'config.manage': 'config.read',
  });
});

test('expandPublicImplied mirrors expandMcpImplied for the Public API vocabulary', () => {
  assert.deepEqual(expandPublicImplied(['webhooks.manage', 'config.manage']).sort(), [
    'config.manage', 'config.read', 'webhooks.manage', 'webhooks.read',
  ]);
});

test('the two vocabularies are genuinely independent data, not derived from each other', () => {
  assert.notEqual(Object.keys(MCP_IMPLIED_READ).length, 0);
  assert.notEqual(Object.keys(PUBLIC_IMPLIED_READ).length, 0);
  // Public API keys use dotted Public API scope names; MCP keys use colon MCP scope names.
  for (const k of Object.keys(PUBLIC_IMPLIED_READ)) assert.match(k, /\./);
  for (const k of Object.keys(MCP_IMPLIED_READ)) assert.match(k, /:/);
});
