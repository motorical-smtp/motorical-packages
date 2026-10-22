import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { TOOLS } from '../src/registry.js';
import { MotoricalClient } from '../src/client.js';

const tool = TOOLS.find((t) => t.name === 'motorical_send_email');
const schema = z.object(tool.inputSchema);
const base = { to: 'a@example.com', subject: 's', text: 't' };
const b64 = (s) => Buffer.from(s).toString('base64');
const pdf = { filename: 'invoice.pdf', content: b64('%PDF-1.4 tiny'), contentType: 'application/pdf' };

test('attachments are optional and accept a plain file and an inline image', () => {
  assert.ok(schema.safeParse(base).success);
  assert.ok(schema.safeParse({ ...base, attachments: [pdf] }).success);
  assert.ok(schema.safeParse({ ...base, attachments: [pdf, { filename: 'logo.png', content: b64('png'), contentId: 'logo1', disposition: 'inline' }] }).success);
});

test('shape errors are rejected before any request is made', () => {
  const bad = (a) => schema.safeParse({ ...base, attachments: a }).success;
  assert.equal(bad([]), false);                                                           // an empty list is a mistake
  assert.equal(bad([{ content: b64('x') }]), false);                                      // no filename
  assert.equal(bad([{ filename: '../x.pdf', content: b64('x') }]), false);                // path separator
  assert.equal(bad([{ filename: 'a\nb.pdf', content: b64('x') }]), false);                // control character
  assert.equal(bad([{ filename: 'a.pdf' }]), false);                                      // no content
  assert.equal(bad([{ filename: 'a.pdf', content: b64('x'), disposition: 'weird' }]), false);
  assert.equal(bad([{ filename: 'a.png', content: b64('x'), disposition: 'inline' }]), false);   // inline needs a contentId
  assert.equal(bad([{ filename: 'a.pdf', content: b64('x'), path: '/etc/passwd' }]), false);     // no file-path field: bytes only
  assert.equal(bad(Array.from({ length: 6 }, (_, i) => ({ filename: `f${i}.txt`, content: b64('x') }))), false);
});

test('inline base64 is limited to what a chat can carry, in total and per file', () => {
  const big = (n) => ({ filename: 'big.bin', content: 'A'.repeat(n) });
  assert.ok(schema.safeParse({ ...base, attachments: [big(600000)] }).success);
  assert.equal(schema.safeParse({ ...base, attachments: [big(700001)] }).success, false);
  assert.equal(schema.safeParse({ ...base, attachments: [big(400000), { ...big(400000), filename: 'b.bin' }] }).success, false);
});

test('the description tells an agent the limits, the rollout and where larger files go', () => {
  assert.match(tool.description, /attachments/);
  assert.match(tool.description, /base64/);
  assert.match(tool.description, /feature_not_enabled/);
  assert.match(tool.description, /SMTP/);
  assert.match(tool.description, /dryRun/);
});

test('the output schema accepts the dryRun attachment summary', () => {
  const out = z.object(tool.outputSchema);
  const r = out.safeParse({ success: true, dryRun: true, data: { status: 'validated', attachments: [{ filename: 'invoice.pdf', size: 13, contentType: 'application/pdf' }, { filename: 'logo.png', size: 3 }], attachmentBytes: 16 } });
  assert.ok(r.success, JSON.stringify(r.error));
});

test('sendEmail passes attachments through to the body untouched (the backend and gateway own the rules)', async () => {
  const calls = [];
  const client = new MotoricalClient({ apiBaseUrl: 'https://api.motorical.com', docsBaseUrl: 'https://docs.motorical.com', mkApiKey: 'mk_live_test_secret', akApiKey: '', bearerToken: '', motorBlockId: '', defaultFrom: 'noreply@example.com' });
  client.request = async (method, path, opts) => { calls.push({ method, path, opts }); return { success: true, dryRun: true }; };
  await client.sendEmail({ to: 'a@example.com', subject: 'hi', text: 'body', attachments: [pdf] });
  assert.deepEqual(calls[0].opts.body.attachments, [pdf]);
  await client.sendEmail({ to: 'a@example.com', subject: 'hi', text: 'body' });
  assert.equal('attachments' in calls[1].opts.body, false);
});
