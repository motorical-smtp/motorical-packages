// packages/motorical-mcp/test/signupRateLimit.test.js
//
// Security follow-up to MCP P5: the `signup` server's route bypasses bearer
// auth entirely (servers.js's `public: true`), so it is the one MCP route an
// unauthenticated flood can hit for free. These tests prove the new
// http.js + signupRateLimit.js middleware actually caps it, without
// affecting any other server's route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpApp } from '../src/http.js';
import { createSignupRateLimiter } from '../src/signupRateLimit.js';

function makeApp() {
  return createHttpApp({
    // The signup route never calls verifier.verify (authenticateMcp's own
    // `srv.public` branch skips it) -- a call here would mean this test is
    // accidentally exercising the wrong path.
    verifier: { verify: async () => { throw new Error('verify() must never be called for a public server'); } },
    signer: {},
    clientFactory: ({ claims }) => ({
      signupHandoff: async () => ({ status: 'awaiting_browser', url: 'https://motorical.com/get-started?handoff=x' }),
    }),
  });
}

function signupToolCall(id) {
  return {
    jsonrpc: '2.0', id, method: 'tools/call',
    params: {
      name: 'motorical_signup_handoff',
      arguments: {},
      _meta: { 'io.modelcontextprotocol/clientCapabilities': {} },
    },
  };
}

