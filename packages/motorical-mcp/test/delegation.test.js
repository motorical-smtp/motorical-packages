import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { mintDelegation, DELEGATION_AUDIENCE } from '../src/delegation.js';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const signer = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'k1' };

test('the delegation names the grant, the user and exactly one motor block', () => {
  const t = mintDelegation({
    grantId: 'g1', userId: 'u1', motorBlockId: 'mb-1',
    scopes: ['send:transactional'],
    canonicalUri: 'https://mcp.motorical.com/v1/motorical_transactional/mcp',
  }, signer);
  const c = jwt.verify(t, publicKey, { algorithms: ['RS256'], audience: DELEGATION_AUDIENCE });
  assert.equal(c.grantId, 'g1');
  assert.equal(c.userId, 'u1');
  assert.equal(c.motorBlockId, 'mb-1');
  assert.equal(c.type, 'mcp_delegation');
  assert.equal(c.iss, 'https://mcp.motorical.com');
});

test('the delegation is short-lived — it is a per-call assertion, not a session', () => {
  const t = mintDelegation({ grantId: 'g1', userId: 'u1', motorBlockId: 'mb-1', scopes: [],
    canonicalUri: 'https://mcp.motorical.com/v1/motorical/mcp' }, signer);
  const c = jwt.decode(t);
  assert.ok(c.exp - c.iat <= 120, `ttl was ${c.exp - c.iat}s`);
});

test('it never contains the inbound client token', () => {
  const t = mintDelegation({ grantId: 'g1', userId: 'u1', motorBlockId: 'mb-1',
    scopes: ['send:transactional'], canonicalUri: 'https://mcp.motorical.com/v1/motorical/mcp',
    inboundToken: 'SECRET-CLIENT-TOKEN' }, signer);
  assert.ok(!t.includes('SECRET-CLIENT-TOKEN'));
  assert.ok(!JSON.stringify(jwt.decode(t)).includes('SECRET-CLIENT-TOKEN'));
});
