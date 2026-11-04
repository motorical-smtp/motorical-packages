// The front door (spec 2026-11-04): the `main` server also serves the Communications tools.
// Audience, delegation, revoke, union listing, marked-not-hidden, tool hints, workspace default, silent refresh.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createHttpApp } from '../src/http.js';
import { createVerifier } from '../src/resourceAuth.js';
import { SERVERS, ALL_TOOLS, TOOL_ROUTES, PROMPT_TOOLS } from '../src/servers.js';
import { TOOLS } from '../src/registry.js';
import { createDelegatedClient } from '../src/delegatedClient.js';
import { mintDelegation, DELEGATION_AUDIENCE } from '../src/delegation.js';
import { COMMS_DELEGATION_AUDIENCE, SERVER_TOOLS, TOOL_SCOPES } from '@motorical/scope-catalog';
import { PERMISSION_NEEDED_SENTENCE } from '../src/permissionNeeded.js';
import { __testOnly_setDefaultStore, closeTaskStore } from '../src/native/taskStore.js';

after(async () => { __testOnly_setDefaultStore(null); await closeTaskStore(); });

const MAIN = SERVERS.find((s) => s.key === 'main');
const COMMS = SERVERS.find((s) => s.key === 'communications');
const ANALYTICS = SERVERS.find((s) => s.key === 'analytics');
const READ_ONLY = ['read:comms', 'send:transactional', 'read:analytics'];

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const signer = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'k1' };

function listen(app) {
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() }));
  });
}

function appWith({ scopes, grantScopesLookup, clientFactory = () => ({}) } = {}) {
  return createHttpApp({
    verifier: { verify: async () => ({ userId: 'u1', grantId: 'g1', clientId: 'c', scopes, motorBlockIds: [] }) },
    signer: { key: 'unused', kid: 'k1' },
    grantScopesLookup,
    clientFactory,
  });
}

async function rpc(base, path, method, params = {}, { native = false } = {}) {
  const p = native ? { ...params, _meta: { 'io.modelcontextprotocol/clientCapabilities': {} } } : params;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: p }),
  });
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  let body = null;
  try { body = line ? JSON.parse(line.slice(6)) : JSON.parse(text); } catch (_) { /* leave null */ }
  return { status: res.status, headers: res.headers, body };
}

describe('the front door row', () => {
  test('is the existing main server: same slug and URL, no second one', () => {
    assert.equal(MAIN.slug, 'motorical');
    assert.equal(MAIN.canonicalUri, 'https://mcp.motorical.com/v1/motorical/mcp');
    assert.equal(SERVERS.filter((s) => s.canonicalUri === MAIN.canonicalUri).length, 1);
  });
  test('lists the union of the main tools and the communications tools', () => {
    for (const t of ALL_TOOLS) assert.ok(MAIN.tools.includes(t), t);
    for (const t of COMMS.tools) assert.ok(MAIN.tools.includes(t), t);
  });
  test('its first consent stays small: read-only comms only, nothing that edits or sends', () => {
    assert.ok(MAIN.initialScopes.includes('read:comms'));
    for (const s of ['write:comms.audience', 'write:comms.content', 'send:comms.campaign', 'manage:comms.workspace', 'manage:comms.webhooks']) {
      assert.ok(!MAIN.initialScopes.includes(s), s);
      assert.ok(MAIN.scopes.includes(s), `${s} is still offered for a later step-up`);
    }
  });
  test('every main tool has a documented route', () => {
    for (const t of MAIN.tools) assert.ok(t in TOOL_ROUTES, t);
  });
});

