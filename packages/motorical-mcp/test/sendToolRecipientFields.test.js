import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { TOOLS } from '../src/registry.js';

const tool = TOOLS.find((t) => t.name === 'motorical_send_email');
const schema = z.object(tool.inputSchema);
const base = { to: 'a@example.com', subject: 's', text: 't' };

test('cc, bcc and replyTo are optional and accept a string or a list', () => {
  assert.ok(schema.safeParse(base).success);
  assert.ok(schema.safeParse({ ...base, cc: 'c@example.com', bcc: ['b@example.com'], replyTo: 'r@example.com' }).success);
});
test('invalid addresses in the new fields are rejected before any request is made', () => {
  assert.equal(schema.safeParse({ ...base, cc: 'nope' }).success, false);
  assert.equal(schema.safeParse({ ...base, bcc: ['ok@example.com', 'nope'] }).success, false);
  assert.equal(schema.safeParse({ ...base, replyTo: ['r@example.com'] }).success, false);
});
test('the description tells an agent the fields roll out per block and what the refusal looks like', () => {
  assert.match(tool.description, /feature_not_enabled/);
  assert.match(tool.description, /50 recipients/);
});
test('the output schema accepts the echoed fields and data.skipped', () => {
  const out = z.object(tool.outputSchema);
  const r = out.safeParse({ success: true, data: { id: 'x', cc: ['c@example.com'], bcc: ['b@example.com'], replyTo: 'r@example.com', skipped: [{ address: 's@example.com', role: 'cc', reason: 'suppressed' }] } });
  assert.ok(r.success, JSON.stringify(r.error));
});
