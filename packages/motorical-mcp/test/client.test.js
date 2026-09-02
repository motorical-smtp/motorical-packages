import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotoricalClient } from '../src/client.js';

test('sendEmail defaults to dryRun and blocks unsafe real send', async () => {
  const calls = [];
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: 'mk_live_test_secret',
    akApiKey: '',
    bearerToken: '',
    motorBlockId: '',
    defaultFrom: 'noreply@example.com'
  });

  client.request = async (method, path, opts) => {
    calls.push({ method, path, opts });
    return { success: true, dryRun: true };
  };

  await client.sendEmail({
    to: 'a@example.com',
    subject: 'hi',
    text: 'body'
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/v1/send');
  assert.equal(calls[0].opts.body.dryRun, true);
  assert.equal(calls[0].opts.apiKey, 'mk_live_test_secret');

  await assert.rejects(
    () =>
      client.sendEmail({
        to: 'a@example.com',
        subject: 'hi',
        text: 'body',
        dryRun: false
      }),
    /confirmRealSend/
  );
});

// Found live 2026-09-02: /v1/send validates its body strictly and rejects
// unknown keys (sendSchema has no motorBlockId field — the block always
// travels via the query string, per the comment in sendEmail() itself). But
// motorBlockId wasn't in sendEmail()'s destructuring list, so it fell into
// ...rest and got spread into the body anyway, and every explicit-block send
// got a 422 "motorBlockId is not allowed" from the live backend.
test('sendEmail never puts motorBlockId in the request body', async () => {
  const calls = [];
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: 'mk_live_test_secret',
    akApiKey: '',
    bearerToken: '',
    motorBlockId: '',
    defaultFrom: 'noreply@example.com'
  });

  client.request = async (method, path, opts) => {
    calls.push({ method, path, opts });
    return { success: true, dryRun: true };
  };

  await client.sendEmail({
    to: 'a@example.com',
    subject: 'hi',
    text: 'body',
    motorBlockId: '432734c9-33eb-4d6e-b586-ef4aa3811fa9'
  });

  assert.equal(calls.length, 1);
  assert.ok(!('motorBlockId' in calls[0].opts.body), 'motorBlockId leaked into the request body');
});

// The OAuth path is where motorBlockId actually needs to travel — it belongs
// in the query string, exactly once, not duplicated into the body.
test('sendEmail puts motorBlockId in the query string on the OAuth path, never in the body', async () => {
  const calls = [];
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '',
    akApiKey: '',
    bearerToken: '',
    motorBlockId: '',
    defaultFrom: 'noreply@example.com'
  });
  client.oauthAccessToken = async () => 'fake-oauth-access-token';

  client.request = async (method, path, opts) => {
    calls.push({ method, path, opts });
    return { success: true, dryRun: true };
  };

  await client.sendEmail({
    to: 'a@example.com',
    subject: 'hi',
    text: 'body',
    motorBlockId: '432734c9-33eb-4d6e-b586-ef4aa3811fa9'
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/v1/send?motorBlockId=432734c9-33eb-4d6e-b586-ef4aa3811fa9');
  assert.ok(!('motorBlockId' in calls[0].opts.body), 'motorBlockId leaked into the request body');
});

test('mintPublicToken requires ak key and motorBlockId', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '',
    akApiKey: '',
    bearerToken: '',
    motorBlockId: '',
    defaultFrom: ''
  });
  await assert.rejects(() => client.mintPublicToken({ motorBlockId: '39b3f504-7e41-4b3f-871a-75bc77676267' }), /AK_API_KEY/);
});

test('mintPublicToken reports every missing precondition at once', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '',
    akApiKey: '',
    bearerToken: '',
    dashboardJwt: '',
    motorBlockId: '',
    defaultFrom: ''
  });
  try {
    await client.mintPublicToken({});
    assert.fail('expected mintPublicToken to reject');
  } catch (err) {
    assert.match(err.message, /motorBlockId/);
    assert.match(err.message, /MOTORICAL_AK_API_KEY/);
    assert.match(err.message, /MOTORICAL_JWT/);
  }
});

test('mintPublicToken falls back to the JWT-authenticated mint endpoint when no AK key is configured', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '',
    akApiKey: '',
    bearerToken: '',
    dashboardJwt: 'dashboard-jwt-test',
    motorBlockId: '39b3f504-7e41-4b3f-871a-75bc77676267',
    defaultFrom: ''
  });
  const calls = [];
  client.request = async (method, path, opts) => {
    calls.push({ method, path, opts });
    return { success: true, data: { token: 'bearer-from-jwt' } };
  };
  const result = await client.mintPublicToken({});
  assert.equal(result.data.token, 'bearer-from-jwt');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/public/token');
  assert.equal(calls[0].opts.bearer, 'dashboard-jwt-test');
  assert.equal(calls[0].opts.body.motorBlockId, '39b3f504-7e41-4b3f-871a-75bc77676267');
});

