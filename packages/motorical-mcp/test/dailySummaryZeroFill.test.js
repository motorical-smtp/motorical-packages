import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotoricalClient } from '../src/client.js';
import { toolErrorPayload } from '../src/toolError.js';

const BLOCK = '11111111-1111-4111-8111-111111111111';
function client(calls) {
  const c = new MotoricalClient({ apiBaseUrl: 'https://api.motorical.com', docsBaseUrl: 'https://docs.motorical.com', mkApiKey: '', akApiKey: '', bearerToken: 'tok', motorBlockId: BLOCK, defaultFrom: '' });
  c.getBearer = async () => 'tok';
  c.request = async (method, path) => { calls.push(path); return { success: true }; };
  return c;
}

test('daily summary: zeroFill is sent only when true (the default answer is unchanged)', async () => {
  const calls = [];
  await client(calls).getDailySummary({ motorBlockId: BLOCK, days: 7 });
  await client(calls).getDailySummary({ motorBlockId: BLOCK, days: 7, zeroFill: false });
  await client(calls).getDailySummary({ motorBlockId: BLOCK, days: 7, zeroFill: true });
  assert.doesNotMatch(calls[0], /zeroFill/);
  assert.doesNotMatch(calls[1], /zeroFill/);
  assert.match(calls[2], /zeroFill=true/);
});

test('a tool error carries the API requestId as its own field', () => {
  const p = toolErrorPayload({ message: 'no', status: 401, data: { code: 'api_key_required', requestId: 'req_abc123def456' } });
  assert.equal(p.requestId, 'req_abc123def456');
  assert.equal(p.code, 'api_key_required');
  assert.equal(toolErrorPayload({ message: 'no', status: 500, data: null }).requestId, undefined);
});
