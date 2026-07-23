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