test('mintPublicToken prefers the AK key over a JWT when both are configured', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '',
    akApiKey: 'ak_live_test',
    bearerToken: '',
    dashboardJwt: 'dashboard-jwt-test',
    motorBlockId: '39b3f504-7e41-4b3f-871a-75bc77676267',
    defaultFrom: ''
  });
  const calls = [];
  client.request = async (method, path, opts) => {
    calls.push({ method, path, opts });
    return { success: true, data: { token: 'bearer-from-ak' } };
  };
  await client.mintPublicToken({});
  assert.equal(calls[0].path, '/api/public/token/account-key');
  assert.equal(calls[0].opts.apiKey, 'ak_live_test');
});

test('getBearer caches token from mint response', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '',
    akApiKey: 'ak_live_test',
    bearerToken: '',
    motorBlockId: '39b3f504-7e41-4b3f-871a-75bc77676267',
    defaultFrom: ''
  });
  let mints = 0;
  client.request = async () => {
    mints += 1;
    return { data: { token: 'bearer-abc' } };
  };
  assert.equal(await client.getBearer(), 'bearer-abc');
  assert.equal(await client.getBearer(), 'bearer-abc');
  assert.equal(mints, 1);
});

test('sandboxProvision caches the mk_live_ key for subsequent send_email calls', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '',
    akApiKey: '',
    bearerToken: '',
    dashboardJwt: 'dashboard-jwt-test',
    motorBlockId: '',
    defaultFrom: 'noreply@example.com'
  });

  client.request = async (method, path) => {
    if (path === '/api/developer/sandbox/provision') {
      return { success: true, idempotent: false, data: { credentials: { mkApiKey: 'mk_live_from_provision' } } };
    }
    throw new Error(`unexpected request: ${method} ${path}`);
  };

  await client.sandboxProvision({ channel: 'agent' });
  assert.equal(client.requireMk(), 'mk_live_from_provision');
});

test('requireMk still throws when neither cache nor env var is set', () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '',
    akApiKey: '',
    bearerToken: '',
    dashboardJwt: '',
    motorBlockId: '',
    defaultFrom: ''
  });
  assert.throws(() => client.requireMk(), /MOTORICAL_MK_API_KEY/);
});

test('sandboxProvision does not override static mkApiKey when already configured', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: 'mk_live_production_key',
    akApiKey: '',
    bearerToken: '',
    dashboardJwt: 'dashboard-jwt-test',
    motorBlockId: '',
    defaultFrom: 'noreply@example.com'
  });

  client.request = async (method, path) => {
    if (path === '/api/developer/sandbox/provision') {
      return { success: true, idempotent: false, data: { credentials: { mkApiKey: 'mk_live_sandbox_key' } } };
    }
    throw new Error(`unexpected request: ${method} ${path}`);
  };

  await client.sandboxProvision({ channel: 'agent' });
  assert.equal(client.requireMk(), 'mk_live_production_key');
});

test('sandboxAllowlistRequest posts to the request endpoint with the dashboard JWT', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '', akApiKey: '', bearerToken: '',
    dashboardJwt: 'dashboard-jwt-test',
    motorBlockId: '', defaultFrom: ''
  });
  const calls = [];
  client.request = async (method, path, opts) => {
    calls.push({ method, path, opts });
    return { success: true, message: 'sent' };
  };
  await client.sandboxAllowlistRequest({ email: 'friend@example.com' });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].path, '/api/developer/sandbox/allowlist/request');
  assert.equal(calls[0].opts.bearer, 'dashboard-jwt-test');
  assert.equal(calls[0].opts.body.email, 'friend@example.com');
});

test('sandboxAllowlistConfirm posts email and code to the confirm endpoint', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '', akApiKey: '', bearerToken: '',
    dashboardJwt: 'dashboard-jwt-test',
    motorBlockId: '', defaultFrom: ''
  });
  const calls = [];
  client.request = async (method, path, opts) => {
    calls.push({ method, path, opts });
    return { success: true, data: {} };
  };
  await client.sandboxAllowlistConfirm({ email: 'friend@example.com', code: '123456' });
  assert.equal(calls[0].path, '/api/developer/sandbox/allowlist/confirm');
  assert.equal(calls[0].opts.body.code, '123456');
});

