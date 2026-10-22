// motorical_whoami must be listed and callable for ANY OAuth grant (2026-10-22): a connection that holds only send:transactional,
// or only read:analytics, has to be able to ask what it holds. Before this it needed read:analytics on the tool but the route needed
// config.read, so a read:analytics-only grant could see the tool and was then refused.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpApp } from '../src/http.js';
import { SERVERS } from '../src/servers.js';
import { toolsVisibleToGrant, SANDBOX_TOOL_NAMES } from '../src/grantVisibility.js';

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }));
  });
}

async function rpc(app, path, method, params) {
  const s = await listen(app);
  try {
    const res = await fetch(`${s.base}${path}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer any', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 7, method, params }),
    });
    const text = await res.text();
    const line = text.split('\n').find((l) => l.startsWith('data: '));
    return { status: res.status, body: line ? JSON.parse(line.slice(6)) : JSON.parse(text) };
  } finally { s.close(); }
}

const appFor = (scopes, client = {}) => createHttpApp({
  verifier: { verify: async () => ({ userId: 'u1', grantId: 'g1', clientId: 'c', motorBlockIds: [], scopes }) },
  signer: { key: 'unused-in-this-test', kid: 'k1' },
  clientFactory: () => client,
});

describe('motorical_whoami for any grant', () => {
  test('every authenticated server lists it for a grant holding only that server\'s own scope', () => {
    for (const srv of SERVERS) {
      if (srv.key === 'signup') continue;
      const only = srv.scopes.length ? [srv.scopes[0]] : [];
      assert.ok(toolsVisibleToGrant(srv.tools, only).includes('motorical_whoami'), `${srv.key} with ${only}`);
    }
  });

  test('a grant with no scopes at all still sees it', () => {
    assert.deepEqual(toolsVisibleToGrant(['motorical_whoami', 'motorical_send_email'], []), ['motorical_whoami']);
  });

  test('it is not a sandbox-stage tool: it stays listed once the account is past the sandbox phase', () => {
    assert.ok(!SANDBOX_TOOL_NAMES.has('motorical_whoami'));
    assert.ok(toolsVisibleToGrant(['motorical_whoami'], ['manage:sandbox'], { sandboxOver: true }).includes('motorical_whoami'));
  });

  test('tools/list on the transactional server for a send-only grant includes it', async () => {
    const { body } = await rpc(appFor(['send:transactional']), '/v1/motorical_transactional/mcp', 'tools/list', {});
    const names = body.result.tools.map((t) => t.name);
    assert.ok(names.includes('motorical_whoami'));
    assert.ok(names.includes('motorical_send_email'));
    assert.ok(!names.includes('motorical_get_logs'));
  });

  test('tools/call motorical_whoami on the transactional server for a send-only grant reaches the client, not an insufficient_scope refusal', async () => {
    let called = false;
    const client = { getWhoami: async () => { called = true; return { success: true, data: { account: { id: 'u1' }, plan: {}, grant: { scopes: ['send:transactional'] } } }; } };
    const { status, body } = await rpc(appFor(['send:transactional'], client), '/v1/motorical_transactional/mcp', 'tools/call', { name: 'motorical_whoami', arguments: {} });
    assert.equal(status, 200);
    assert.ok(!body.result?.isError, JSON.stringify(body.result));
    assert.ok(called, 'the handler never ran');
  });
});
