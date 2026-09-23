// packages/motorical-mcp/test/resourceAuth.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createVerifier, assertToolAllowed, McpAuthError } from '../src/resourceAuth.js';
import { SERVERS } from '../src/servers.js';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key-1';
const ISSUER = 'https://motorical.com';
const TRANSACTIONAL = 'https://mcp.motorical.com/v1/motorical_transactional/mcp';
const ANALYTICS = 'https://mcp.motorical.com/v1/motorical_analytics/mcp';

function jwks() {
  const { n, e } = publicKey.export({ format: 'jwk' });
  return { keys: [{ kty: 'RSA', use: 'sig', alg: 'RS256', kid: KID, n, e }] };
}

const fetchImpl = async () => ({ ok: true, status: 200, json: async () => jwks() });

function token(over = {}) {
  const { aud = TRANSACTIONAL, ...rest } = over;
  return jwt.sign(
    { userId: 'u1', grantId: 'g1', clientId: 'c', scopes: ['send:transactional'],
      motorBlockIds: ['mb-1'], type: 'access_token', ...rest },
    privateKey,
    { algorithm: 'RS256', keyid: KID, issuer: ISSUER, audience: aud, subject: 'u1', expiresIn: 3600 }
  );
}

const verifier = () => createVerifier({ jwksUrl: `${ISSUER}/.well-known/jwks.json`, fetchImpl });

test('accepts a token bound to this server', async () => {
  const claims = await verifier().verify(token(), TRANSACTIONAL);
  assert.equal(claims.userId, 'u1');
  assert.deepEqual(claims.scopes, ['send:transactional']);
});

test('rejects a token minted for a DIFFERENT scoped server (§B3.2)', async () => {
  await assert.rejects(() => verifier().verify(token({ aud: ANALYTICS }), TRANSACTIONAL),
    (e) => e instanceof McpAuthError && e.status === 401);
});

test('rejects a legacy smtp.motorical.com token', async () => {
  const legacy = jwt.sign({ type: 'access_token', userId: 'u1' }, privateKey,
    { algorithm: 'RS256', keyid: KID, issuer: 'auth.motorical.com', audience: 'smtp.motorical.com' });
  await assert.rejects(() => verifier().verify(legacy, TRANSACTIONAL),
    (e) => e instanceof McpAuthError);
});

test('rejects an HS256 token even if the claims look right (alg confusion)', async () => {
  const forged = jwt.sign(
    { userId: 'u1', grantId: 'g1', scopes: ['send:transactional'], type: 'access_token' },
    'some-shared-secret',
    { algorithm: 'HS256', keyid: KID, issuer: ISSUER, audience: TRANSACTIONAL }
  );
  await assert.rejects(() => verifier().verify(forged, TRANSACTIONAL),
    (e) => e instanceof McpAuthError);
});

test('a missing token produces a 401 with a resource_metadata challenge', async () => {
  await assert.rejects(() => verifier().verify(null, TRANSACTIONAL), (e) => {
    assert.equal(e.status, 401);
    assert.match(e.challenge, /^Bearer /);
    assert.match(e.challenge, /resource_metadata="https:\/\/mcp\.motorical\.com\/\.well-known\/oauth-protected-resource\/v1\/motorical_transactional\/mcp"/);
    return true;
  });
});

test('the JWKS is fetched once and cached', async () => {
  let calls = 0;
  const counting = async () => { calls += 1; return { ok: true, status: 200, json: async () => jwks() }; };
  const v = createVerifier({ jwksUrl: `${ISSUER}/.well-known/jwks.json`, fetchImpl: counting });
  await v.verify(token(), TRANSACTIONAL);
  await v.verify(token(), TRANSACTIONAL);
  assert.equal(calls, 1);
});

test('a tool outside the server is refused, whatever the scopes say', () => {
  const transactional = SERVERS.find((s) => s.key === 'transactional');
  assert.throws(() => assertToolAllowed(transactional, 'motorical_domain_add',
    ['send:transactional', 'manage:domains']), McpAuthError);
});

test('insufficient scope returns 403 with EVERY required scope in one challenge', () => {
  const domains = SERVERS.find((s) => s.key === 'domains');
  try {
    assertToolAllowed(domains, 'motorical_domain_add', ['read:analytics']);
    assert.fail('should have thrown');
  } catch (e) {
    assert.equal(e.status, 403);
    assert.equal(e.code, 'insufficient_scope');
    assert.match(e.challenge, /error="insufficient_scope"/);
    assert.match(e.challenge, /scope="manage:domains"/);
  }
});

test('an allowed tool with sufficient scope passes', () => {
  const transactional = SERVERS.find((s) => s.key === 'transactional');
  assertToolAllowed(transactional, 'motorical_send_email', ['send:transactional']);
});

// The main server's scope list is the UNION of every scoped server. Requiring
// all of it for every tool would make the convenience path the strictest one:
// a grant carrying only send:transactional could not send.
test('the main server requires only the scopes the tool itself needs', () => {
  const main = SERVERS.find((s) => s.key === 'main');
  assertToolAllowed(main, 'motorical_send_email', ['send:transactional']);
  assertToolAllowed(main, 'motorical_domain_add', ['manage:domains']);
});

test('the main server still refuses a tool whose scope is absent', () => {
  const main = SERVERS.find((s) => s.key === 'main');
  assert.throws(() => assertToolAllowed(main, 'motorical_domain_add', ['send:transactional']),
    (e) => e.code === 'insufficient_scope' && /manage:domains/.test(e.challenge));
});

// motorical_domain_check_dns persists to the domains row (it isn't a pure
// read), so the backend route requires config.manage — only manage:domains
// grants that on the MCP side. A grant holding only read:domains (which
// covers motorical_domain_list) must NOT be enough to call check-dns: that
// would let the MCP layer accept a call the backend then refuses with a 403,
// a confusing broken UX. Regression guard for the 2026-09 finding where this
// tool was briefly (and wrongly) remapped to read:domains alongside the
// actually-read-only domain_list/webhook_* tools.
test('motorical_domain_check_dns still requires manage:domains, unlike motorical_domain_list', () => {
  const domains = SERVERS.find((s) => s.key === 'domains');
  assertToolAllowed(domains, 'motorical_domain_list', ['read:domains']);
  assert.throws(() => assertToolAllowed(domains, 'motorical_domain_check_dns', ['read:domains']),
    (e) => e.code === 'insufficient_scope' && /manage:domains/.test(e.challenge));
  assertToolAllowed(domains, 'motorical_domain_check_dns', ['manage:domains']);
});

test('manage:webhooks still covers a read:webhooks-only tool, sourced from the shared catalog now', () => {
  const server = { canonicalUri: 'https://mcp.motorical.com/v1/motorical_webhooks/mcp', tools: ['motorical_webhook_list'] };
  // Should not throw: motorical_webhook_list needs read:webhooks, which manage:webhooks implies.
  assertToolAllowed(server, 'motorical_webhook_list', ['manage:webhooks']);
});
