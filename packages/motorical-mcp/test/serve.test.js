// packages/motorical-mcp/test/serve.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { buildServer, defaultJwksUrl } from '../src/serve.js';

const ENV = {
  MCP_PORT: '3012',
  MCP_JWT_PRIVATE_KEY_FILE: '/etc/motorical/jwt_private.pem',
  MOTORICAL_API_BASE_URL: 'http://127.0.0.1:3001',
};

test('defaults to port 3012 and loopback only', () => {
  const { port, host } = buildServer({ ...ENV, MCP_PORT: undefined }, { signer: { key: 'k', kid: 'k1' } });
  assert.equal(port, 3012);
  assert.equal(host, '127.0.0.1');
});

test('refuses to start without a signing key rather than starting unable to call upstream', () => {
  assert.throws(() => buildServer(ENV, { signer: null }), /signing key/i);
});

test('the app exposes every catalogue path', async () => {
  const { app } = buildServer(ENV, { signer: { key: 'k', kid: 'k1' } });
  assert.equal(typeof app.listen, 'function');
});

test('the default JWKS URL is loopback, not the public internet', () => {
  assert.equal(defaultJwksUrl({}), 'http://127.0.0.1:3001/.well-known/jwks.json');
});

test('MCP_JWKS_URL overrides the default', () => {
  assert.equal(
    defaultJwksUrl({ MCP_JWKS_URL: 'https://override.example/jwks.json' }),
    'https://override.example/jwks.json'
  );
});

test('a signing key path that exists but cannot be read produces an actionable message, not a raw stack', () => {
  // A directory reproduces the same "exists but readFileSync throws" shape as
  // an EACCES-restricted file, without depending on this test's own uid/perms.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-key-'));
  try {
    assert.throws(
      () => buildServer({ ...ENV, MCP_JWT_PRIVATE_KEY_FILE: dir }),
      (err) => /signing key/i.test(err.message) && /could not be read/i.test(err.message)
    );
  } finally {
    fs.rmdirSync(dir);
  }
});

// The two tests below close a gap a task reviewer flagged in the original
// implementation: every existing test for the auth-bypass fed its OWN stub
// `clientFactory` straight to `createHttpApp`, so nothing ever exercised
// buildServer()'s REAL `clientFactory` closure --
//   server.public ? createUnauthenticatedClient({apiBaseUrl})
//                 : createDelegatedClient({claims, server, signer, apiBaseUrl})
// -- which is the wiring that actually runs in production. An inverted (or
// mis-scoped) condition there would not throw at module load; it would only
// surface the first time a real signup request hit prod and crashed on
// `claims.motorBlockIds` inside createDelegatedClient (delegatedClient.js:121),
// because http.js's authenticateMcp already sets `req.mcpClaims = null` for
// `server.public` servers regardless of which client factory branch runs.

test('buildServer() real wiring routes the public signup server to createUnauthenticatedClient, not createDelegatedClient', async () => {
  // motorical_signup_handoff (registry.js) is on the signup server's tool
  // list (servers.js), so a real call reaches client.signupHandoff(), which
  // hits the upstream API with no Authorization header at all. A real
  // stand-in upstream -- the same technique the sibling test below uses --
  // makes this unambiguous: the WRONG branch (createDelegatedClient, with the
  // real claims=null authenticateMcp supplies for a public server) throws
  // synchronously on `claims.motorBlockIds` before the network is ever
  // touched, which http.js's outer catch turns into a bare HTTP 500 and the
  // upstream never sees a request. A 200 with the upstream having received a
  // credential-less request is therefore proof the real branch picked
  // createUnauthenticatedClient, not a status-code coincidence.
  let upstreamAuth = 'not-called';
  const upstreamApp = express();
  upstreamApp.post('/api/auth/signup-handoff', (req, res) => {
    upstreamAuth = req.headers.authorization;
    res.json({ success: true, code: 'c1', url: 'https://motorical.com/get-started?handoff=c1', expiresInSeconds: 1800 });
  });
  const upstream = upstreamApp.listen(0, '127.0.0.1');
  await new Promise((resolve) => upstream.once('listening', resolve));
  const upstreamBase = `http://127.0.0.1:${upstream.address().port}`;

  const { app } = buildServer({ ...ENV, MOTORICAL_API_BASE_URL: upstreamBase }, { signer: { key: 'k', kid: 'k1' } });

  try {
    const { default: request } = await import('supertest');
    const res = await request(app)
      .post('/v1/signup/mcp')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'motorical_signup_handoff',
          arguments: {},
          _meta: { 'io.modelcontextprotocol/clientCapabilities': {} },
        },
      });

    assert.equal(res.status, 200);
    assert.equal(res.body?.result?.isError, false, `expected a clean success, got: ${JSON.stringify(res.body)}`);
    assert.equal(res.body?.result?.structuredContent?.continuationToken, 'c1');
    assert.equal(upstreamAuth, undefined, 'upstream received an Authorization header -- createDelegatedClient ran instead of createUnauthenticatedClient');
  } finally {
    upstream.close();
  }
});

test('buildServer() real wiring still routes a non-public server to createDelegatedClient (a Delegation header reaches the wire)', async () => {
  // The mirror image of the test above: prove the branch was not inverted or
  // short-circuited to always pick one side, by driving a real (non-public)
  // server through buildServer() end to end -- real verifier-issued claims,
  // real delegatedClient signing, a real outbound HTTP call -- and reading the
  // Authorization header a tiny stand-in upstream actually received.
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const signer = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'k1' };

  let upstreamAuth;
  const upstreamApp = express();
  upstreamApp.get('/api/public/v1/account/state', (req, res) => {
    upstreamAuth = req.headers.authorization;
    res.json({ stage: 'verified', ready_to_send: true });
  });
  const upstream = upstreamApp.listen(0, '127.0.0.1');
  await new Promise((resolve) => upstream.once('listening', resolve));
  const upstreamBase = `http://127.0.0.1:${upstream.address().port}`;

  const claims = {
    userId: 'u1', grantId: 'g1', clientId: 'c',
    scopes: ['read:analytics'], motorBlockIds: [],
  };
  const { app } = buildServer({ ...ENV, MOTORICAL_API_BASE_URL: upstreamBase }, {
    signer,
    verifier: { verify: async () => claims },
  });

  try {
    const { default: request } = await import('supertest');
    // motorical_get_onboarding_state is account-scoped (servers.js's
    // ACCOUNT_SCOPED_TOOLS), so it needs no motorBlockId argument and no
    // pre-seeded task store -- the smallest real tool call that reaches the
    // network through createDelegatedClient's callView/authFor plumbing.
    const res = await request(app)
      .post('/v1/motorical/mcp')
      .set('Authorization', 'Bearer good')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'motorical_get_onboarding_state',
          arguments: {},
          _meta: { 'io.modelcontextprotocol/clientCapabilities': {} },
        },
      });

    assert.equal(res.status, 200);
    assert.ok(upstreamAuth, 'upstream never received a request -- the real call never reached the network');
    // createDelegatedClient's callView forces this header on regardless of
    // what the wrapped method resolved -- the one thing createUnauthenticatedClient
    // (a plain, credential-less MotoricalClient) could never produce.
    assert.ok(upstreamAuth.startsWith('Delegation '), `expected a Delegation header, got: ${upstreamAuth}`);
  } finally {
    upstream.close();
  }
});
