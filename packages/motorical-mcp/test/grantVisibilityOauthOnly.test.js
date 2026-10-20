import test from 'node:test';
import assert from 'node:assert/strict';
import { toolsVisibleToGrant } from '../src/grantVisibility.js';

const SANDBOX = [
  'motorical_sandbox_status',
  'motorical_sandbox_provision',
  'motorical_sandbox_convert',
  'motorical_sandbox_allowlist_request',
  'motorical_sandbox_allowlist_confirm',
  'motorical_free_recipient_add',
];

test('an OAuth grant never sees the 6-digit-code allowlist tools, which are dashboard-session only', () => {
  const visible = toolsVisibleToGrant(SANDBOX, ['manage:sandbox', 'manage:recipients']);
  assert.ok(!visible.includes('motorical_sandbox_allowlist_request'));
  assert.ok(!visible.includes('motorical_sandbox_allowlist_confirm'));
  assert.ok(visible.includes('motorical_free_recipient_add'), 'the OAuth-capable replacement stays listed');
  assert.ok(visible.includes('motorical_sandbox_status'));
});

test('with no grant to judge (local stdio server) every tool stays visible, including the allowlist pair', () => {
  assert.deepEqual(toolsVisibleToGrant(SANDBOX, undefined), SANDBOX);
});
