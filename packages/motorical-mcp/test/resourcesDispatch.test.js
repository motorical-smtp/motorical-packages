import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchNative } from '../src/native/dispatch.js';
import { SERVERS } from '../src/servers.js';

const analytics = SERVERS.find((s) => s.key === 'analytics');
const domains = SERVERS.find((s) => s.key === 'domains');

describe('native resources/list, resources/read, resources/templates/list', () => {
  test('resources/list returns the account-state resource on the analytics server', async () => {
    const res = await dispatchNative({ jsonrpc: '2.0', id: 1, method: 'resources/list' }, { server: analytics, client: {}, version: '1.5.0' });
    assert.equal(res.result.resultType, 'complete');
    assert.ok(res.result.resources.some((r) => r.uri === 'motorical://account/state'));
    assert.equal(res.result.cacheScope, 'private');
  });

  test('resources/list returns nothing on a server this resource is not scoped to', async () => {
    const res = await dispatchNative({ jsonrpc: '2.0', id: 2, method: 'resources/list' }, { server: domains, client: {}, version: '1.5.0' });
    assert.deepEqual(res.result.resources, []);
  });

  test('resources/templates/list returns both templates', async () => {
    const res = await dispatchNative({ jsonrpc: '2.0', id: 3, method: 'resources/templates/list' }, { server: analytics, client: {}, version: '1.5.0' });
    assert.equal(res.result.resourceTemplates.length, 2);
  });

  test('resources/read resolves the static account-state resource', async () => {
    const client = { getAccountState: async () => ({ success: true, data: { stage: 'no_domain' } }) };
    const res = await dispatchNative({ jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: 'motorical://account/state' } }, { server: analytics, client, version: '1.5.0' });
    assert.equal(res.result.resultType, 'complete');
    assert.match(res.result.contents[0].text, /no_domain/);
  });

  test('resources/read resolves a matching resource template', async () => {
    const client = { getAccountState: async () => ({ success: true, data: { domains: [{ domain: 'example.com', sendReady: true }] } }) };
    const res = await dispatchNative({ jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'motorical://domain/example.com' } }, { server: analytics, client, version: '1.5.0' });
    assert.match(res.result.contents[0].text, /example\.com/);
  });

  test('resources/read on an unresolvable uri returns -32602, not -32601', async () => {
    const res = await dispatchNative({ jsonrpc: '2.0', id: 6, method: 'resources/read', params: { uri: 'motorical://nope' } }, { server: analytics, client: {}, version: '1.5.0' });
    assert.equal(res.error.code, -32602);
  });

  test('resources/read on a template match that resolves to nothing (e.g. unknown domain) also returns -32602, not a thrown 500', async () => {
    const client = { getAccountState: async () => ({ success: true, data: { domains: [] } }) };
    const res = await dispatchNative({ jsonrpc: '2.0', id: 7, method: 'resources/read', params: { uri: 'motorical://domain/nope.com' } }, { server: analytics, client, version: '1.5.0' });
    assert.equal(res.error.code, -32602);
  });

  // Whole-branch review finding: -32602 ("Invalid Params") means the CLIENT's
  // request was wrong -- a deterministic fact, independent of backend state.
  // The static account-state resource has no uri variables, so it has no
  // "not found" case of its own; every error it can throw is a
  // backend/transport failure (e.g. the upstream HTTP call to
  // client.getAccountState() failing), which is a server-side problem,
  // -32603, not -32602 -- mirroring tasks/get's own resolveTask-throw branch,
  // which is -32603 for exactly the same reason.
  test('resources/read on the static account-state resource throwing a backend/transport error returns -32603, not -32602', async () => {
    const client = { getAccountState: async () => { throw new Error('ECONNREFUSED: backend unreachable'); } };
    const res = await dispatchNative({ jsonrpc: '2.0', id: 8, method: 'resources/read', params: { uri: 'motorical://account/state' } }, { server: analytics, client, version: '1.5.0' });
    assert.equal(res.error.code, -32603);
    assert.match(res.error.message, /backend unreachable/);
  });

  // The template case's own "not found" throw must still map to -32602 --
  // this pins that the static-resource fix above did not accidentally widen
  // to cover template handlers too.
  test('resources/read on a template handler\'s own not-found throw still returns -32602', async () => {
    const client = { getAccountState: async () => ({ success: true, data: { motorBlocks: [] } }) };
    const res = await dispatchNative({ jsonrpc: '2.0', id: 9, method: 'resources/read', params: { uri: 'motorical://motor-block/nope' } }, { server: analytics, client, version: '1.5.0' });
    assert.equal(res.error.code, -32602);
    assert.match(res.error.message, /Motor Block not found/);
  });
});
