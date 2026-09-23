// packages/motorical-mcp/test/http.test.js
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { createHttpApp } from '../src/http.js';
import { SERVERS } from '../src/servers.js';
import { createDelegatedClient } from '../src/delegatedClient.js';
// The multi-block-grant test below drives a real (non-dryRun-shaped) send
// through the actual motorical_send_email handler, which creates an outcome
// task. That handler reaches the store through registry.js's module-scope
// namespace import, which no test argument can reach -- so this PRE-EXISTING
// test was broken by P2 into an ENOENT failure on every machine without
// ovh24's /etc/motorical/redis-password-fallback. __testOnly_setDefaultStore
// points that resolution at an in-memory fake: the handler still runs for
// real, no Redis connection is attempted, and there is no ioredis handle left
// open to hang `node --test test/*.test.js`.
import {
  __testOnly_withClient,
  __testOnly_setDefaultStore,
  closeTaskStore,
} from '../src/native/taskStore.js';

class FakeRedis {
  constructor() { this.store = new Map(); this.sets = new Map(); }
  async set(key, value) { this.store.set(key, value); return 'OK'; }
  async get(key) { return this.store.get(key) ?? null; }
  async sadd(key, member) { if (!this.sets.has(key)) this.sets.set(key, new Set()); this.sets.get(key).add(member); }
  async smembers(key) { return [...(this.sets.get(key) ?? [])]; }
  async srem(key, member) { this.sets.get(key)?.delete(member); }
  async expire() { return 1; }
  async quit() { return 'OK'; }
}

__testOnly_setDefaultStore(__testOnly_withClient(new FakeRedis()));

after(async () => {
  __testOnly_setDefaultStore(null);
  await closeTaskStore();
});

function listen(app) {
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve({
      base: `http://127.0.0.1:${srv.address().port}`,
      close: () => srv.close(),
    }));
  });
}

const stubVerifier = {
  verify: async (token, uri) => {
    if (token === 'good') return { userId: 'u1', grantId: 'g1', clientId: 'c',
      scopes: ['send:transactional', 'read:analytics', 'manage:domains', 'manage:sandbox'],
      motorBlockIds: ['mb-1'] };
    const e = new Error('bad'); e.status = 401; e.challenge = `Bearer resource_metadata="x"`;
    throw e;
  },
};

const app = () => createHttpApp({
  verifier: stubVerifier,
  signer: { key: 'unused-in-this-test', kid: 'k1' },
  clientFactory: () => ({}),
});

test('every server publishes RFC 9728 metadata at the path-inserted well-known URI', async () => {
  const s = await listen(app());
  for (const srv of SERVERS) {
    const url = `${s.base}/.well-known/oauth-protected-resource${srv.path}`;
    const res = await fetch(url);
    assert.equal(res.status, 200, `${srv.key} metadata missing`);
    const doc = await res.json();
    assert.equal(doc.resource, srv.canonicalUri);
    assert.deepEqual(doc.authorization_servers, ['https://motorical.com']);
    assert.deepEqual(doc.scopes_supported, srv.scopes);
    assert.ok(!doc.scopes_supported.includes('logs.pii'));
  }
  s.close();
});

test('an unauthenticated MCP request gets 401 with a resource_metadata challenge', async () => {
  const s = await listen(app());
  const res = await fetch(`${s.base}/v1/motorical_transactional/mcp`, { method: 'POST' });
  assert.equal(res.status, 401);
  assert.match(res.headers.get('www-authenticate') || '', /resource_metadata=/);
  s.close();
});

test('an unknown path is 404, never a silently permissive default', async () => {
  const s = await listen(app());
  const res = await fetch(`${s.base}/v1/not_a_server/mcp`, { method: 'POST' });
  assert.equal(res.status, 404);
  s.close();
});

test('a trailing slash does not resolve to a server', async () => {
  const s = await listen(app());
  const res = await fetch(`${s.base}/v1/motorical_transactional/mcp/`, { method: 'POST' });
  assert.equal(res.status, 404);
  s.close();
});

test('healthz needs no auth, so the fleet check does not need a token', async () => {
  const s = await listen(app());
  const res = await fetch(`${s.base}/healthz`);
  assert.equal(res.status, 200);
  s.close();
});

