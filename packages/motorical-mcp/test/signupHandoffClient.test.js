import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotoricalClient } from '../src/client.js';

test('signupHandoff with no continuationToken mints via POST /api/auth/signup-handoff, no auth header', async () => {
  const client = new MotoricalClient({ apiBaseUrl: 'https://api.motorical.com' });
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, code: 'c1', url: 'https://motorical.com/get-started?handoff=c1', expiresInSeconds: 1800 }) };
  };
  const result = await client.signupHandoff({
    clientId: 'https://agent.example/client-metadata.json',
    redirectUri: 'https://agent.example/callback',
    resource: 'https://mcp.motorical.com/v1/motorical/mcp',
    codeChallenge: 'x'.repeat(43),
    codeChallengeMethod: 'S256',
  });
  assert.equal(result.status, 'awaiting_browser');
  assert.equal(result.continuationToken, 'c1');
  assert.equal(result.url, 'https://motorical.com/get-started?handoff=c1');
  assert.equal(calls[0].opts.headers.Authorization, undefined);
  assert.match(calls[0].url, /\/api\/auth\/signup-handoff$/);
});

test('signupHandoff with a continuationToken polls status', async () => {
  const client = new MotoricalClient({ apiBaseUrl: 'https://api.motorical.com' });
  global.fetch = async (url) => {
    assert.match(url, /\/api\/auth\/signup-handoff\/status$/);
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, status: 'ready' }) };
  };
  const result = await client.signupHandoff({ continuationToken: 'c1' });
  assert.equal(result.status, 'ready');
});

// Backend final-review I1: an unknown/expired code now answers HTTP 404 instead
// of a 200 whose body said `status: 'not_found'`. The old shape fell through
// this method's `result.status === 'ready'` check and was reported to the agent
// as `awaiting_browser` with an undefined url — indistinguishable from "the
// human just hasn't finished yet", forever.
test('signupHandoff surfaces an expired/unknown continuationToken as a 404 error, not awaiting_browser', async () => {
  const client = new MotoricalClient({ apiBaseUrl: 'https://api.motorical.com' });
  global.fetch = async () => ({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    text: async () => JSON.stringify({ success: false, status: 'not_found', error: 'Handoff code not found or expired' }),
  });
  await assert.rejects(
    () => client.signupHandoff({ continuationToken: 'gone' }),
    (err) => {
      assert.equal(err.status, 404);
      assert.equal(err.data.status, 'not_found');
      assert.match(err.message, /expired/);
      return true;
    }
  );
});
