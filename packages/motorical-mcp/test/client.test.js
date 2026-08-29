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