test('sandboxProvision caches motorBlockId so a cold JWT-only agent can track sends', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '', akApiKey: '', bearerToken: '',
    dashboardJwt: 'dashboard-jwt-test',
    motorBlockId: '', defaultFrom: ''
  });
  assert.equal(client.config.motorBlockId, '');

  client.request = async () => ({
    success: true,
    data: {
      motorBlock: { id: '11111111-2222-3333-4444-555555555555', name: 'Developer Sandbox' },
      credentials: { mkApiKey: 'mk_live_from_provision' }
    }
  });

  await client.sandboxProvision({ handle: 'devbox' });
  assert.equal(client.config.motorBlockId, '11111111-2222-3333-4444-555555555555');
  // getBearer()/mintPublicToken() no longer throw 'motorBlockId is required'
  assert.equal(client.requireMk(), 'mk_live_from_provision');
});

test('sandboxProvision does not override an explicitly configured motorBlockId', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '', akApiKey: '', bearerToken: '',
    dashboardJwt: 'dashboard-jwt-test',
    motorBlockId: 'explicit-static-block-id', defaultFrom: ''
  });
  client.request = async () => ({
    success: true,
    data: { motorBlock: { id: 'provisioned-block-id' } }
  });
  await client.sandboxProvision({});
  assert.equal(client.config.motorBlockId, 'explicit-static-block-id');
});

test('sandboxStatus also caches motorBlockId for a returning agent', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '', akApiKey: '', bearerToken: '',
    dashboardJwt: 'dashboard-jwt-test',
    motorBlockId: '', defaultFrom: ''
  });
  const calls = [];
  client.request = async (method, path, opts) => {
    calls.push({ method, path, opts });
    return { success: true, data: { motorBlock: { id: 'status-block-id' } } };
  };
  const result = await client.sandboxStatus();
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].path, '/api/developer/sandbox');
  assert.equal(calls[0].opts.bearer, 'dashboard-jwt-test');
  assert.equal(client.config.motorBlockId, 'status-block-id');
  assert.equal(result.success, true, 'sandboxStatus must still return the response');
});

// Found live 2026-09-02: domainList (and domainAdd/verify/check-dns, which
// copied its shape) branched on oauthAccessToken() to choose between the
// public API path and the old dashboard-session route (/api/domains). Under
// delegation, oauthAccessToken() ALWAYS resolves null — a delegated view has
// no stored OAuth session, it authenticates via a per-call Delegation header
// instead — so every one of these calls silently took the "no OAuth token"
// branch and hit /api/domains, which has no idea what a Delegation header is
// and rejects it. listMotorBlocks/getMessage never had this bug: they never
// branch on oauthAccessToken() at all, they always call getBearer() and
// always hit the public API path — whatever bearer getBearer() resolves is
// irrelevant under delegation anyway, since the delegation layer strips it
// and forces its own header on regardless. These four now follow that same
// unconditional pattern; /api/domains is no longer reachable from any of
// them (mintPublicToken already accepts a dashboard JWT as a credential, so
// nothing is lost for a dashboard-JWT-only caller).
// getBearer() returns this._cachedBearer immediately when set, before ever
// trying to mint one — same as a delegated callView() does with its
// placeholder. Setting it directly keeps these tests about routing (what URL
// and method get called), not about mintPublicToken()'s own credential
// resolution, which is exercised elsewhere.
function clientWithMintedBearer(bearer) {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com', docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '', akApiKey: '', bearerToken: '', dashboardJwt: '',
    motorBlockId: '', defaultFrom: ''
  });
  client._cachedBearer = bearer;
  const calls = [];
  client.request = async (method, path, opts) => { calls.push({ method, path, opts }); return { success: true }; };
  return { client, calls };
}

test('domainList always GETs /api/public/v1/domains — never branches to /api/domains', async () => {
  const { client, calls } = clientWithMintedBearer('minted-bearer');
  await client.domainList({ motorBlockId: 'mb-1' });
  assert.equal(calls[0].method, 'GET');
  assert.match(calls[0].path, /^\/api\/public\/v1\/domains/);
  assert.equal(calls[0].opts.bearer, 'minted-bearer');
});

test('domainAdd always POSTs /api/public/v1/domains — never branches to /api/domains', async () => {
  const { client, calls } = clientWithMintedBearer('minted-bearer');
  await client.domainAdd({ domain: 'example.com', verificationMethod: 'dns', motorBlockId: 'mb-1' });
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].path, /^\/api\/public\/v1\/domains/);
  assert.equal(calls[0].opts.bearer, 'minted-bearer');
  assert.deepEqual(calls[0].opts.body, { domain: 'example.com', verificationMethod: 'dns' });
});

