const { test } = require('node:test');
const assert = require('node:assert/strict');
const { groupForConsent, publicScopesFor } = require('../src/consent');

test('groupForConsent groups by resource and uses the widest level granted for the label', () => {
  const groups = groupForConsent(['read:webhooks', 'manage:webhooks', 'read:analytics']);
  assert.equal(groups.length, 2);
  const webhooks = groups.find((g) => g.resource === 'webhooks');
  assert.equal(webhooks.label, 'Manage your webhook endpoints');
  assert.deepEqual(webhooks.scopes.sort(), ['manage:webhooks', 'read:webhooks']);
  const analytics = groups.find((g) => g.resource === 'analytics');
  assert.equal(analytics.label, 'Read delivery logs, analytics and usage');
  assert.deepEqual(analytics.scopes, ['read:analytics']);
});

test('a read-only grant for a resource that also has a manage level uses the read label', () => {
  const groups = groupForConsent(['read:domains']);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'View your sending domains');
});

test('groupForConsent never drops the raw scope list, even after grouping', () => {
  const groups = groupForConsent(['send:transactional', 'read:analytics']);
  const allScopes = groups.flatMap((g) => g.scopes);
  assert.deepEqual(allScopes.sort(), ['read:analytics', 'send:transactional']);
});

test('publicScopesFor unions each scope\'s publicScopes and drops logs.pii if it somehow appears', () => {
  assert.deepEqual(
    publicScopesFor(['manage:domains', 'read:analytics']).sort(),
    ['analytics.read', 'config.manage', 'config.read', 'logs.read', 'usage.read'],
  );
  assert.deepEqual(publicScopesFor(['send:transactional']), []);
});