test('requests under the threshold reach the real dispatch path end-to-end', async () => {
  const { default: request } = await import('supertest');
  const app = makeApp();

  for (let i = 0; i < 10; i += 1) {
    const res = await request(app).post('/v1/signup/mcp').send(signupToolCall(i));
    assert.equal(res.status, 200, `request ${i + 1}/10 should succeed, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(!res.body?.result?.isError, `request ${i + 1}/10 dispatched but the tool call itself errored`);
    assert.equal(res.body?.result?.structuredContent?.status, 'awaiting_browser');
  }
});

test('the 11th request in the window gets a 429, not a dispatch attempt', async () => {
  const { default: request } = await import('supertest');
  const app = makeApp();

  // Exhaust the default budget (10 / 15min -- matches the backend's own
  // signupHandoffMintRateLimit). All fired well inside the 15-minute window,
  // so this does not depend on wall-clock time passing.
  for (let i = 0; i < 10; i += 1) {
    const res = await request(app).post('/v1/signup/mcp').send(signupToolCall(i));
    assert.equal(res.status, 200, `warm-up request ${i + 1} unexpectedly failed`);
  }

  const blocked = await request(app).post('/v1/signup/mcp').send(signupToolCall(10));
  assert.equal(blocked.status, 429);
  assert.deepEqual(blocked.body, { error: 'rate_limited' });
  assert.ok(blocked.headers['retry-after'], 'a 429 must tell the caller when to retry');

  // And it keeps blocking, not just the one boundary request.
  const stillBlocked = await request(app).post('/v1/signup/mcp').send(signupToolCall(11));
  assert.equal(stillBlocked.status, 429);
});

// The previous version of this test sent UNAUTHENTICATED requests to
// non-public servers and asserted 401-not-429. That proves nothing about
// `publicServerRateLimit`'s own `srv.public` gate: authenticateMcp's bearer
// check throws and answers 401 BEFORE publicServerRateLimit ever runs for a
// non-public server, so that test would pass identically even if the
// `srv.public` check were deleted and the limiter applied unconditionally --
// the requests never reached the code under test. This version uses a
// verifier that SUCCEEDS for a non-public server, so the request actually
// clears authenticateMcp and reaches publicServerRateLimit for real, then
// floods well past the signup limiter's own threshold (10) and asserts
// neither a 429 nor any RateLimit-* header ever appears -- proving the gate
// on `srv.public` is genuinely exercised, not just present in the source.
test('the rate limit is scoped to the public server only -- a non-public server that actually reaches the middleware is never gated by it', async () => {
  const { default: request } = await import('supertest');
  const app = createHttpApp({
    // Deliberately succeeds regardless of token/URI -- the point of this test
    // is what happens AFTER auth passes, not the auth check itself.
    verifier: { verify: async () => ({ userId: 'u1', grantId: 'g1', clientId: 'c', scopes: [], motorBlockIds: [] }) },
    signer: {},
    clientFactory: () => ({}),
  });

  // One more than the signup limiter's own threshold, on a route that DOES
  // reach publicServerRateLimit (thanks to the always-succeeding verifier
  // above) -- if this route were somehow gated by the same limiter, request
  // 11 would 429.
  for (let i = 0; i < 11; i += 1) {
    const res = await request(app)
      .post('/v1/motorical/mcp')
      .set('Authorization', 'Bearer good')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: i, method: 'tools/list', params: {} });
    assert.notEqual(res.status, 429, `iteration ${i}: an authenticated non-public request must never be rate-limited`);
    assert.equal(
      res.headers['ratelimit-limit'],
      undefined,
      `iteration ${i}: a RateLimit-* header means the signup limiter ran on a non-public route`,
    );
  }
});

test('the rate limit is scoped to the public server only -- flooding it leaves an unrelated non-public server\'s own 401 path untouched', async () => {
  const { default: request } = await import('supertest');
  const app = makeApp();

  // Blow well past the signup server's threshold (10) on its own route.
  for (let i = 0; i < 15; i += 1) {
    await request(app).post('/v1/signup/mcp').send(signupToolCall(i));
  }

  // A non-public server, same app instance, unauthenticated -- still just the
  // ordinary 401 from authenticateMcp, never a 429. (This does not by itself
  // prove the srv.public gate works -- see the test above for that -- but it
  // does confirm flooding the public route has no observable side effect on
  // an unrelated route's ordinary refusal path.)
  const res = await request(app)
    .post('/v1/motorical/mcp')
    .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(res.status, 401, `expected the normal 401, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.notEqual(res.status, 429);
});

test('a fresh app instance starts with a fresh budget (no cross-test/process leakage)', async () => {
  const { default: request } = await import('supertest');
  const exhausted = makeApp();
  for (let i = 0; i < 11; i += 1) {
    await request(exhausted).post('/v1/signup/mcp').send(signupToolCall(i));
  }
  const blocked = await request(exhausted).post('/v1/signup/mcp').send(signupToolCall(99));
  assert.equal(blocked.status, 429);

  const fresh = makeApp();
  const res = await request(fresh).post('/v1/signup/mcp').send(signupToolCall(0));
  assert.equal(res.status, 200, 'a new createHttpApp() instance must not inherit another instance\'s counters');
});

// Critical fix verification: mcp.motorical.com is fronted by Cloudflare, so
// `X-Real-IP` at the Nginx origin carries Cloudflare's own edge IP, not the
// real client's -- bucketing on it would key the limiter by Cloudflare PoP,
// not by caller, reintroducing the exact shared-bucket failure this limiter
// exists to prevent. `Cf-Connecting-Ip` must win when both headers are
// present, matching the convention already established in
// backend/src/middleware/accountApiKeyAuth.js and apiKeyAuth.js.
test('Cf-Connecting-Ip wins over X-Real-IP when both are present', async () => {
  const { default: request } = await import('supertest');
  const app = makeApp();

  // Two distinct real clients (different Cf-Connecting-Ip) that happen to
  // share the same Cloudflare edge IP (same X-Real-IP, as they would in
  // production). If the limiter incorrectly keyed on X-Real-IP, these two
  // callers would share one 10-request budget between them; keying correctly
  // on Cf-Connecting-Ip means each gets its own full budget.
  for (let i = 0; i < 10; i += 1) {
    const res = await request(app)
      .post('/v1/signup/mcp')
      .set('Cf-Connecting-Ip', '203.0.113.10')
      .set('X-Real-IP', '198.51.100.1') // shared Cloudflare edge IP
      .send(signupToolCall(i));
    assert.equal(res.status, 200, `client A request ${i + 1}/10 unexpectedly failed`);
  }
  // Client A is now at its own limit.
  const aBlocked = await request(app)
    .post('/v1/signup/mcp')
    .set('Cf-Connecting-Ip', '203.0.113.10')
    .set('X-Real-IP', '198.51.100.1')
    .send(signupToolCall(10));
  assert.equal(aBlocked.status, 429, 'client A should be exhausted after 10 requests');

  // Client B, different Cf-Connecting-Ip, SAME X-Real-IP (same Cloudflare
  // edge) -- must still get its own fresh budget. If the code wrongly used
  // X-Real-IP as the bucket key, this request would already be blocked.
  const bFirst = await request(app)
    .post('/v1/signup/mcp')
    .set('Cf-Connecting-Ip', '203.0.113.20')
    .set('X-Real-IP', '198.51.100.1')
    .send(signupToolCall(0));
  assert.equal(bFirst.status, 200, 'client B must have its own budget, keyed on Cf-Connecting-Ip, not the shared X-Real-IP');
});

// Important #1 fix verification: prune() must actually bound the Map's size,
// not merely delete already-expired entries (which does nothing when every
// tracked IP is still inside its own active window, so the map would grow
// unboundedly while every request past the cap pays an O(n) sweep that
// evicts nothing). Uses a tiny `maxTrackedIps` so the test doesn't need
// 20,000 distinct IPs, and reads the Map's real size via the
// `__testOnly_trackedCount` hook rather than inferring it indirectly.
test('the tracked-IP map stays genuinely bounded past its cap', () => {
  const CAP = 5;
  const limiter = createSignupRateLimiter({ maxTrackedIps: CAP });

  // A minimal fake req/res harness -- this test targets the limiter directly
  // (not through the full HTTP stack) so it can drive many distinct IPs
  // cheaply.
  function fakeReqRes(ip) {
    const req = { headers: { 'x-real-ip': ip }, socket: { remoteAddress: ip } };
    const res = {
      set() { return res; },
      status(code) { res.statusCode = code; return res; },
      json(body) { res.body = body; return res; },
    };
    return { req, res };
  }

  // Push 10x the cap through as distinct IPs, one request each -- all well
  // within the 15-minute window, so nothing is naturally expired. Before the
  // fix, prune() only deleted expired entries, so this would leave the map at
  // size 50 (10x the cap) with zero eviction, and grow further with every
  // additional distinct IP. After the fix, the map must never exceed the cap
  // by more than the single newest insertion still pending its own
  // over-the-cap prune trigger.
  for (let i = 0; i < CAP * 10; i += 1) {
    const { req, res } = fakeReqRes(`10.0.0.${i}`);
    let nextCalled = false;
    limiter(req, res, () => { nextCalled = true; });
    assert.ok(nextCalled, `request for IP #${i} should have passed through (well under its own per-IP limit)`);
    assert.ok(
      limiter.__testOnly_trackedCount() <= CAP + 1,
      `after IP #${i}, tracked count ${limiter.__testOnly_trackedCount()} must stay near the cap (${CAP}), not grow unbounded`,
    );
  }

  // Directly assert the final bound: nowhere near the 50 distinct IPs pushed.
  assert.ok(
    limiter.__testOnly_trackedCount() <= CAP + 1,
    `final tracked count ${limiter.__testOnly_trackedCount()} must be bounded near the cap (${CAP}), not the ${CAP * 10} distinct IPs seen`,
  );

  // The evicted-then-reused IP must be treated as a brand-new caller (fresh
  // window), not silently blocked or otherwise corrupted by the eviction.
  const { req: earlyReq, res: earlyRes } = fakeReqRes('10.0.0.0');
  let earlyNextCalled = false;
  limiter(earlyReq, earlyRes, () => { earlyNextCalled = true; });
  assert.ok(earlyNextCalled, 'an evicted-then-reused IP must be treated as a fresh caller, not blocked');
  assert.equal(earlyRes.body, undefined, 'a fresh window for a reused IP must never itself be a 429');
});