test('the inbound token is never echoed back to the caller', async () => {
  const s = await listen(app());
  const res = await fetch(`${s.base}/v1/motorical_transactional/mcp`, {
    method: 'POST', headers: { Authorization: 'Bearer SECRET-TOKEN' },
  });
  const body = await res.text();
  assert.ok(!body.includes('SECRET-TOKEN'));
  s.close();
});

test('an unauthenticated request with a large body is rejected before the body is parsed', async () => {
  const s = await listen(app());
  // Bigger than even the OLD app-wide 4mb limit that used to run before auth.
  // If a body parser still ran ahead of auth, a body this size would trip a
  // PayloadTooLarge error (413) instead of ever reaching the 401 auth check —
  // this is the signal that distinguishes "parsed then rejected" from
  // "never parsed, auth ran first". Against the pre-fix app.use() setup this
  // came back 413, not 401.
  const bigBody = JSON.stringify({ data: 'x'.repeat(5 * 1024 * 1024) });
  const res = await fetch(`${s.base}/v1/motorical_transactional/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bigBody,
  });
  assert.equal(res.status, 401);
  const body = await res.text();
  assert.ok(!/entity too large/i.test(body));
  assert.ok(!/PayloadTooLargeError/i.test(body));
  s.close();
});

// Shared by the dual-revision front-door tests below. The legacy SDK
// transport frames its response as SSE ("data: {...}"), same as toolsList()
// above; the native path answers with a plain JSON body via res.json(). Both
// are handled here so callers don't need to know which path a given request
// takes.
async function postMcpRaw(path, body, { token } = {}) {
  const s = await listen(app());
  try {
    const res = await fetch(`${s.base}${path}`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
    });
    const headers = {};
    for (const [k, v] of res.headers.entries()) headers[k] = v;
    const text = await res.text();
    let parsedBody = null;
    if (text) {
      const line = text.split('\n').find((l) => l.startsWith('data: '));
      parsedBody = line ? JSON.parse(line.slice('data: '.length)) : JSON.parse(text);
    }
    return { status: res.status, headers, body: parsedBody };
  } finally {
    s.close();
  }
}

function postMcp(path, body) {
  return postMcpRaw(path, body, { token: 'good' });
}

function postMcpNoAuth(path, body) {
  return postMcpRaw(path, body, {});
}

async function toolsList(base, path, token) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  const body = line ? JSON.parse(line.slice('data: '.length)) : null;
  return { status: res.status, names: (body?.result?.tools || []).map((t) => t.name) };
}

test('the analytics server does not advertise a tool it cannot call', async () => {
  const s = await listen(app());
  try {
    const { status, names } = await toolsList(s.base, '/v1/motorical_analytics/mcp', 'good');
    assert.equal(status, 200);
    assert.ok(!names.includes('motorical_send_email'), `analytics server advertised: ${names.join(', ')}`);
    assert.ok(names.includes('motorical_list_motor_blocks'));
  } finally {
    s.close();
  }
});

test('the main (unscoped) server still advertises the full catalogue', async () => {
  const s = await listen(app());
  try {
    const { names } = await toolsList(s.base, '/v1/motorical/mcp', 'good');
    assert.ok(names.includes('motorical_send_email'));
    assert.ok(names.includes('motorical_domain_list'));
  } finally {
    s.close();
  }
});

// Found live 2026-09-02: motorical_send_email's inputSchema never declared
// motorBlockId, so the MCP SDK stripped it from tool-call arguments before
// they reached the handler — every multi-block grant got an unconditional
// "motorBlockId is required" no matter what the caller passed. This exercises
// the real schema (not a stub), the real delegated client, and a real
// upstream call, so a regression here means the schema gap is back.
//
// The delegated view never carries a real OAuth session on the underlying
// MotoricalClient (see delegatedClient.js's PLACEHOLDER_CREDENTIAL comment),
// so sendEmail's own oauthToken branch never fires and the block never
// reaches the query string — the block selection that matters is the one
// baked into the signed Delegation JWT, which is what this test decodes.
test('motorical_send_email accepts an explicit motorBlockId for a multi-block grant', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwt = (await import('jsonwebtoken')).default;
  const signer = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'k1' };

  let upstreamAuth;
  const upstreamApp = express();
  // Shaped like a real /v1/send response (`success` is the one field
  // motorical_send_email's outputSchema requires) -- a bare `{ ok: true }`
  // stub used to pass here only because nothing validated structuredContent.
  upstreamApp.post('/v1/send', (req, res) => {
    upstreamAuth = req.headers.authorization;
    res.json({ success: true, data: { id: 'stub-id', acceptanceStatus: 'validated' }, message: 'validated' });
  });
  const upstream = await listen(upstreamApp);

  const multiBlockVerifier = {
    verify: async () => ({
      userId: 'u1', grantId: 'g1', clientId: 'c',
      scopes: ['send:transactional', 'read:analytics'],
      motorBlockIds: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
    }),
  };

  const s = await listen(createHttpApp({
    verifier: multiBlockVerifier,
    signer,
    clientFactory: ({ claims, server }) =>
      createDelegatedClient({ claims, server, signer, apiBaseUrl: upstream.base }),
  }));

  try {
    const res = await fetch(`${s.base}/v1/motorical_transactional/mcp`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer good',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: {
          name: 'motorical_send_email',
          arguments: {
            from: 'a@b.com', to: 'c@d.com', subject: 's', text: 't', dryRun: true,
            motorBlockId: '22222222-2222-2222-2222-222222222222',
          },
        },
      }),
    });
    const text = await res.text();
    const line = text.split('\n').find((l) => l.startsWith('data: '));
    const body = line ? JSON.parse(line.slice('data: '.length)) : null;
    assert.equal(res.status, 200);
    assert.ok(!body?.result?.isError, `tool call errored: ${JSON.stringify(body?.result)}`);
    assert.ok(upstreamAuth?.startsWith('Delegation '), 'upstream never received a Delegation header');
    const decoded = jwt.verify(upstreamAuth.slice('Delegation '.length), publicKey, {
      algorithms: ['RS256'], audience: 'https://api.motorical.com/internal/mcp',
    });
    assert.equal(decoded.motorBlockId, '22222222-2222-2222-2222-222222222222');
  } finally {
    s.close();
    upstream.close();
  }
});

test('a handler failure returns 500 with a generic body, never the raw error', async () => {
  const throwingApp = createHttpApp({
    verifier: stubVerifier,
    signer: { key: 'unused-in-this-test', kid: 'k1' },
    clientFactory: () => { throw new Error('boom: leaking secret detail'); },
  });
  const s = await listen(throwingApp);
  // The catch swallowed the error with no log line at all, so a 500 on ovh24
  // was undiagnosable -- and finding 2 (header validation) had added new 500
  // sources. The generic BODY is the security requirement; silence is not.
  const logged = [];
  const realError = console.error;
  console.error = (...a) => logged.push(a);
  let res;
  try {
    res = await fetch(`${s.base}/v1/motorical_transactional/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer good', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  } finally {
    console.error = realError;
  }
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.deepEqual(body, { error: 'server_error' });
  assert.ok(!JSON.stringify(body).includes('boom'));
  assert.equal(logged.length, 1, 'the swallowed error must reach journald');
  assert.match(String(logged[0][0]), /\/v1\/motorical_transactional\/mcp/);
  assert.match(String(logged[0][1]?.message ?? logged[0][1]), /boom/,
    'the log line must carry the real error, even though the response body does not');
  s.close();
});

