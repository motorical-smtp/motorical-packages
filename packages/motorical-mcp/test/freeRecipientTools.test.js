import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createDelegatedClient } from '../src/delegatedClient.js';
import { dispatchNative } from '../src/native/dispatch.js';
import { TOOLS as REGISTRY } from '../src/registry.js';
import { SERVERS } from '../src/servers.js';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const signer = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'k1' };
const ID = '11111111-1111-4111-8111-111111111111';

function delegated() {
  return createDelegatedClient({
    claims: { grantId: 'g1', userId: 'u1', motorBlockIds: [], scopes: ['manage:recipients'] },
    server: { canonicalUri: 'https://mcp.motorical.com/v1/motorical_sandbox/mcp', tools: ['motorical_free_recipient_add', 'motorical_free_recipient_list', 'motorical_free_recipient_remove'] },
    signer,
    apiBaseUrl: 'https://api.motorical.com',
  });
}

function stubFetch() {
  const seen = [];
  global.fetch = async (url, opts) => {
    seen.push({ url, opts });
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, data: {} }) };
  };
  return seen;
}

test('add posts the email to the Public API recipient route under a Delegation header', async () => {
  const seen = stubFetch();
  await delegated().freeRecipientAdd({ email: 'friend@example.com' });
  assert.match(seen[0].url, /\/api\/public\/v1\/account\/free-recipients$/);
  assert.equal(seen[0].opts.method, 'POST');
  assert.deepEqual(JSON.parse(seen[0].opts.body), { email: 'friend@example.com' });
  assert.match(seen[0].opts.headers.Authorization, /^Delegation /);
});

test('list gets and remove deletes by encoded id', async () => {
  const seen = stubFetch();
  const c = delegated();
  await c.freeRecipientList();
  await c.freeRecipientRemove({ id: ID });
  assert.equal(seen[0].opts.method, 'GET');
  assert.match(seen[0].url, /\/account\/free-recipients$/);
  assert.equal(seen[1].opts.method, 'DELETE');
  assert.match(seen[1].url, new RegExp(`/account/free-recipients/${ID}$`));
});

test('the add description says it never confirms, names the recipient, and carries no digit', () => {
  const tool = REGISTRY.find((t) => t.name === 'motorical_free_recipient_add');
  assert.match(tool.description, /never confirms/);
  assert.match(tool.description, /recipient/);
  assert.doesNotMatch(tool.description, /\d/);
});

test('add, list and send descriptions carry the cold-walk clarifications', () => {
  const by = (n) => REGISTRY.find((t) => t.name === n).description;
  assert.match(by('motorical_free_recipient_add'), /data\.recipient/);
  assert.match(by('motorical_free_recipient_add'), /still click/);
  assert.match(by('motorical_free_recipient_list'), /non-sandbox Motor Blocks/);
  assert.match(by('motorical_free_recipient_list'), /motorical_sandbox_status/);
  assert.match(by('motorical_send_email'), /effective allowlist/);
  assert.match(by('motorical_send_email'), /motorical_free_recipient_add/);
  assert.match(by('motorical_send_email'), /taskId.*NOT the message id/);
  assert.match(by('motorical_sandbox_status'), /not that nothing can be sent/);
  assert.match(by('motorical_web_handoff'), /if it says expired/);
  assert.doesNotMatch(by('motorical_free_recipient_add'), /\d/);
  assert.doesNotMatch(by('motorical_free_recipient_list'), /\d/);
});

test('remove requires confirmation like the webhook delete does, and add/list do not', async () => {
  const main = SERVERS.find((s) => s.key === 'main');
  let called = false;
  const client = { freeRecipientRemove: async () => { called = true; return { success: true }; } };
  const first = await dispatchNative(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'motorical_free_recipient_remove', arguments: { id: ID } } },
    { server: main, client, version: '1.9.0' }
  );
  assert.equal(first.result.resultType, 'input_required');
  assert.equal(called, false);
  assert.ok(REGISTRY.find((t) => t.name === 'motorical_free_recipient_remove').mrtr);
  assert.ok(!REGISTRY.find((t) => t.name === 'motorical_free_recipient_add').mrtr);
  assert.ok(!REGISTRY.find((t) => t.name === 'motorical_free_recipient_list').mrtr);
});
