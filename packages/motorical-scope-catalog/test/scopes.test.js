// packages/motorical-scope-catalog/test/scopes.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SCOPES, listGrantableScopes } = require('../src/scopes');

test('there are exactly the eight scopes the product currently grants', () => {
  assert.deepEqual(Object.keys(SCOPES).sort(), [
    'manage:domains', 'manage:motor-blocks', 'manage:sandbox', 'manage:webhooks',
    'read:analytics', 'read:domains', 'read:webhooks', 'send:transactional',
  ]);
});

test('every scope has all five required fields', () => {
  for (const [id, s] of Object.entries(SCOPES)) {
    assert.ok(s.resource, `${id} needs a resource`);
    assert.ok(s.level === 'read' || s.level === 'manage', `${id}.level must be read or manage`);
    assert.ok(Array.isArray(s.publicScopes), `${id}.publicScopes must be an array`);
    assert.ok(s.agentDescription.length > 0, `${id} needs an agentDescription`);
    assert.ok(s.customerAction.length > 0, `${id} needs a customerAction`);
  }
});

test('listGrantableScopes returns every scope id, derived not typed', () => {
  assert.deepEqual(listGrantableScopes().sort(), Object.keys(SCOPES).sort());
});

test('manage:domains and manage:webhooks already carry their own read scope in publicScopes', () => {
  // Matches today's MCP_TO_PUBLIC_SCOPES exactly (mcpTokens.js):
  // manage:domains -> ['config.read','config.manage']; read:domains -> ['config.read'].
  assert.deepEqual(SCOPES['manage:domains'].publicScopes.sort(), ['config.manage', 'config.read']);
  assert.deepEqual(SCOPES['manage:motor-blocks'].publicScopes.sort(), ['config.manage', 'config.read']);
  assert.deepEqual(SCOPES['read:domains'].publicScopes, ['config.read']);
  assert.deepEqual(SCOPES['manage:webhooks'].publicScopes, ['webhooks.manage']);
  assert.deepEqual(SCOPES['read:webhooks'].publicScopes, ['webhooks.read']);
  assert.deepEqual(SCOPES['manage:sandbox'].publicScopes, ['sandbox.manage']);
  assert.deepEqual(SCOPES['read:analytics'].publicScopes.sort(), ['analytics.read', 'logs.read', 'usage.read']);
  assert.deepEqual(SCOPES['send:transactional'].publicScopes, []);
});
