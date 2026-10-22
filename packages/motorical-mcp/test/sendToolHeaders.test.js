import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { TOOLS } from '../src/registry.js';
import { MotoricalClient } from '../src/client.js';

const tool = TOOLS.find((t) => t.name === 'motorical_send_email');
const schema = z.object(tool.inputSchema);
const base = { to: 'a@example.com', subject: 's', text: 't' };
const ok = (headers) => schema.safeParse({ ...base, headers }).success;

test('headers are optional and accept the threading, unsubscribe and custom X- headers an agent needs', () => {
  assert.ok(schema.safeParse(base).success);
  assert.ok(ok({
    'In-Reply-To': '<abc@mail.example.com>',
    References: '<root@mail.example.com> <abc@mail.example.com>',
    'List-Unsubscribe': '<https://example.com/u/1>, <mailto:unsub@example.com>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'X-Order-Id': '12345',
  }));
});

test('shape errors are rejected before any request is made', () => {
  assert.equal(ok({ 'X-Num': 5 }), false);                                   // values are strings
  assert.equal(ok({ 'Bad Name': 'v' }), false);                              // names are header tokens
  assert.equal(ok({ 'X-A:B': 'v' }), false);
  assert.equal(ok({ '': 'v' }), false);
  assert.equal(ok({ 'X-A': 'line\r\nBcc: evil@example.com' }), false);       // no line breaks in values
  assert.equal(ok({ 'X-A': 'x'.repeat(999) }), false);
  assert.equal(ok(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`X-H${i}`, 'v']))), false);
  assert.equal(ok('In-Reply-To: <a@b>'), false);                             // an object, not a string
});

test('the description tells an agent what to use it for and what the platform refuses', () => {
  assert.match(tool.description, /In-Reply-To/);
  assert.match(tool.description, /List-Unsubscribe/);
  assert.match(tool.description, /DISALLOWED_HEADERS/);
  assert.match(tool.description, /replyTo/);
});

test('sendEmail passes headers to the body untouched (the backend owns the deny list)', async () => {
  const calls = [];
  const client = new MotoricalClient({ apiBaseUrl: 'https://api.motorical.com', docsBaseUrl: 'https://docs.motorical.com', mkApiKey: 'mk_live_test_secret', akApiKey: '', bearerToken: '', motorBlockId: '', defaultFrom: 'noreply@example.com' });
  client.request = async (method, path, opts) => { calls.push({ method, path, opts }); return { success: true, dryRun: true }; };
  await client.sendEmail({ to: 'a@example.com', subject: 'hi', text: 'body', headers: { 'In-Reply-To': '<x@y>' }, idempotencyKey: 'k1' });
  assert.deepEqual(calls[0].opts.body.headers, { 'In-Reply-To': '<x@y>' });
  assert.equal(calls[0].opts.headers['Idempotency-Key'], 'k1');               // the HTTP header and the email headers stay separate
  await client.sendEmail({ to: 'a@example.com', subject: 'hi', text: 'body' });
  assert.equal('headers' in calls[1].opts.body, false);
});
