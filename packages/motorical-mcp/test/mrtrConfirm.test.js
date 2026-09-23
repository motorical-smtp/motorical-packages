// packages/motorical-mcp/test/mrtrConfirm.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MotoricalClient } from '../src/client.js';

function stubClient() {
  const client = new MotoricalClient({ apiBaseUrl: 'https://api.test', akApiKey: 'ak_test' });
  client.request = async () => ({ success: true });
  client.getBearer = async () => 'test-bearer';
  return client;
}

describe('MRTR confirm-gate', () => {
  test('webhookDelete refuses without confirm:true, naming the webhookId', async () => {
    const client = stubClient();
    await assert.rejects(
      () => client.webhookDelete({ motorBlockId: 'mb-1', webhookId: 'wh-1' }),
      /wh-1/
    );
  });

  test('webhookDelete proceeds with confirm:true', async () => {
    const client = stubClient();
    const result = await client.webhookDelete({ motorBlockId: 'mb-1', webhookId: 'wh-1', confirm: true });
    assert.equal(result.success, true);
  });

  test('domainVerify refuses without confirm:true, naming the domainId', async () => {
    const client = stubClient();
    await assert.rejects(
      () => client.domainVerify({ domainId: 'd-1' }),
      /d-1/
    );
  });

  test('domainVerify proceeds with confirm:true', async () => {
    const client = stubClient();
    const result = await client.domainVerify({ domainId: 'd-1', confirm: true });
    assert.equal(result.success, true);
  });
});
