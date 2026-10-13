const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SCOPES } = require('../src/scopes.js');

test('manage:recipients exists, is a manage-level scope, and maps to its own public scope only', () => {
  const s = SCOPES['manage:recipients'];
  assert.ok(s);
  assert.equal(s.level, 'manage');
  assert.deepEqual(s.publicScopes, ['recipients.manage']);
});

test('manage:sandbox does NOT unlock the recipient public scope (no silent widening of existing grants)', () => {
  assert.ok(!SCOPES['manage:sandbox'].publicScopes.includes('recipients.manage'));
});

test('the customer text says what the scope allows and the agent text states the recipient click is never an agent action', () => {
  const s = SCOPES['manage:recipients'];
  assert.match(s.customerAction, /recipient/i);
  assert.match(s.agentDescription, /click/i);
  assert.doesNotMatch(s.agentDescription + s.customerAction, /\d/);
});
