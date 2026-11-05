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

test('once the sandbox phase is over, every sandbox-server tool is dropped from the listing', () => {
  const mixed = [...SANDBOX, 'motorical_send_email', 'motorical_whoami'];
  const grant = ['manage:sandbox', 'manage:recipients', 'send:transactional', 'read:analytics'];
  const visible = toolsVisibleToGrant(mixed, grant, { sandboxOver: true });
  for (const name of SANDBOX) assert.ok(!visible.includes(name), `${name} should be hidden`);
  assert.ok(visible.includes('motorical_send_email'));
  assert.ok(visible.includes('motorical_whoami'));
});

test('sandboxOver false or unknown (null/undefined) keeps the sandbox tools listed', () => {
  const grant = ['manage:sandbox', 'manage:recipients'];
  for (const phase of [{ sandboxOver: false }, { sandboxOver: null }, {}, undefined]) {
    const visible = toolsVisibleToGrant(SANDBOX, grant, phase);
    assert.ok(visible.includes('motorical_sandbox_status'));
    assert.ok(visible.includes('motorical_free_recipient_add'));
  }
});

test('a stage rule with no grant to judge (local server) never hides anything', () => {
  assert.deepEqual(toolsVisibleToGrant(SANDBOX, undefined, { sandboxOver: true }), SANDBOX);
});

test('a read:domains-only grant sees every domain READ tool (including config and health) and no domain write tool', () => {
  const DOMAIN = [
    'motorical_domain_list', 'motorical_domain_get', 'motorical_domain_dns_records', 'motorical_domain_health',
    'motorical_get_config', 'motorical_get_domain_health',
    'motorical_domain_add', 'motorical_domain_verify', 'motorical_domain_check_dns',
  ];
  const visible = toolsVisibleToGrant(DOMAIN, ['read:domains']);
  assert.deepEqual(
    visible.sort(),
    ['motorical_domain_dns_records', 'motorical_domain_get', 'motorical_domain_health', 'motorical_domain_list', 'motorical_get_config', 'motorical_get_domain_health'].sort(),
  );
});

// S1: the "Needs permission" marker is worked out from the token on every request, never remembered, so a client that
// shows a stale label is showing its own cached tools/list. Two grants on one server must give two different answers.
import { SERVERS as S1_SERVERS } from '../src/servers.js';
import { toolsListedForGrant as s1List } from '../src/grantVisibility.js';
test('S1: the marker follows the grant presented on each call', () => {
  const main = S1_SERVERS.find((s) => s.key === 'main');
  const without = s1List(main, ['read:analytics']).notes;
  const withScope = s1List(main, ['read:analytics', 'read:webhooks']).notes;
  assert.match(without.get('motorical_webhook_list') || '', /Needs permission: read:webhooks/);
  assert.equal(withScope.has('motorical_webhook_list'), false, 'a held scope must not be marked');
});
