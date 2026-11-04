// Calling the Comms Block as an MCP agent (Comms MCP M2c): delegation with the comms audience, the workspace in X-Tenant-Id,
// scopes checked before any network call, and named errors that carry their data.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createDelegatedClient } from '../src/delegatedClient.js';
import { SERVERS } from '../src/servers.js';
import { COMMS_DELEGATION_AUDIENCE } from '@motorical/scope-catalog';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const signer = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'k1' };
const server = SERVERS.find((s) => s.key === 'communications');
const W1 = '33333333-3333-4333-8333-333333333333'; const W2 = '44444444-4444-4444-8444-444444444444';
const claims = (scopes = ['read:comms']) => ({ grantId: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222', scopes, motorBlockIds: [] });
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const make = (responder, scopes) => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return responder(url, init); };
  const client = createDelegatedClient({ claims: claims(scopes), server, signer, apiBaseUrl: 'http://backend.test', commsBaseUrl: 'http://comms.test/api', fetchImpl });
  return { client, calls };
};
const workspacesReply = (list) => json(200, { success: true, data: list });

describe('a call to the Comms Block', () => {
  test('goes to the comms base URL with a Delegation for the COMMS audience and the workspace in X-Tenant-Id', async () => {
    const { client, calls } = make((url) => (url.endsWith('/readiness') ? json(200, { success: true, data: { ready: true, next: null } }) : json(404, {})));
    const out = await client.commsGetReadiness({ workspaceId: W1 });
    assert.equal(out.data.ready, true);
    assert.equal(calls.length, 1, 'a named workspace needs no lookup');
    assert.equal(calls[0].url, 'http://comms.test/api/readiness');
    assert.equal(calls[0].init.headers['X-Tenant-Id'], W1);
    const token = calls[0].init.headers.Authorization.replace(/^Delegation /, '');
    const c = jwt.verify(token, publicKey, { algorithms: ['RS256'], audience: COMMS_DELEGATION_AUDIENCE });
    assert.equal(c.grantId, claims().grantId);
    assert.equal(c.resource, server.canonicalUri);
  });

  test('the backend audience is never used for a Comms call (a token for one cannot be replayed at the other)', async () => {
    const { client, calls } = make(() => json(200, { success: true, data: {} }));
    await client.commsGetMap({ workspaceId: W1 });
    const token = calls[0].init.headers.Authorization.replace(/^Delegation /, '');
    assert.throws(() => jwt.verify(token, publicKey, { algorithms: ['RS256'], audience: 'https://api.motorical.com/internal/mcp' }));
  });

  test('without a workspaceId and exactly one workspace covered, that one is used', async () => {
    const { client, calls } = make((url) => (url.endsWith('/workspaces') ? workspacesReply([{ id: W1, name: 'Shop', status: 'active' }]) : json(200, { success: true, data: { workspace: 'shop' } })));
    await client.commsGetMap({});
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.endsWith('/workspaces'));
    assert.equal(calls[0].init.headers['X-Tenant-Id'], undefined, 'the account-level list names no workspace');
    assert.equal(calls[1].init.headers['X-Tenant-Id'], W1);
  });

  test('with several workspaces it refuses and lists them, instead of guessing', async () => {
    const { client } = make((url) => workspacesReply([{ id: W1, name: 'Shop', status: 'active' }, { id: W2, name: 'Blog', status: 'active' }]));
    await assert.rejects(() => client.commsGetReadiness({}), (e) => {
      assert.equal(e.data.code, 'WORKSPACE_REQUIRED');
      assert.deepEqual(e.data.workspaces, [{ id: W1, name: 'Shop', isDefault: false }, { id: W2, name: 'Blog', isDefault: false }]);
      assert.match(e.message, /workspaceId/);
      assert.match(e.message, /Shop/);
      return true;
    });
  });

  test('with several workspaces the default is flagged and suggested first (a default-only customer is not interrogated)', async () => {
    const { client } = make(() => workspacesReply([{ id: W2, name: 'Blog', status: 'active', isDefault: false }, { id: W1, name: 'Shop', status: 'active', isDefault: true }]));
    await assert.rejects(() => client.commsGetReadiness({}), (e) => {
      assert.equal(e.data.code, 'WORKSPACE_REQUIRED');
      assert.equal(e.data.suggestedWorkspaceId, W1);
      assert.deepEqual(e.data.workspaces, [{ id: W1, name: 'Shop', isDefault: true }, { id: W2, name: 'Blog', isDefault: false }], 'the default is listed first');
      assert.ok(e.message.includes("Shop (default)"));
      return true;
    });
  });

  test('when the grant does not cover the default workspace, nothing is suggested', async () => {
    const { client } = make(() => workspacesReply([{ id: W1, name: 'Shop', status: 'active', isDefault: false }, { id: W2, name: 'Blog', status: 'active', isDefault: false }]));
    await assert.rejects(() => client.commsGetReadiness({}), (e) => e.data.code === 'WORKSPACE_REQUIRED' && e.data.suggestedWorkspaceId === null);
  });

  test('a default picked for this connection is used without asking, and the answer says so', async () => {
    const { client, calls } = make((url) => (url.endsWith('/workspaces')
      ? workspacesReply([{ id: W1, name: 'Shop', status: 'active', isDefault: true }, { id: W2, name: 'Blog', status: 'active', isDefault: false, grantDefault: true }])
      : json(200, { success: true, data: {} })));
    await client.commsGetMap({});
    assert.equal(calls[1].init.headers['X-Tenant-Id'], W2, 'the connection default beats the account default');
  });

  test('a call that cannot be undone ignores the saved default and asks for the workspace by name', async () => {
    const LIST = '55555555-5555-4555-8555-555555555555';
    const { client, calls } = make(() => workspacesReply([{ id: W1, name: 'Shop', status: 'active', isDefault: true }, { id: W2, name: 'Blog', status: 'active', grantDefault: true }]),
      ['read:comms', 'manage:comms.audience']);
    await assert.rejects(() => client.commsDeleteList({ listId: LIST }), (e) => e.data.code === 'WORKSPACE_REQUIRED' && e.data.suggestedWorkspaceId === W2 && /name the workspace/.test(e.message));
    assert.equal(calls.length, 1, 'only the workspace list was read; nothing was touched');
  });

  test('with one workspace even an irreversible call needs no name (there is nothing to choose)', async () => {
    const LIST = '55555555-5555-4555-8555-555555555555';
    const { client, calls } = make((url) => (url.endsWith('/workspaces') ? workspacesReply([{ id: W1, name: 'Shop', status: 'active' }])
      : json(200, { success: true, data: { id: LIST, name: 'L', member_count: 1 } })), ['read:comms', 'manage:comms.audience']);
    const out = await client.commsDeleteList({ listId: LIST });
    assert.equal(out.applied, false);
    assert.equal(calls[1].init.headers['X-Tenant-Id'], W1);
  });

  test('with no workspace covered it says so', async () => {
    const { client } = make(() => workspacesReply([]));
    await assert.rejects(() => client.commsGetReadiness({}), (e) => e.data.code === 'NO_WORKSPACE');
  });

  test('an archived workspace is not offered', async () => {
    const { client, calls } = make((url) => (url.endsWith('/workspaces') ? workspacesReply([{ id: W1, name: 'Old', status: 'archived' }, { id: W2, name: 'Live', status: 'active' }]) : json(200, { success: true, data: {} })));
    await client.commsGetMap({});
    assert.equal(calls[1].init.headers['X-Tenant-Id'], W2);
  });
});