describe('audience: a token is only good at its own server', () => {
  const jwk = publicKey.export({ format: 'jwk' });
  const verifier = createVerifier({ jwksUrl: 'http://jwks.test', fetchImpl: async () => ({ ok: true, json: async () => ({ keys: [{ ...jwk, kid: 'k1' }] }) }) });
  const token = (aud) => jwt.sign({ type: 'access_token', userId: 'u1', grantId: 'g1', scopes: ['read:comms'] }, signer.key, {
    algorithm: 'RS256', keyid: 'k1', issuer: 'https://motorical.com', audience: aud, expiresIn: 60,
  });
  test('a front-door token verifies at main', async () => {
    assert.equal((await verifier.verify(token(MAIN.canonicalUri), MAIN.canonicalUri)).grantId, 'g1');
  });
  for (const narrow of SERVERS.filter((s) => s.key !== 'main' && !s.public)) {
    test(`a front-door token is rejected at ${narrow.key}, and ${narrow.key}'s token at the front door`, async () => {
      await assert.rejects(verifier.verify(token(MAIN.canonicalUri), narrow.canonicalUri), (e) => e.status === 401 && e.code === 'invalid_token');
      await assert.rejects(verifier.verify(token(narrow.canonicalUri), MAIN.canonicalUri), (e) => e.status === 401 && e.code === 'invalid_token');
    });
  }
});

describe('delegation: backend and Comms Block assertions never replay at each other', () => {
  const input = { grantId: 'g1', userId: 'u1', scopes: ['read:comms'], canonicalUri: MAIN.canonicalUri };
  test('different audiences', () => {
    const backend = mintDelegation(input, signer);
    const comms = mintDelegation(input, signer, { audience: COMMS_DELEGATION_AUDIENCE });
    assert.notEqual(DELEGATION_AUDIENCE, COMMS_DELEGATION_AUDIENCE);
    assert.doesNotThrow(() => jwt.verify(backend, publicKey, { audience: DELEGATION_AUDIENCE }));
    assert.throws(() => jwt.verify(backend, publicKey, { audience: COMMS_DELEGATION_AUDIENCE }));
    assert.throws(() => jwt.verify(comms, publicKey, { audience: DELEGATION_AUDIENCE }));
  });

  test('through main, a backend tool mints a backend delegation and a comms_* tool a Comms Block one; the inbound token is never forwarded', async () => {
    const seen = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      seen.push({ url: String(url), auth: init.headers.Authorization || init.headers.authorization });
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    try {
      const claims = { userId: 'u1', grantId: 'g1', scopes: ['read:comms', 'read:analytics'], motorBlockIds: ['mb-1'] };
      const client = createDelegatedClient({ claims, server: MAIN, signer, apiBaseUrl: 'http://api.test', commsBaseUrl: 'http://comms.test/api', fetchImpl: globalThis.fetch });
      await client.listMotorBlocks({});
      await client.commsListWorkspaces({});
      const [back, comms] = seen;
      assert.match(back.url, /^http:\/\/api\.test/);
      assert.match(comms.url, /^http:\/\/comms\.test/);
      const aud = (h) => jwt.decode(h.replace('Delegation ', '')).aud;
      assert.equal(aud(back.auth), DELEGATION_AUDIENCE);
      assert.equal(aud(comms.auth), COMMS_DELEGATION_AUDIENCE);
    } finally { globalThis.fetch = realFetch; }
  });

  test('revoke bites on the very next call through the front door', async () => {
    let revoked = false;
    const fetchImpl = async () => (revoked
      ? new Response(JSON.stringify({ success: false, error: 'Authorization has been revoked', code: 'authorization_revoked' }), { status: 401 })
      : new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }));
    const client = createDelegatedClient({
      claims: { userId: 'u1', grantId: 'g1', scopes: ['read:comms'], motorBlockIds: [] }, server: MAIN, signer, apiBaseUrl: 'http://api.test', commsBaseUrl: 'http://comms.test/api', fetchImpl,
    });
    await client.commsListWorkspaces({});
    revoked = true;
    await assert.rejects(client.commsListWorkspaces({}), (e) => e.status === 401 && e.data.code === 'authorization_revoked');
  });
});

