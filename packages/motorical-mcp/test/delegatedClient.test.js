import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  createDelegatedClient, TOOL_FOR_METHOD, UNAVAILABLE_TOOL_FOR_METHOD, NO_CLIENT_METHOD_TOOLS,
} from '../src/delegatedClient.js';
import { SERVERS, TOOL_SCOPES } from '../src/servers.js';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const signer = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'k1' };
const transactional = SERVERS.find((s) => s.key === 'transactional');

const claims = {
  userId: 'u1', grantId: 'g1', clientId: 'c',
  scopes: ['send:transactional', 'read:analytics'], motorBlockIds: ['mb-1'],
};

function client(over = {}) {
  return createDelegatedClient({
    claims, server: transactional, signer,
    apiBaseUrl: 'http://127.0.0.1:3001', ...over,
  });
}

test('upstream calls carry a Delegation header, never the inbound bearer', async () => {
  const c = client();
  let seen;
  c.request = async (m, p, opts) => { seen = opts; return {}; };
  await c.sendEmail({ from: 'a@b.com', to: 'c@d.com', subject: 's', text: 't', dryRun: true });
  assert.ok(seen.headers.Authorization.startsWith('Delegation '));
  assert.equal(seen.bearer, undefined);
  assert.equal(seen.apiKey, undefined);
});

test('the delegation names the single block being acted on', async () => {
  const c = client();
  let seen;
  c.request = async (m, p, opts) => { seen = opts; return {}; };
  await c.sendEmail({ from: 'a@b.com', to: 'c@d.com', subject: 's', text: 't', dryRun: true });
  const token = seen.headers.Authorization.slice('Delegation '.length);
  const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'],
    audience: 'https://api.motorical.com/internal/mcp' });
  assert.equal(decoded.motorBlockId, 'mb-1');
  assert.equal(decoded.grantId, 'g1');
});

test('a tool outside this server is refused before any upstream call', async () => {
  const c = client();
  c.request = async () => { throw new Error('must not call upstream'); };
  await assert.rejects(() => c.domainAdd({ domain: 'x.com' }), /not available on this server/);
});

test('a multi-block grant with no selection is an explicit error, not a guess', async () => {
  const c = client({ claims: { ...claims, motorBlockIds: ['mb-1', 'mb-2'] } });
  c.request = async () => ({});
  await assert.rejects(
    () => c.sendEmail({ from: 'a@b.com', to: 'c@d.com', subject: 's', text: 't' }),
    /motorBlockId/
  );
});

test('getMessage resolves motorBlockId from its options argument, not args[0]', async () => {
  // messageId is args[0] here (a string) and motorBlockId lives in args[1] —
  // the selector must not assume the block always sits on the first argument.
  const c = client({ claims: { ...claims, motorBlockIds: ['mb-1', 'mb-2'] } });
  let seen;
  c.request = async (m, p, opts) => { seen = opts; return {}; };
  await c.getMessage('msg-1', { motorBlockId: 'mb-2' });
  const token = seen.headers.Authorization.slice('Delegation '.length);
  const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'],
    audience: 'https://api.motorical.com/internal/mcp' });
  assert.equal(decoded.motorBlockId, 'mb-2');
});

test('getMessageEvents resolves motorBlockId from its options argument, not args[0]', async () => {
  const c = client({ claims: { ...claims, motorBlockIds: ['mb-1', 'mb-2'] } });
  let seen;
  c.request = async (m, p, opts) => { seen = opts; return {}; };
  await c.getMessageEvents('msg-1', { motorBlockId: 'mb-2' });
  const token = seen.headers.Authorization.slice('Delegation '.length);
  const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'],
    audience: 'https://api.motorical.com/internal/mcp' });
  assert.equal(decoded.motorBlockId, 'mb-2');
});

test('an explicit newly appended block bypasses the stale claim and travels to backend authority', async () => {
  const c = client({ claims: { ...claims, motorBlockIds: ['mb-old'] } });
  let seen;
  c.request = async (method, path, opts) => { seen = { method, path, opts }; return { success: true }; };

  await c.getMessage('msg-1', { motorBlockId: 'mb-new' });

  assert.equal(seen.path, '/api/public/v1/messages/msg-1');
  const token = seen.opts.headers.Authorization.slice('Delegation '.length);
  const decoded = jwt.verify(token, publicKey, {
    algorithms: ['RS256'], audience: 'https://api.motorical.com/internal/mcp',
  });
  assert.equal(decoded.motorBlockId, 'mb-new');
});