// The front door must not regress a single existing client. These assert the
// fork itself, not the dispatchers (which have their own tests).
describe('dual-revision front door', () => {
  test('an initialize request still reaches the SDK transport', async () => {
    // Legacy clients send initialize first; if this ever routes native, every
    // @motorical/mcp install in the field breaks.
    const res = await postMcp('/v1/motorical_analytics/mcp', {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } },
    });
    assert.equal(res.status, 200);
  });

  test('server/discover is answered natively with the required fields', async () => {
    const res = await postMcp('/v1/motorical_analytics/mcp', {
      jsonrpc: '2.0', id: 2, method: 'server/discover',
      params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.result.supportedVersions, ['2026-07-28']);
    assert.equal(res.body.result.cacheScope, 'public');
  });

  test('the native path echoes Mcp-Method and Mcp-Name for gateway routing', async () => {
    const res = await postMcp('/v1/motorical_analytics/mcp', {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'motorical_get_metrics', arguments: {},
                _meta: { 'io.modelcontextprotocol/clientCapabilities': {} } },
    });
    assert.equal(res.headers['mcp-method'], 'tools/call');
    assert.equal(res.headers['mcp-name'], 'motorical_get_metrics');
  });

  test('an unauthenticated native request is refused before any dispatch', async () => {
    // Auth precedes body parsing by design; the fork must not move that.
    const res = await postMcpNoAuth('/v1/motorical_analytics/mcp', {
      jsonrpc: '2.0', id: 4, method: 'server/discover',
    });
    assert.equal(res.status, 401);
  });
});

