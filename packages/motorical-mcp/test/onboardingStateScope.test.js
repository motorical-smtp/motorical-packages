// motorical_get_onboarding_state needs read:domains (2026-10-22): the route behind it needs config.read, which read:analytics does not carry.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toolsVisibleToGrant } from '../src/grantVisibility.js';
import { SERVERS } from '../src/servers.js';

const server = (key) => SERVERS.find((s) => s.key === key);

describe('motorical_get_onboarding_state follows the scope its route needs', () => {
  test('a read:analytics-only grant on the analytics server does not see it', () => {
    const listed = toolsVisibleToGrant(server('analytics').tools, ['read:analytics']);
    assert.ok(!listed.includes('motorical_get_onboarding_state'));
    assert.ok(listed.includes('motorical_get_overview'));
  });

  test('a read:domains grant on the domains server sees it, and so does manage:domains (which implies read)', () => {
    assert.ok(toolsVisibleToGrant(server('domains').tools, ['read:domains']).includes('motorical_get_onboarding_state'));
    assert.ok(toolsVisibleToGrant(server('domains').tools, ['manage:domains']).includes('motorical_get_onboarding_state'));
  });

  test('a send-only grant never sees it', () => {
    for (const key of ['transactional', 'domains', 'main']) {
      assert.ok(!toolsVisibleToGrant(server(key).tools, ['send:transactional']).includes('motorical_get_onboarding_state'), key);
    }
  });

  test('the main server still lists it for a grant holding read:domains', () => {
    assert.ok(toolsVisibleToGrant(server('main').tools, ['read:domains', 'read:analytics']).includes('motorical_get_onboarding_state'));
  });
});