describe('refusals', () => {
  test('a grant without read:comms is refused BEFORE any network call', async () => {
    const { client, calls } = make(() => json(200, {}), ['send:transactional']);
    await assert.rejects(() => client.commsGetReadiness({ workspaceId: W1 }), (e) => e.status === 403 && /read:comms/.test(e.message));
    assert.equal(calls.length, 0);
  });

  test('a malformed workspaceId never reaches the network', async () => {
    const { client, calls } = make(() => json(200, {}));
    await assert.rejects(() => client.commsGetMap({ workspaceId: 'not-a-uuid' }), (e) => /workspaceId/.test(e.message));
    assert.equal(calls.length, 0);
  });

  test('the Comms Block\'s named refusals keep their status and code', async () => {
    const { client } = make(() => json(403, { success: false, error: 'This authorization does not include read:comms', code: 'insufficient_scope', missing: ['read:comms'] }));
    await assert.rejects(() => client.commsGetReadiness({ workspaceId: W1 }), (e) => e.status === 403 && e.data.code === 'insufficient_scope' && e.data.missing[0] === 'read:comms');
    const { client: c2 } = make(() => json(403, { success: false, error: 'Workspace is not covered', code: 'workspace_not_authorized' }));
    await assert.rejects(() => c2.commsGetMap({ workspaceId: W2 }), (e) => e.data.code === 'workspace_not_authorized');
  });

  test('a network failure or a non-JSON answer is a plain error, with no token in it', async () => {
    const { client } = make(() => { throw new Error('connect ECONNREFUSED with Authorization: Delegation SECRETTOKEN'); });
    await assert.rejects(() => client.commsGetReadiness({ workspaceId: W1 }), (e) => !String(e.message).includes('SECRETTOKEN') && /Communications/.test(e.message));
    const { client: c2 } = make(() => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }));
    await assert.rejects(() => c2.commsGetMap({ workspaceId: W1 }), (e) => /Communications/.test(e.message));
  });
});

describe('other servers are untouched', () => {
  test('a client for another server has no Comms methods', () => {
    const other = SERVERS.find((s) => s.key === 'webhooks');
    const c = createDelegatedClient({ claims: claims(['read:webhooks']), server: other, signer, apiBaseUrl: 'http://backend.test' });
    assert.equal(c.commsGetReadiness, undefined);
    assert.equal(c.commsGetMap, undefined);
  });
});