test('the private live-authorization method calls the backend endpoint with Delegation', async () => {
  const c = client({ claims: { ...claims, motorBlockIds: ['mb-old'] } });
  let seen;
  c.request = async (method, path, opts) => { seen = { method, path, opts }; return { success: true }; };

  await c.authorizeMotorBlock('mb-new');

  assert.equal(seen.method, 'GET');
  assert.equal(seen.path, '/api/public/v1/account/authorization/motor-blocks/mb-new');
  const decoded = jwt.verify(
    seen.opts.headers.Authorization.slice('Delegation '.length),
    publicKey,
    { algorithms: ['RS256'], audience: 'https://api.motorical.com/internal/mcp' }
  );
  assert.equal(decoded.motorBlockId, 'mb-new');
});

test('backend live-authorization denials propagate for uncovered, foreign, deleted, and revoked blocks', async () => {
  for (const denial of [
    { status: 403, code: 'motor_block_not_authorized' },
    { status: 403, code: 'motor_block_not_owned' },
    { status: 403, code: 'motor_block_not_found' },
    { status: 401, code: 'authorization_revoked' },
  ]) {
    const c = client({ claims: { ...claims, motorBlockIds: ['mb-old'] } });
    c.request = async () => {
      const error = new Error(denial.code);
      error.status = denial.status;
      error.data = { code: denial.code, message: denial.code };
      throw error;
    };
    await assert.rejects(
      () => c.authorizeMotorBlock('mb-new'),
      (error) => error.status === denial.status && error.data.code === denial.code
    );
  }
});

test('tools this server does not delegate refuse outright, never reaching the network', async () => {
  const c = client();
  c.request = async () => { throw new Error('must not call upstream'); };
  const calls = [
    () => c.sandboxAllowlistRequest({ email: 'a@b.com' }),
    () => c.sandboxAllowlistConfirm({ email: 'a@b.com', code: '123456' }),
    () => c.mintPublicToken({}),
    () => c.webHandoff({}),
  ];
  for (const call of calls) {
    await assert.rejects(call, /is not available over an OAuth authorization/);
  }
});

test('two concurrent calls do not stomp each other\'s delegation', async () => {
  const c = client({ claims: { ...claims, motorBlockIds: ['mb-1'] } });
  const seen = [];
  c.request = async (m, p, opts) => {
    await new Promise((r) => setTimeout(r, 5));
    seen.push(opts.headers.Authorization);
    return {};
  };
  await Promise.all([
    c.sendEmail({ from: 'a@b.com', to: 'c@d.com', subject: 's', text: 't', dryRun: true }),
    c.getSendApiStatus(),
  ]);
  assert.equal(seen.length, 2);
  for (const a of seen) assert.ok(a.startsWith('Delegation '));
});

// Domains are account-wide (domains.user_id, no motor_block_id column) and a
// Motor Block is created FROM a verified domain, not the other way around.
// Demanding a block for these inverted that order — see
// motorical-docs/plans/2026-09-02-motorblock-domain-dependency.md.
const domains = SERVERS.find((s) => s.key === 'domains');

test('an account-wide tool needs no block, even on a multi-block grant', async () => {
  const c = createDelegatedClient({
    claims: { ...claims, scopes: ['manage:domains'], motorBlockIds: ['mb-1', 'mb-2'] },
    server: domains, signer, apiBaseUrl: 'http://127.0.0.1:3001',
  });
  let seen;
  c.request = async (m, p, opts) => { seen = opts; return {}; };

  await c.domainList();

  const token = seen.headers.Authorization.slice('Delegation '.length);
  const decoded = jwt.verify(token, publicKey, {
    algorithms: ['RS256'], audience: 'https://api.motorical.com/internal/mcp',
  });
  assert.equal(decoded.motorBlockId, undefined);
  assert.equal(decoded.grantId, 'g1');
});

test('an account-wide tool works on a grant covering zero blocks', async () => {
  const c = createDelegatedClient({
    claims: { ...claims, scopes: ['manage:domains'], motorBlockIds: [] },
    server: domains, signer, apiBaseUrl: 'http://127.0.0.1:3001',
  });
  let called = false;
  c.request = async () => { called = true; return {}; };

  await c.domainList();

  assert.equal(called, true);
});

