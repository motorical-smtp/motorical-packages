'use strict';
// Every operation, called through the SDK against a local server: method, path, query, body and auth are checked.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { Motorical, MotoricalError, OPERATIONS } = require('../src');

const CREDS = { apiKey: 'mk_live_K', accountKey: 'ak_live_A', bearerToken: 'BEARER', dashboardToken: 'DASH' };
const EXPECT_AUTH = { apiKey: 'ApiKey mk_live_K', accountKey: 'ApiKey ak_live_A', bearerToken: 'Bearer BEARER', dashboardToken: 'Bearer DASH' };

function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('all operations build the right request', async () => {
  const seen = [];
  const { server, url } = await serve((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => { seen.push({ method: req.method, url: req.url, headers: req.headers, body: b }); res.setHeader('Content-Type', 'application/json'); res.end('{"success":true}'); });
  });
  try {
    const m = new Motorical({ ...CREDS, baseUrl: url, commsBaseUrl: url, workspaceId: 'ws_1' });
    for (const op of OPERATIONS) {
      const args = {};
      for (const p of op.pathParams) args[p] = `v_${p}`;
      for (const q of op.query) if (q.required) args[q.name] = `q_${q.name}`;
      for (const h of op.headers) if (h.required) args[h.name] = `h_${h.name}`;
      if (op.body) args.body = { probe: op.id };
      const out = await m[op.id](args);
      assert.deepEqual(out, { success: true }, op.id);
      const r = seen[seen.length - 1];
      assert.equal(r.method, op.method, op.id);
      let path = op.path; for (const p of op.pathParams) path = path.replace(`{${p}}`, `v_${p}`);
      assert.equal(r.url.split('?')[0], path, op.id);
      for (const q of op.query) if (q.required) assert.match(r.url, new RegExp(`[?&]${q.name}=q_${q.name}`), op.id);
      if (op.body) assert.deepEqual(JSON.parse(r.body), { probe: op.id }, op.id);
      const first = op.auth.find((k) => k !== 'workspace');
      if (first) assert.equal(r.headers.authorization, EXPECT_AUTH[first], `${op.id} auth`);
      if (op.auth.includes('workspace')) {
        assert.equal(r.headers['x-tenant-id'], 'ws_1', op.id);
        assert.equal(r.headers.authorization, EXPECT_AUTH.accountKey, `${op.id} comms auth`);
      }
      if (!op.auth.length) assert.equal(r.headers.authorization, undefined, `${op.id} sends no credential`);
    }
    assert.equal(seen.length, OPERATIONS.length);
  } finally { server.close(); }
});

test('an API error becomes MotoricalError with code and requestId', async () => {
  const { server, url } = await serve((req, res) => {
    res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.setHeader('X-Request-Id', 'req_hdr');
    res.end(JSON.stringify({ success: false, code: 'api_key_required', error: 'API key required for /v1/send', requestId: 'req_body' }));
  });
  try {
    const m = new Motorical({ baseUrl: url });
    await assert.rejects(m.sendEmail({ body: {} }), (e) => e instanceof MotoricalError && e.status === 401 && e.code === 'api_key_required' && e.requestId === 'req_body');
  } finally { server.close(); }
});

test('a missing path parameter is refused before any request', async () => {
  const m = new Motorical({ baseUrl: 'http://127.0.0.1:9' });
  await assert.rejects(m.getOverview({}), /missing path parameter "id"/);
});