test('domainVerify always POSTs /api/public/v1/domains/:id/verify — never branches to /api/domains', async () => {
  const { client, calls } = clientWithMintedBearer('minted-bearer');
  await client.domainVerify({ domainId: 'dom-1', method: 'dns', motorBlockId: 'mb-1' });
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].path, /^\/api\/public\/v1\/domains\/dom-1\/verify/);
  assert.equal(calls[0].opts.bearer, 'minted-bearer');
});

test('domainCheckDns always POSTs /api/public/v1/domains/:id/check-dns — never branches to /api/domains', async () => {
  const { client, calls } = clientWithMintedBearer('minted-bearer');
  await client.domainCheckDns({ domainId: 'dom-1', recordType: 'dkim', motorBlockId: 'mb-1' });
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].path, /^\/api\/public\/v1\/domains\/dom-1\/check-dns/);
  assert.equal(calls[0].opts.bearer, 'minted-bearer');
  assert.deepEqual(calls[0].opts.body, { recordType: 'dkim' });
});

// The regression proof: exactly the delegated-view condition (no OAuth
// session, but a cached placeholder bearer already present, same as
// callView() sets) must still target the public API path, not /api/domains.
test('domainAdd targets the public API path even with no OAuth session at all (the delegated-call condition)', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com', docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '', akApiKey: '', bearerToken: '', dashboardJwt: '',
    motorBlockId: '', defaultFrom: '', oauthCredentials: null
  });
  client._cachedBearer = 'mcp-delegated'; // exactly what callView() sets
  const calls = [];
  client.request = async (method, path, opts) => { calls.push({ method, path, opts }); return { success: true }; };
  await client.domainAdd({ domain: 'example.com', motorBlockId: 'mb-1' });
  assert.match(calls[0].path, /^\/api\/public\/v1\/domains/,
    'domainAdd must never fall back to /api/domains — that route rejects a Delegation header');
});

test('sandboxStatus tolerates a status response with no motor block yet', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '', akApiKey: '', bearerToken: '',
    dashboardJwt: 'dashboard-jwt-test',
    motorBlockId: '', defaultFrom: ''
  });
  client.request = async () => ({ success: true, data: { motorBlock: null } });
  await client.sandboxStatus();
  assert.equal(client.config.motorBlockId, '');
});

// Account-wide operations (domain management, listing the blocks themselves)
// were routed through _scoped(), which THROWS when an OAuth session covers
// more than one block. Live 2026-09-02: domain_list on an 8-block grant
// demanded a block id that the backend handler never reads — it queries
// WHERE user_id = $1 and returns every domain on the account.
function oauthClient() {
  const c = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '', akApiKey: '', bearerToken: '', dashboardJwt: '',
    motorBlockId: '', defaultFrom: '', oauthCredentials: null,
  });
  // A multi-block OAuth session: authenticated, but no single block to assume.
  c._oauth = { accessToken: 'fake-oauth-access-token' };
  c.oauthAccessToken = async () => 'fake-oauth-access-token';
  return c;
}

test('_accountPath omits motorBlockId rather than throwing', () => {
  const c = oauthClient();
  assert.equal(c._accountPath('/api/public/v1/domains'), '/api/public/v1/domains');
});

test('_accountPath still passes a block through when one is given', () => {
  const c = oauthClient();
  assert.equal(
    c._accountPath('/api/public/v1/domains', 'mb-1'),
    '/api/public/v1/domains?motorBlockId=mb-1'
  );
});

test('domainList under a multi-block OAuth session needs no selector', async () => {
  const c = oauthClient();
  let seenPath;
  c.request = async (m, p) => { seenPath = p; return { success: true, data: [] }; };

  await c.domainList();

  assert.equal(seenPath, '/api/public/v1/domains');
});

test('listMotorBlocks under a multi-block OAuth session needs no selector', async () => {
  const c = oauthClient();
  let seenPath;
  c.request = async (m, p) => { seenPath = p; return { success: true, data: [] }; };

  await c.listMotorBlocks();

  assert.equal(seenPath, '/api/public/v1/motor-blocks');
});

test('_scoped still throws for a block-scoped path with no selector', () => {
  const c = oauthClient();
  assert.throws(() => c._scoped('/api/public/v1/messages/m1'), /motorBlockId is required/);
});