describe('marked, not hidden (main only)', () => {
  const name = 'comms_schedule_campaign';
  async function list(app, path, opts) {
    const s = await listen(app);
    try { return (await rpc(s.base, path, 'tools/list', {}, opts)).body?.result?.tools || []; } finally { s.close(); }
  }

  for (const native of [false, true]) {
    test(`a read-only grant sees the comms tools it lacks, marked from TOOL_SCOPES (${native ? 'native' : 'legacy'} transport)`, async () => {
      const tools = await list(appWith({ scopes: READ_ONLY }), MAIN.path, { native });
      const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
      assert.ok(byName[name], 'still listed');
      for (const scope of TOOL_SCOPES[name]) assert.match(byName[name].description, new RegExp(`Needs permission: [^.]*${scope.replace(/[.:]/g, '\\$&')}`));
      assert.ok(byName.comms_list_lists, 'a tool the grant covers is listed');
      assert.doesNotMatch(byName.comms_list_lists.description, /Needs permission/);
      assert.doesNotMatch(byName.motorical_send_email.description, /Needs permission/);
    });
  }

  test('every main tool is listed for a read-only grant (union listing: nothing hidden)', async () => {
    const tools = await list(appWith({ scopes: READ_ONLY }), MAIN.path);
    const got = new Set(tools.map((t) => t.name));
    const hiddenByDesign = new Set(['motorical_sandbox_allowlist_request', 'motorical_sandbox_allowlist_confirm', ...PROMPT_TOOLS]);
    for (const t of SERVER_TOOLS.main) if (!hiddenByDesign.has(t)) assert.ok(got.has(t), `${t} missing from the union listing`);
  });

  test('the narrow communications server keeps hiding what the grant lacks', async () => {
    const tools = await list(appWith({ scopes: ['read:comms'] }), COMMS.path);
    const names = tools.map((t) => t.name);
    assert.ok(names.includes('comms_list_lists'));
    assert.ok(!names.includes(name));
    for (const t of tools) assert.doesNotMatch(t.description, /Needs permission/);
  });

  test('the narrow analytics server is untouched', async () => {
    const names = (await list(appWith({ scopes: ['read:analytics'] }), ANALYTICS.path)).map((t) => t.name);
    assert.ok(!names.some((n) => n.startsWith('comms_')));
  });

  test('calling a marked tool returns 403 naming the scope, where to add it and the refresh step', async () => {
    const s = await listen(appWith({ scopes: READ_ONLY }));
    try {
      const r = await rpc(s.base, MAIN.path, 'tools/call', { name, arguments: {} });
      assert.equal(r.status, 403);
      const text = r.body.result.content[0].text;
      assert.equal(r.body.result.isError, true);
      assert.match(text, /send:comms\.campaign/);
      assert.ok(text.includes(PERMISSION_NEEDED_SENTENCE));
      assert.match(r.headers.get('www-authenticate'), /insufficient_scope/);
    } finally { s.close(); }
  });

  test('an existing main grant without comms scopes gains no comms authority', async () => {
    const s = await listen(appWith({ scopes: ['send:transactional', 'read:analytics', 'manage:domains', 'manage:sandbox'] }));
    try {
      const r = await rpc(s.base, MAIN.path, 'tools/call', { name: 'comms_list_lists', arguments: {} });
      assert.equal(r.status, 403);
    } finally { s.close(); }
  });
});

describe('after a permission changes: silent refresh through the front door', () => {
  test('tools/list answers 401 invalid_token when the grant holds more than the token', async () => {
    const s = await listen(appWith({ scopes: READ_ONLY, grantScopesLookup: async () => [...READ_ONLY, 'send:comms.campaign'] }));
    try {
      const r = await rpc(s.base, MAIN.path, 'tools/list');
      assert.equal(r.status, 401);
      assert.match(r.headers.get('www-authenticate'), /error="invalid_token"/);
    } finally { s.close(); }
  });
  test('a call the grant now covers answers 401 invalid_token, not 403', async () => {
    const s = await listen(appWith({ scopes: READ_ONLY, grantScopesLookup: async () => [...READ_ONLY, 'send:comms.campaign'] }));
    try {
      const r = await rpc(s.base, MAIN.path, 'tools/call', { name: 'comms_schedule_campaign', arguments: {} });
      assert.equal(r.status, 401);
      assert.match(r.headers.get('www-authenticate'), /invalid_token/);
    } finally { s.close(); }
  });
  test('the native handshake does not claim it can push tools/list_changed (stateless transport); the 401 refresh is the mechanism', async () => {
    const s = await listen(appWith({ scopes: READ_ONLY }));
    try {
      const d = await rpc(s.base, MAIN.path, 'server/discover', {}, { native: true });
      assert.notEqual(d.body?.result?.capabilities?.tools?.listChanged, true);
    } finally { s.close(); }
  });
});

