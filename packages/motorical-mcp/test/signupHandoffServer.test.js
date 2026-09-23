import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpApp } from '../src/http.js';
import { SERVERS } from '../src/servers.js';

test('the signup server accepts a tools/call with no Authorization header at all', async () => {
  const signupServer = SERVERS.find((s) => s.key === 'signup');
  assert.ok(signupServer, 'signup server must be registered');
  assert.equal(signupServer.public, true);

  let capturedClaims = 'not-called';
  const app = createHttpApp({
    verifier: { verify: async () => { throw new Error('verify() must never be called for a public server'); } },
    signer: {},
    clientFactory: ({ claims }) => {
      capturedClaims = claims;
      return { signupHandoff: async () => ({ status: 'awaiting_browser', url: 'https://motorical.com/get-started?handoff=x' }) };
    },
  });

  const { default: request } = await import('supertest');
  // _meta must sit inside `params` (the MCP spec's actual location, and the
  // one place detectRevision.js reads it: `body.params._meta`) so this
  // request takes the native 2026-07-28 dispatch path rather than falling
  // through to the legacy SDK transport, which demands an `Accept:
  // text/event-stream` header this test does not send.
  const res = await request(app)
    .post('/v1/signup/mcp')
    .send({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: {
        name: 'motorical_signup_handoff',
        arguments: {},
        _meta: { 'io.modelcontextprotocol/clientCapabilities': {} },
      },
    });

  assert.equal(res.status, 200);
  assert.equal(capturedClaims, null);
});

test('a non-public server still 401s with no Authorization header', async () => {
  const app = createHttpApp({
    verifier: { verify: async () => { const e = new Error('no token'); e.status = 401; throw e; } },
    signer: {},
    clientFactory: () => ({}),
  });
  const { default: request } = await import('supertest');
  const res = await request(app).post('/v1/motorical/mcp').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(res.status, 401);
});