test('an explicit block on an account-wide tool is delegated to the live backend check', async () => {
  const c = createDelegatedClient({
    claims: { ...claims, scopes: ['manage:domains'], motorBlockIds: ['mb-1'] },
    server: domains, signer, apiBaseUrl: 'http://127.0.0.1:3001',
  });
  let called = false;
  c.request = async () => { called = true; return { success: true, data: [] }; };

  await c.domainList({ motorBlockId: 'mb-new' });
  assert.equal(called, true);
});

test('a block-scoped tool still demands a selector on a multi-block grant', async () => {
  const c = client({ claims: { ...claims, motorBlockIds: ['mb-1', 'mb-2'] } });
  c.request = async () => ({});
  await assert.rejects(() => c.getMessage('msg-1'), /motorBlockId/);
});

// Caught live 2026-09-02, after the account-scoped change deployed. The legacy
// "/api/domains" escape hatch in client.js guards on
// hasNoBlockToScopeAPublicToken(), whose comment states the invariant it
// relies on: "A delegated call never hits this branch — resolveBlock() always
// supplies a real motorBlockId". Account-scoped tools now legitimately supply
// NONE, so a delegated domain call fell through to the dashboard route and
// authenticated with the placeholder credential — a live 401.
test('an account-wide delegated call targets the public API, never /api/domains', async () => {
  const c = createDelegatedClient({
    claims: { ...claims, scopes: ['manage:domains'], motorBlockIds: ['mb-1', 'mb-2'] },
    server: domains, signer, apiBaseUrl: 'http://127.0.0.1:3001',
  });
  let seenPath;
  c.request = async (m, p) => { seenPath = p; return {}; };

  await c.domainList();

  assert.equal(seenPath, '/api/public/v1/domains');
});

test('a zero-block delegated domain write targets the public API too', async () => {
  const c = createDelegatedClient({
    claims: { ...claims, scopes: ['manage:domains'], motorBlockIds: [] },
    server: domains, signer, apiBaseUrl: 'http://127.0.0.1:3001',
  });
  let seenPath;
  c.request = async (m, p) => { seenPath = p; return {}; };

  await c.domainAdd({ domain: 'example.com' });

  assert.equal(seenPath, '/api/public/v1/domains');
});

// The structural guard. A catalogue tool with a client method that is absent
// from TOOL_FOR_METHOD is never wrapped for delegation: on the hosted server it
// runs the original method with PLACEHOLDER_CREDENTIAL and returns a confusing
// 401. That was blocker #2 of the resource-server rollout, and adding 14 tools
// at once is exactly when it would recur unnoticed.
test('every catalogue tool is delegated, explicitly refused, or explicitly method-less', () => {
  const wrapped = new Set(Object.values(TOOL_FOR_METHOD));
  const refused = new Set(Object.values(UNAVAILABLE_TOOL_FOR_METHOD));
  const unaccounted = Object.keys(TOOL_SCOPES).filter(
    (t) => !wrapped.has(t) && !refused.has(t) && !NO_CLIENT_METHOD_TOOLS.has(t)
  );
  assert.deepEqual(unaccounted, [],
    `these tools would 401 over OAuth: ${unaccounted.join(', ')}`);
});

test('a delegated analytics call carries a Delegation header AND the right path', async () => {
  const analytics = SERVERS.find((s) => s.key === 'analytics');
  const c = createDelegatedClient({
    claims: { ...claims, scopes: ['read:analytics'], motorBlockIds: ['mb-1'] },
    server: analytics, signer, apiBaseUrl: 'http://127.0.0.1:3001',
  });
  let seenPath, seenOpts;
  c.request = async (m, p, opts) => { seenPath = p; seenOpts = opts; return {}; };

  await c.getOverview({ motorBlockId: 'mb-1' });

  assert.ok(seenOpts.headers.Authorization.startsWith('Delegation '));
  assert.match(seenPath, /^\/api\/public\/v1\/motor-blocks\/mb-1\/overview/);
});

