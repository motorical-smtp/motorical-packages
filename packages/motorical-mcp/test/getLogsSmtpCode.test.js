import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { TOOLS } from '../src/registry.js';
import { MotoricalClient } from '../src/client.js';

const tool = TOOLS.find((t) => t.name === 'motorical_get_logs');
const schema = z.object(tool.inputSchema);
const block = '11111111-1111-4111-8111-111111111111';

test('smtpCode is an optional string and is NOT silently dropped by the schema', () => {
  assert.ok(schema.safeParse({ motorBlockId: block }).success);
  const r = schema.safeParse({ motorBlockId: block, smtpCode: '5.7.x,4xx' });
  assert.ok(r.success, JSON.stringify(r.error));
  assert.equal(r.data.smtpCode, '5.7.x,4xx');
  assert.equal(schema.safeParse({ motorBlockId: block, smtpCode: 550 }).success, false);
});

test('the field and the tool description tell an agent the forms and why classes exist', () => {
  const text = `${tool.description} ${tool.inputSchema.smtpCode.description}`;
  assert.match(text, /5xx/);
  assert.match(text, /5\.7\.x/);
  assert.match(text, /550/);
  assert.match(text, /either form|both forms|basic.*enhanced|enhanced.*basic/i);
  assert.match(tool.inputSchema.query.description, /code:/);
});

test('getLogs sends smtpCode as a query parameter, encoded', async () => {
  const calls = [];
  const client = new MotoricalClient({ apiBaseUrl: 'https://api.motorical.com', docsBaseUrl: 'https://docs.motorical.com', mkApiKey: '', akApiKey: '', bearerToken: 'tok', motorBlockId: block, defaultFrom: '' });
  client.getBearer = async () => 'tok';
  client.request = async (method, path, opts) => { calls.push({ method, path, opts }); return { success: true, data: { items: [] } }; };
  await client.getLogs({ motorBlockId: block, smtpCode: '5.7.x,4xx', currentOutcome: 'bounced' });
  assert.match(calls[0].path, /[?&]smtpCode=5\.7\.x%2C4xx(&|$)/);
  assert.match(calls[0].path, /currentOutcome=bounced/);
  await client.getLogs({ motorBlockId: block });
  assert.doesNotMatch(calls[1].path, /smtpCode/);
});