describe('every tool carries a title and a read-only or destructive hint (directory requirement)', () => {
  test('each registry tool has a non-empty title and a boolean readOnlyHint and destructiveHint', () => {
    const bad = [];
    for (const t of TOOLS) {
      const a = t.annotations || {};
      if (typeof a.title !== 'string' || !a.title.trim()) bad.push(`${t.name}: title`);
      if (typeof a.readOnlyHint !== 'boolean') bad.push(`${t.name}: readOnlyHint`);
      if (typeof a.destructiveHint !== 'boolean') bad.push(`${t.name}: destructiveHint`);
      if (a.readOnlyHint === true && a.destructiveHint === true) bad.push(`${t.name}: both read-only and destructive`);
    }
    assert.deepEqual(bad, []);
  });
  test('every tool the front door lists exists in the registry (so none can escape the check above)', () => {
    const reg = new Set(TOOLS.map((t) => t.name));
    for (const t of MAIN.tools.filter((n) => !PROMPT_TOOLS.includes(n))) assert.ok(reg.has(t), t);
  });
  test('the hints reach the wire on both transports, for marked tools too', async () => {
    const s = await listen(appWith({ scopes: READ_ONLY }));
    try {
      for (const native of [false, true]) {
        const tools = (await rpc(s.base, MAIN.path, 'tools/list', {}, { native })).body.result.tools;
        for (const t of tools) {
          assert.ok(t.annotations && t.annotations.title, `${t.name} title (${native ? 'native' : 'legacy'})`);
          assert.equal(typeof t.annotations.readOnlyHint, 'boolean', t.name);
        }
      }
    } finally { s.close(); }
  });
});

describe('default workspace: say which one is in use', () => {
  const W1 = '11111111-1111-4111-8111-111111111111';
  const W2 = '22222222-2222-4222-8222-222222222222';
  function clientFor(workspaces, seen = []) {
    const fetchImpl = async (url, init) => {
      seen.push({ url: String(url), tenant: init.headers['X-Tenant-Id'] });
      if (String(url).endsWith('/workspaces')) return new Response(JSON.stringify({ success: true, data: workspaces }), { status: 200 });
      return new Response(JSON.stringify({ success: true, data: { ok: true } }), { status: 200 });
    };
    return createDelegatedClient({
      claims: { userId: 'u1', grantId: 'g1', scopes: ['read:comms'], motorBlockIds: [] }, server: MAIN, signer, apiBaseUrl: 'http://api.test', commsBaseUrl: 'http://comms.test/api', fetchImpl,
    });
  }
  const ws = (id, name, extra = {}) => ({ id, name, status: 'active', ...extra });

  test('an explicit workspace wins and is reported', async () => {
    const seen = [];
    const out = await clientFor([ws(W1, 'Shop'), ws(W2, 'Blog')], seen).commsGetReadiness({ workspaceId: W2 });
    assert.equal(seen.at(-1).tenant, W2);
    assert.match(out.workingIn, /Working in: .*22222222/);
  });
  test('the grant\'s single workspace is used and named', async () => {
    const out = await clientFor([ws(W1, 'Shop')]).commsGetReadiness({});
    assert.match(out.workingIn, /^Working in: Shop/);
  });
  test('several workspaces and no default: the actionable error lists the choices', async () => {
    await assert.rejects(clientFor([ws(W1, 'Shop'), ws(W2, 'Blog')]).commsGetReadiness({}), (e) => e.data.code === 'WORKSPACE_REQUIRED'
      && e.data.workspaces.length === 2 && /Shop/.test(e.message) && /Blog/.test(e.message));
  });
});