// Regression guard for a defect the dual-revision front door introduced: the
// Mcp-Method / Mcp-Name emission sits BEFORE the legacy/native fork, so it runs
// on every authenticated request including legacy ones. res.setHeader rejects
// non-latin1 characters and CR/LF outright, and the throw lands in the outer
// catch -- turning a clean JSON-RPC -32602 into an HTTP 500. An over-long name
// is worse: Node emits it, but it exceeds Nginx's default proxy_buffer_size
// (4k/8k) on ovh24, so the caller sees "upstream sent too big header" -> 502 in
// production only, invisible to any local test. Measured against base 82b51f6,
// all three cases returned 200 + -32602; on the unfixed branch they returned
// 500 / 500 / UND_ERR_HEADERS_OVERFLOW. Auth runs first, so this is a
// robustness regression, not an unauthenticated DoS.
describe('routing-header emission never breaks the response', () => {
  // A legacy request (no clientCapabilities _meta) -- proving the emission runs
  // ahead of the fork and so regresses clients that predate this branch.
  const legacyCall = (name) => ({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: {} } });

  async function assertCleanRefusal(label, name) {
    const res = await postMcp('/v1/motorical_analytics/mcp', legacyCall(name));
    assert.equal(res.status, 200, `${label}: expected a JSON-RPC refusal, got HTTP ${res.status}`);
    assert.equal(res.headers['mcp-name'], undefined, `${label}: unsafe name must not be emitted as a header`);
    assert.equal(res.headers['mcp-method'], 'tools/call', `${label}: the safe method header must still be emitted`);
    assert.ok(res.body?.error || res.body?.result?.isError, `${label}: expected an error result, got ${JSON.stringify(res.body)}`);
  }

  test('a non-latin1 tool name is refused as JSON-RPC, not as an HTTP 500', async () => {
    await assertCleanRefusal('non-latin1', 'tool_🙂');
  });

  test('a tool name containing CRLF cannot inject a header or crash the response', async () => {
    await assertCleanRefusal('crlf', 'bad\r\nX-Injected: 1');
  });

  test('an over-long tool name does not produce an unreadable oversized header', async () => {
    // 20 000 chars: readable here, a 502 behind Nginx's default proxy_buffer_size.
    await assertCleanRefusal('over-long', 'a'.repeat(20000));
  });

  test('a non-string tool name sets no header and still returns a normal error', async () => {
    const res = await postMcp('/v1/motorical_analytics/mcp', legacyCall({ evil: true }));
    assert.equal(res.status, 200);
    // Previously String({}) emitted the literal header value "[object Object]".
    assert.equal(res.headers['mcp-name'], undefined);
  });

  test('a well-formed legacy call still gets both routing headers', async () => {
    // The validator must not over-reject: the gateway routing this exists for
    // has to keep working on the legacy path too.
    const res = await postMcp('/v1/motorical_analytics/mcp', legacyCall('motorical_get_metrics'));
    assert.equal(res.headers['mcp-method'], 'tools/call');
    assert.equal(res.headers['mcp-name'], 'motorical_get_metrics');
  });
});

test('a native JSON-RPC notification gets 202 with no body, never an error object', async () => {
  const res = await postMcp('/v1/motorical_analytics/mcp', {
    jsonrpc: '2.0', method: 'no/such/method',
    params: { _meta: { 'io.modelcontextprotocol/clientCapabilities': {} } },
  });
  assert.equal(res.status, 202);
  assert.equal(res.body, null, 'a notification must get no response body at all');
});