test('a delegated account-wide analytics call needs no block and names no block', async () => {
  const analytics = SERVERS.find((s) => s.key === 'analytics');
  const c = createDelegatedClient({
    claims: { ...claims, scopes: ['read:analytics'], motorBlockIds: ['mb-1', 'mb-2'] },
    server: analytics, signer, apiBaseUrl: 'http://127.0.0.1:3001',
  });
  let seenPath, seenOpts;
  c.request = async (m, p, opts) => { seenPath = p; seenOpts = opts; return {}; };

  await c.getAccountRateLimits();

  assert.equal(seenPath, '/api/public/v1/account/rate-limits');
  const token = seenOpts.headers.Authorization.slice('Delegation '.length);
  const decoded = jwt.verify(token, publicKey, {
    algorithms: ['RS256'], audience: 'https://api.motorical.com/internal/mcp',
  });
  assert.equal(decoded.motorBlockId, undefined);
});

// The shared `client()` fixture defaults to the transactional server, which
// does not expose the webhook tools — assertToolAllowed would refuse them
// before any routing happened. These build a webhooks-server view instead.
const webhooksServer = SERVERS.find((s) => s.key === 'webhooks');
function webhookClient(over = {}) {
  return client({
    server: webhooksServer,
    claims: { ...claims, scopes: ['manage:webhooks'] },
    ...over,
  });
}

test('webhookCreate routes through delegation to the exact webhooks collection URL', async () => {
  const c = webhookClient();
  const calls = [];
  c.request = async (method, path, opts) => { calls.push({ method, path, opts }); return {}; };
  await c.webhookCreate({ motorBlockId: 'mb-1', url: 'https://example.com/hook' });
  assert.equal(calls[0].path, '/api/public/v1/motor-blocks/mb-1/webhooks');
  assert.equal(calls[0].opts.headers.Authorization.startsWith('Delegation '), true);
});

test('webhookUpdate routes to the specific webhook URL, not the collection', async () => {
  const c = webhookClient();
  const calls = [];
  c.request = async (method, path, opts) => { calls.push({ method, path, opts }); return {}; };
  await c.webhookUpdate({ motorBlockId: 'mb-1', webhookId: 'wh-1', enabled: false });
  assert.equal(calls[0].path, '/api/public/v1/motor-blocks/mb-1/webhooks/wh-1');
});

const motorBlocksServer = SERVERS.find((s) => s.key === 'motorBlocks');
function motorBlocksClient(over = {}) {
  return createDelegatedClient({
    claims: { ...claims, scopes: ['manage:motor-blocks'] },
    server: motorBlocksServer,
    signer,
    apiBaseUrl: 'http://127.0.0.1:3001',
    ...over,
  });
}

test('motorBlockCreate is account-scoped and sends idempotency only as a header', async () => {
  const c = motorBlocksClient({ claims: { ...claims, scopes: ['manage:motor-blocks'], motorBlockIds: [] } });
  const calls = [];
  c.request = async (method, path, opts) => { calls.push({ method, path, opts }); return {}; };
  await c.motorBlockCreate({
    name: 'Orders', domainId: '22222222-2222-4222-8222-222222222222',
    type: 'transactional', idempotencyKey: '44444444-4444-4444-8444-444444444444',
  });
  assert.equal(calls[0].path, '/api/public/v1/account/motor-blocks');
  assert.equal(calls[0].opts.headers['Idempotency-Key'], '44444444-4444-4444-8444-444444444444');
  assert.equal('idempotencyKey' in calls[0].opts.body, false);
  const token = calls[0].opts.headers.Authorization.slice('Delegation '.length);
  const decoded = jwt.verify(token, publicKey, {
    algorithms: ['RS256'], audience: 'https://api.motorical.com/internal/mcp',
  });
  assert.equal(decoded.motorBlockId, undefined);
});

test('Motor Block mutation delegates the explicit id even when it is absent from the frozen claim', async () => {
  const c = motorBlocksClient({ claims: { ...claims, scopes: ['manage:motor-blocks'], motorBlockIds: ['old-block'] } });
  const calls = [];
  c.request = async (method, path, opts) => { calls.push({ method, path, opts }); return {}; };
  await c.motorBlockRename({ motorBlockId: 'new-live-block', name: 'Receipts' });
  assert.equal(calls[0].path, '/api/public/v1/account/motor-blocks/new-live-block/name');
  const token = calls[0].opts.headers.Authorization.slice('Delegation '.length);
  const decoded = jwt.verify(token, publicKey, {
    algorithms: ['RS256'], audience: 'https://api.motorical.com/internal/mcp',
  });
  assert.equal(decoded.motorBlockId, 'new-live-block');
});
