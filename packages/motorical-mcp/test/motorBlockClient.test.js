import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotoricalClient } from '../src/client.js';

const BLOCK_ID = '11111111-1111-4111-8111-111111111111';
const DOMAIN_ID = '22222222-2222-4222-8222-222222222222';
const JOB_ID = '33333333-3333-4333-8333-333333333333';
const IDEMPOTENCY_KEY = '44444444-4444-4444-8444-444444444444';

function recordingClient({ delegated = false } = {}) {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com', docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: '', akApiKey: '', bearerToken: '', dashboardJwt: 'dashboard-jwt',
    motorBlockId: '', smtpUsername: '', defaultFrom: '', oauthCredentials: null,
  });
  client._delegated = delegated;
  const calls = [];
  client.request = async (method, path, opts = {}) => {
    calls.push({ method, path, opts });
    return { success: true, data: { motorBlockId: BLOCK_ID } };
  };
  return { client, calls };
}

test('local Motor Block lifecycle methods use dashboard routes and dashboard JWT', async () => {
  const { client, calls } = recordingClient();
  await client.motorBlockList();
  await client.motorBlockCreate({ name: 'Orders', domainId: DOMAIN_ID, type: 'transactional', idempotencyKey: IDEMPOTENCY_KEY });
  await client.motorBlockRename({ motorBlockId: BLOCK_ID, name: 'Receipts' });
  await client.motorBlockChangeType({ motorBlockId: BLOCK_ID, type: 'general_purpose', confirm: true });
  await client.motorBlockAssignDomain({ motorBlockId: BLOCK_ID, domainId: DOMAIN_ID, confirm: true });
  await client.motorBlockDeactivate({ motorBlockId: BLOCK_ID, confirm: true });
  await client.motorBlockReactivate({ motorBlockId: BLOCK_ID });
  await client.motorBlockDelete({ motorBlockId: BLOCK_ID, deleteHistory: true, confirm: true });
  await client.motorBlockDeleteStatus({ jobId: JOB_ID });

  assert.deepEqual(calls.map(({ method, path }) => [method, path]), [
    ['GET', '/api/motor-blocks'],
    ['POST', '/api/motor-blocks'],
    ['PUT', `/api/motor-blocks/${BLOCK_ID}`],
    ['PUT', `/api/motor-blocks/${BLOCK_ID}`],
    ['PUT', `/api/motor-blocks/${BLOCK_ID}`],
    ['PUT', `/api/motor-blocks/${BLOCK_ID}`],
    ['PUT', `/api/motor-blocks/${BLOCK_ID}`],
    ['DELETE', `/api/motor-blocks/${BLOCK_ID}/purge`],
    ['GET', `/api/motor-blocks/purge-jobs/${JOB_ID}`],
  ]);
  for (const call of calls) assert.equal(call.opts.bearer, 'dashboard-jwt');
  assert.deepEqual(calls[3].opts.body, { type: 'general_purpose' });
  assert.deepEqual(calls[4].opts.body, { domainId: DOMAIN_ID });
  assert.deepEqual(calls[5].opts.body, { active: false });
  assert.deepEqual(calls[6].opts.body, { active: true });
  assert.deepEqual(calls[7].opts.body, { force: true });
  assert.equal(calls[1].opts.headers['Idempotency-Key'], IDEMPOTENCY_KEY);
  assert.equal('idempotencyKey' in calls[1].opts.body, false);
});

test('delegated Motor Block lifecycle methods use Public API routes and preserve confirmation', async () => {
  const { client, calls } = recordingClient({ delegated: true });
  await client.motorBlockList();
  await client.motorBlockCreate({ name: 'Orders', domainId: DOMAIN_ID, type: 'transactional', idempotencyKey: IDEMPOTENCY_KEY });
  await client.motorBlockRename({ motorBlockId: BLOCK_ID, name: 'Receipts' });
  await client.motorBlockChangeType({ motorBlockId: BLOCK_ID, type: 'general_purpose', confirm: true });
  await client.motorBlockAssignDomain({ motorBlockId: BLOCK_ID, domainId: DOMAIN_ID, confirm: true });
  await client.motorBlockDeactivate({ motorBlockId: BLOCK_ID, confirm: true });
  await client.motorBlockReactivate({ motorBlockId: BLOCK_ID });
  await client.motorBlockDelete({ motorBlockId: BLOCK_ID, deleteHistory: false, confirm: true });
  await client.motorBlockDeleteStatus({ jobId: JOB_ID });

  assert.deepEqual(calls.map(({ method, path }) => [method, path]), [
    ['GET', '/api/public/v1/account/motor-blocks'],
    ['POST', '/api/public/v1/account/motor-blocks'],
    ['PATCH', `/api/public/v1/account/motor-blocks/${BLOCK_ID}/name`],
    ['PATCH', `/api/public/v1/account/motor-blocks/${BLOCK_ID}/type`],
    ['POST', `/api/public/v1/account/motor-blocks/${BLOCK_ID}/assign-domain`],
    ['POST', `/api/public/v1/account/motor-blocks/${BLOCK_ID}/deactivate`],
    ['POST', `/api/public/v1/account/motor-blocks/${BLOCK_ID}/reactivate`],
    ['DELETE', `/api/public/v1/account/motor-blocks/${BLOCK_ID}`],
    ['GET', `/api/public/v1/account/motor-block-deletions/${JOB_ID}`],
  ]);
  assert.equal(calls[1].opts.headers['Idempotency-Key'], IDEMPOTENCY_KEY);
  assert.equal('idempotencyKey' in calls[1].opts.body, false);
  assert.deepEqual(calls[3].opts.body, { type: 'general_purpose', confirm: true });
  assert.deepEqual(calls[7].opts.body, { deleteHistory: false, confirm: true });
});

test('local sandbox conversion updates implicit cached identity but preserves explicit configuration', async () => {
  const { client } = recordingClient();
  client.request = async () => ({
    success: true,
    data: { motorBlockId: BLOCK_ID, smtpUsername: 'orders_abcd1234', domain: 'example.com' },
  });
  await client.sandboxConvert({ domainId: DOMAIN_ID, name: 'Orders', type: 'transactional', confirm: true });
  assert.equal(client.config.motorBlockId, BLOCK_ID);
  assert.equal(client.config.smtpUsername, 'orders_abcd1234');
  assert.equal(client.config.defaultFrom, 'noreply@example.com');

  const explicit = recordingClient().client;
  explicit.config.motorBlockId = '55555555-5555-4555-8555-555555555555';
  explicit.config.smtpUsername = 'explicit-user';
  explicit.config.defaultFrom = 'sender@explicit.example';
  explicit.request = client.request;
  await explicit.sandboxConvert({ domainId: DOMAIN_ID, confirm: true });
  assert.equal(explicit.config.motorBlockId, '55555555-5555-4555-8555-555555555555');
  assert.equal(explicit.config.smtpUsername, 'explicit-user');
  assert.equal(explicit.config.defaultFrom, 'sender@explicit.example');
});
