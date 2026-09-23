import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MotoricalClient } from '../src/client.js';

function clientWithCapturedRequest() {
  const client = new MotoricalClient({ apiBaseUrl: 'https://api.test', akApiKey: 'ak_test' });
  const calls = [];
  client.request = async (method, path, opts = {}) => {
    calls.push({ method, path, opts });
    return { success: true, data: {} };
  };
  client.getBearer = async () => 'test-bearer';
  return { client, calls };
}

describe('idempotencyKey passthrough', () => {
  test('domainAdd sends Idempotency-Key when given', async () => {
    const { client, calls } = clientWithCapturedRequest();
    await client.domainAdd({ domain: 'example.com', idempotencyKey: 'k-1' });
    assert.equal(calls[0].opts.headers['Idempotency-Key'], 'k-1');
  });

  test('domainAdd sends no Idempotency-Key header when omitted', async () => {
    const { client, calls } = clientWithCapturedRequest();
    await client.domainAdd({ domain: 'example.com' });
    assert.equal(calls[0].opts.headers?.['Idempotency-Key'], undefined);
  });

  test('webhookCreate sends Idempotency-Key when given', async () => {
    const { client, calls } = clientWithCapturedRequest();
    await client.webhookCreate({ motorBlockId: 'mb-1', url: 'https://example.com/hook', idempotencyKey: 'k-2' });
    assert.equal(calls[0].opts.headers['Idempotency-Key'], 'k-2');
  });

  test('webhookUpdate sends Idempotency-Key when given', async () => {
    const { client, calls } = clientWithCapturedRequest();
    await client.webhookUpdate({ motorBlockId: 'mb-1', webhookId: 'wh-1', url: 'https://example.com/hook', idempotencyKey: 'k-3' });
    assert.equal(calls[0].opts.headers['Idempotency-Key'], 'k-3');
  });
});
