// The campaign-draft family of the Communications MCP (M3-4): create, edit, duplicate, preflight and test send, all write:comms.content.
// Drafts only. Nothing here can schedule, set a time or a timezone, change pacing, cancel or delete; the test send goes to the account owner only.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createDelegatedClient } from '../src/delegatedClient.js';
import { SERVERS, TOOL_ROUTES, HOSTED_ONLY_TOOLS } from '../src/servers.js';
import { TOOLS } from '../src/registry.js';
import { COMMS_CAMPAIGN_TOOLS } from '../src/commsCampaignTools.js';
import { FULL_EMAIL } from '../src/commsMask.js';
import { TOOL_SCOPES, SERVER_TOOLS } from '@motorical/scope-catalog';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const signer = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'k1' };
const server = SERVERS.find((s) => s.key === 'communications');
const W1 = '33333333-3333-4333-8333-333333333333';
const CAMP = '88888888-8888-4888-8888-888888888888';
const TPL = '55555555-5555-4555-8555-555555555555';
const BLOCK = '99999999-9999-4999-8999-999999999999';
const L1 = '66666666-6666-4666-8666-666666666666';
const L2 = '77777777-7777-4777-8777-777777777777';
const ALL = ['read:comms', 'write:comms.content', 'write:comms.audience'];
const claims = (scopes = ALL) => ({ grantId: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222', scopes, motorBlockIds: [] });
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const ok = (data, extra = {}) => json(200, { success: true, data, ...extra });
const BASE = 'http://comms.test/api';
const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

const make = (table, scopes) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = url.slice(BASE.length);
    const key = `${init.method} ${path}`;
    calls.push({ key, method: init.method, path, init, body: init.body ? JSON.parse(init.body) : undefined });
    const hit = Object.entries(table).find(([k]) => k === key || (k.endsWith('*') && key.startsWith(k.slice(0, -1))));
    if (!hit) throw new Error(`unexpected call: ${key}`);
    return typeof hit[1] === 'function' ? hit[1](init, path) : hit[1];
  };
  const client = createDelegatedClient({ claims: claims(scopes), server, signer, apiBaseUrl: 'http://backend.test', commsBaseUrl: BASE, fetchImpl });
  return { client, calls };
};

// What a dry run may do: read, and use the API's own dry_run flag. Preflight (a compile) and a real test send are real writes by nature.
const isWrite = (c) => {
  if (c.method === 'GET') return false;
  if (c.body && c.body.dry_run === true && /^\/campaigns(\/[0-9a-f-]+\/settings)?$/.test(c.path)) return false;
  return true;
};
const writes = (calls) => calls.filter(isWrite);
const FORBIDDEN_KEYS = ['scheduled_at', 'timezone', 'clear_scheduled', 'chunk_size', 'delay_seconds_between_chunks', 'status'];
const hasForbidden = (v) => {
  if (Array.isArray(v)) return v.some(hasForbidden);
  if (v && typeof v === 'object') return Object.entries(v).some(([k, x]) => FORBIDDEN_KEYS.includes(k) || hasForbidden(x));
  return false;
};

const NAMES = ['comms_create_campaign', 'comms_update_campaign', 'comms_duplicate_campaign', 'comms_preflight_campaign', 'comms_send_test', 'comms_send_template_test'];
const byName = (n) => TOOLS.find((t) => t.name === n);
const DESC = 'Autumn promotion to the newsletter list, sent once in November.';
const CAMPAIGN = { id: CAMP, name: 'Autumn promo', template_id: TPL, motor_block_id: BLOCK, status: 'draft', from_address: 'news@hatfree.com', from_name: 'Hat Free', description: DESC };

describe('registration', () => {
  test('the table, the catalogue and the registry agree on the same 6 tools', () => {
    assert.deepEqual(COMMS_CAMPAIGN_TOOLS.map((t) => t.tool).sort(), [...NAMES].sort());
    for (const n of NAMES) { assert.ok(SERVER_TOOLS.communications.includes(n), n); assert.ok(byName(n), n); assert.ok(HOSTED_ONLY_TOOLS.includes(n), n); }
  });
  test('all need write:comms.content; the server offers those three scopes plus send (M3-5)', () => {
    for (const n of NAMES) assert.deepEqual(TOOL_SCOPES[n], ['write:comms.content'], n);
    assert.deepEqual([...server.scopes].sort(), ['manage:comms.audience', 'manage:comms.webhooks', 'manage:comms.workspace', 'read:comms', 'send:comms.campaign', 'write:comms.audience', 'write:comms.content']);
  });
  test('non-destructive writes; every tool except preflight says dry run and takes dryRun', () => {
    for (const n of NAMES) {
      const t = byName(n);
      assert.equal(t.annotations.readOnlyHint, false, n); assert.equal(t.annotations.destructiveHint, false, n);
      if (n !== 'comms_preflight_campaign') { assert.match(t.description, /dry run/i, n); assert.ok(t.inputSchema.dryRun, n); }
    }
  });
  test('no tool schedules, cancels, deletes or restores: no such name, no such route, POST/PATCH only', () => {
    for (const row of COMMS_CAMPAIGN_TOOLS) {
      assert.ok(['POST', 'PATCH'].includes(row.http), row.tool);
      assert.doesNotMatch(row.tool, /(schedule|cancel|delete|restore|purge)/i);
      assert.doesNotMatch(TOOL_ROUTES[row.tool].path, /(\/schedule|\/cancel|\/restore)/);
    }
  });
  test('the test send has NO recipient input at all, only a sample first name', () => {
    const keys = Object.keys(byName('comms_send_test').inputSchema).sort();
    assert.deepEqual(keys, ['dryRun', 'id', 'sample', 'workspaceId']);
    assert.match(byName('comms_send_test').description, /account owner/i);
    assert.match(byName('comms_send_test').description, /only/i);
  });
  test('preflight says nothing is sent and that it stores a compiled snapshot', () => {
    assert.match(byName('comms_preflight_campaign').description, /nothing is sent/i);
    assert.match(byName('comms_preflight_campaign').description, /snapshot/i);
  });
  test('the update tool has no schedule, timezone, pacing or status input', () => {
    const keys = Object.keys(byName('comms_update_campaign').inputSchema);
    for (const k of ['scheduledAt', 'scheduled_at', 'timezone', 'chunkSize', 'delaySeconds', 'status', 'name']) assert.ok(!keys.includes(k), k);
  });
});

describe('comms_create_campaign', () => {
  const args = { workspaceId: W1, name: 'Autumn promo', templateId: TPL, motorBlockId: BLOCK, listIds: [L1], excludeListIds: [L2], description: DESC, fromName: 'Hat Free' };
  const table = { 'POST /campaigns': ok({ ...CAMPAIGN, list_ids: [L1], exclude_list_ids: [L2] }) };
  test('dry run is the default: the API dry_run checks everything and nothing is created', async () => {
    const { client, calls } = make({ 'POST /campaigns': ok({ ...CAMPAIGN }, { dry_run: true }) });
    const out = await client.commsCreateCampaign(args);
    assert.equal(out.dryRun, true); assert.equal(out.applied, false);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, { name: 'Autumn promo', template_id: TPL, motor_block_id: BLOCK, list_ids: [L1], exclude_list_ids: [L2], description: DESC, from_name: 'Hat Free', dry_run: true });
    assert.equal(writes(calls).length, 0);
  });
  test('dryRun:false creates ONE draft with a stable Idempotency-Key and says it is only a draft', async () => {
    const run = async () => { const { client, calls } = make(table); const out = await client.commsCreateCampaign({ ...args, dryRun: false }); return { out, calls }; };
    const a = await run(); const b = await run();
    assert.equal(a.out.applied, true); assert.equal(a.out.data.status, 'draft'); assert.match(a.out.note, /draft/i); assert.match(a.out.note, /not (been )?(scheduled|sent)|nothing (is|was) (scheduled|sent)/i);
    assert.match(a.calls[0].init.headers['Idempotency-Key'], KEY_RE);
    assert.equal(a.calls[0].init.headers['Idempotency-Key'], b.calls[0].init.headers['Idempotency-Key']);
    assert.ok(!('dry_run' in a.calls[0].body) || a.calls[0].body.dry_run === false);
  });
  test('a description is required (the card), ids are checked, 1 to 50 lists: all refused before any call', async () => {
    const { client, calls } = make(table);
    await assert.rejects(() => client.commsCreateCampaign({ ...args, description: ' ' }), (e) => e.data.code === 'MISSING_CARD');
    await assert.rejects(() => client.commsCreateCampaign({ ...args, templateId: 'x' }), (e) => e.data.code === 'INVALID_ID');
    await assert.rejects(() => client.commsCreateCampaign({ ...args, motorBlockId: 'x' }), (e) => e.data.code === 'INVALID_ID');
    await assert.rejects(() => client.commsCreateCampaign({ ...args, listIds: ['x'] }), (e) => e.data.code === 'INVALID_ID');
    await assert.rejects(() => client.commsCreateCampaign({ ...args, listIds: [] }), (e) => e.data.code === 'LISTS_REQUIRED');
    await assert.rejects(() => client.commsCreateCampaign({ ...args, listIds: Array.from({ length: 51 }, () => L1) }), (e) => e.data.code === 'TOO_MANY_LISTS');
    assert.equal(calls.length, 0);
  });
  test('an API refusal (a From address off the block\'s domain) reaches the agent with its code and details', async () => {
    const { client } = make({ 'POST /campaigns': json(400, { success: false, error: 'From must be on hatfree.com', code: 'FROM_DOMAIN_MISMATCH', expected_domain: 'hatfree.com' }) });
    await assert.rejects(() => client.commsCreateCampaign({ ...args, fromAddress: 'x@other.com' }), (e) => e.status === 400 && e.data.code === 'FROM_DOMAIN_MISMATCH' && e.data.expected_domain === 'hatfree.com');
  });
});

describe('comms_update_campaign (a draft only)', () => {
  const settingsPath = `PATCH /campaigns/${CAMP}/settings`;
  const dryReply = ok({ id: CAMP, status: 'draft', changes: { description: 'New words that describe the campaign well enough.' } }, { dry_run: true, previous: { description: DESC } });
  test('dry run is the API dry_run: what would change and what it is now', async () => {
    const { client, calls } = make({ [settingsPath]: dryReply });
    const out = await client.commsUpdateCampaign({ workspaceId: W1, id: CAMP, description: 'New words that describe the campaign well enough.' });
    assert.equal(out.applied, false); assert.deepEqual(out.changes, { description: 'New words that describe the campaign well enough.' }); assert.deepEqual(out.previous, { description: DESC });
    assert.deepEqual(calls[0].body, { description: 'New words that describe the campaign well enough.', dry_run: true });
    assert.equal(writes(calls).length, 0);
  });
  test('a real edit asks the dry run first (for the undo information and the same checks), then makes exactly one real PATCH', async () => {
    let n = 0;
    const { client, calls } = make({ [settingsPath]: () => (++n === 1 ? dryReply : json(200, { success: true, message: 'Settings updated' })) });
    const out = await client.commsUpdateCampaign({ workspaceId: W1, id: CAMP, description: 'New words that describe the campaign well enough.', dryRun: false });
    assert.equal(out.applied, true); assert.deepEqual(out.previous, { description: DESC });
    assert.equal(calls.length, 2); assert.equal(calls[0].body.dry_run, true);
    assert.ok(!('dry_run' in calls[1].body)); assert.equal(writes(calls).length, 1);
  });
  test('template, lists and exclusions go through; null clears a name, a reply-to or the exclusions', async () => {
    const { client, calls } = make({ [settingsPath]: dryReply });
    await client.commsUpdateCampaign({ workspaceId: W1, id: CAMP, templateId: TPL, listIds: [L1], excludeListIds: null, fromName: null, replyTo: null });
    assert.deepEqual(calls[0].body, { template_id: TPL, list_ids: [L1], exclude_list_ids: null, from_name: null, reply_to: null, dry_run: true });
  });
  test('nothing to change, a bad id, or empty/invalid lists are refused locally', async () => {
    const { client, calls } = make({ [settingsPath]: dryReply });
    await assert.rejects(() => client.commsUpdateCampaign({ workspaceId: W1, id: CAMP }), (e) => e.data.code === 'NOTHING_TO_UPDATE');
    await assert.rejects(() => client.commsUpdateCampaign({ workspaceId: W1, id: 'x', description: 'x' }), (e) => e.data.code === 'INVALID_ID');
    await assert.rejects(() => client.commsUpdateCampaign({ workspaceId: W1, id: CAMP, listIds: [] }), (e) => e.data.code === 'LISTS_REQUIRED');
    await assert.rejects(() => client.commsUpdateCampaign({ workspaceId: W1, id: CAMP, listIds: ['x'] }), (e) => e.data.code === 'INVALID_ID');
    assert.equal(calls.length, 0);
  });
  test('a campaign that is no longer a draft is refused by the API (409 INVALID_STATE) and the agent sees it', async () => {
    const { client } = make({ [settingsPath]: json(409, { success: false, error: 'A completed campaign can no longer be edited', code: 'INVALID_STATE' }) });
    await assert.rejects(() => client.commsUpdateCampaign({ workspaceId: W1, id: CAMP, description: 'Too late to edit this one.' }), (e) => e.status === 409 && e.data.code === 'INVALID_STATE');
  });
});

describe('comms_duplicate_campaign', () => {
  test('dry run reads the campaign and names the copy; nothing is written', async () => {
    const { client, calls } = make({ [`GET /campaigns/${CAMP}`]: ok(CAMPAIGN) });
    const out = await client.commsDuplicateCampaign({ workspaceId: W1, id: CAMP });
    assert.equal(out.applied, false); assert.equal(out.would_create.name, 'Autumn promo (copy)'); assert.equal(out.would_create.status, 'draft'); assert.equal(out.would_create.copied_from, CAMP);
    assert.equal(writes(calls).length, 0);
  });
  test('a real duplicate is one POST with a stable key and makes a DRAFT', async () => {
    const { client, calls } = make({ [`POST /campaigns/${CAMP}/duplicate`]: ok({ id: 'new', name: 'Autumn promo (copy)', status: 'draft', copied_from: CAMP }) });
    const out = await client.commsDuplicateCampaign({ workspaceId: W1, id: CAMP, dryRun: false });
    assert.equal(out.applied, true); assert.equal(out.data.status, 'draft');
    assert.match(calls[0].init.headers['Idempotency-Key'], KEY_RE);
  });
});

describe('comms_preflight_campaign (honest)', () => {
  const compile = (over = {}) => ok({ version: 3, totalRecipients: 842, audience: { included: 842, excluded: { unsubscribed: 60, bounced: 10 } }, forecast: { estimated_completion_at: '2026-11-02T10:00:00Z' }, warnings: [{ type: 'daily_cap', message: 'Waits for the daily limit' }], ...over });
  test('compiles the campaign and reports the numbers exactly as the API gave them, with the version and the time', async () => {
    const { client, calls } = make({ [`POST /campaigns/${CAMP}/compile`]: compile() });
    const out = await client.commsPreflightCampaign({ workspaceId: W1, id: CAMP });
    const p = out.preflight;
    assert.equal(calls.length, 1); assert.equal(calls[0].method, 'POST');
    assert.equal(p.version, 3); assert.equal(p.totalRecipients, 842); assert.equal(p.hasRecipients, true);
    assert.deepEqual(p.audience, { included: 842, excluded: { unsubscribed: 60, bounced: 10 } });
    assert.match(p.checkedAt, /^\d{4}-\d\d-\d\dT/);
  });
  test('warnings come before the forecast, are never dropped, and the forecast is called an estimate', async () => {
    const { client } = make({ [`POST /campaigns/${CAMP}/compile`]: compile() });
    const p = (await client.commsPreflightCampaign({ workspaceId: W1, id: CAMP })).preflight;
    const keys = Object.keys(p);
    assert.ok(keys.indexOf('warnings') < keys.indexOf('forecast'));
    assert.equal(p.warnings.length, 1); assert.equal(p.warnings[0].type, 'daily_cap');
    const notes = p.notes.join(' ');
    assert.match(notes, /estimate/i); assert.match(notes, /other traffic/i);
  });
  test('it says nothing was sent, that a snapshot was stored, and that any later change makes it stale', async () => {
    const { client } = make({ [`POST /campaigns/${CAMP}/compile`]: compile() });
    const notes = (await client.commsPreflightCampaign({ workspaceId: W1, id: CAMP })).preflight.notes.join(' ');
    assert.match(notes, /nothing was sent/i); assert.match(notes, /snapshot/i); assert.match(notes, /stale|run it again/i);
  });
  test('zero recipients is NOT ready: hasRecipients false, a plain note, and the audience breakdown is kept', async () => {
    const { client } = make({ [`POST /campaigns/${CAMP}/compile`]: compile({ totalRecipients: 0, audience: { included: 0, excluded: { unsubscribed: 1 } }, warnings: undefined }) });
    const p = (await client.commsPreflightCampaign({ workspaceId: W1, id: CAMP })).preflight;
    assert.equal(p.hasRecipients, false); assert.deepEqual(p.warnings, []);
    assert.match(p.notes.join(' '), /no one would receive|nobody would receive|no recipients/i);
    assert.deepEqual(p.audience, { included: 0, excluded: { unsubscribed: 1 } });
  });
  test('a finished campaign is refused by the API and the agent sees it; a bad id is refused locally', async () => {
    const { client, calls } = make({ [`POST /campaigns/${CAMP}/compile`]: json(409, { success: false, error: 'A completed campaign cannot be compiled', code: 'INVALID_STATE' }) });
    await assert.rejects(() => client.commsPreflightCampaign({ workspaceId: W1, id: CAMP }), (e) => e.status === 409 && e.data.code === 'INVALID_STATE');
    await assert.rejects(() => client.commsPreflightCampaign({ workspaceId: W1, id: 'x' }), (e) => e.data.code === 'INVALID_ID');
    assert.equal(calls.length, 1);
  });
});

describe('comms_send_test (the account owner only)', () => {
  const tplReply = ok({ id: TPL, subject: 'Autumn news' });
  test('dry run says what would be sent and to whom (the account owner, nobody else) and sends nothing', async () => {
    const { client, calls } = make({ [`GET /campaigns/${CAMP}`]: ok(CAMPAIGN), [`GET /templates/${TPL}`]: tplReply });
    const out = await client.commsSendTest({ workspaceId: W1, id: CAMP });
    assert.equal(out.applied, false); assert.match(out.would_send.to, /account owner/i); assert.equal(out.would_send.subject, 'Autumn news'); assert.equal(out.would_send.from, 'news@hatfree.com');
    assert.equal(writes(calls).length, 0);
  });
  test('a real test is one POST; the owner\'s address comes back MASKED and the answer says it went to the owner only', async () => {
    const { client, calls } = make({ [`POST /campaigns/${CAMP}/test-send`]: ok({ sent_to: 'owner@example.com', subject: '[TEST] Autumn news', warnings: [] }) });
    const out = await client.commsSendTest({ workspaceId: W1, id: CAMP, dryRun: false, sample: { name: 'Ada' } });
    assert.equal(out.applied, true); assert.equal(out.sent_to, 'o***@example.com');
    assert.doesNotMatch(JSON.stringify(out), FULL_EMAIL);
    assert.match(out.note, /account owner/i); assert.match(out.note, /no one else|nobody else|only/i);
    assert.equal(writes(calls).length, 1); assert.deepEqual(calls[0].body, { sample: { name: 'Ada' } });
  });
  test('extra arguments that look like a recipient are never sent anywhere', async () => {
    const { client, calls } = make({ [`POST /campaigns/${CAMP}/test-send`]: ok({ sent_to: 'owner@example.com', subject: 'S', warnings: [] }) });
    await client.commsSendTest({ workspaceId: W1, id: CAMP, dryRun: false, to: 'victim@example.com', recipient: 'victim@example.com', email: 'victim@example.com', sample: { name: 'Ada', email: 'victim@example.com' } });
    const text = JSON.stringify(calls[0].body);
    assert.ok(!text.includes('victim')); assert.deepEqual(calls[0].body, { sample: { name: 'Ada' } });
  });
  test('the rate limit is reported with its wait time and is never retried', async () => {
    const { client, calls } = make({ [`POST /campaigns/${CAMP}/test-send`]: json(429, { success: false, error: 'Test send limit reached: at most 5 test sends per campaign per hour', code: 'TEST_SEND_LIMIT', retryAfter: 1800 }) });
    await assert.rejects(() => client.commsSendTest({ workspaceId: W1, id: CAMP, dryRun: false }), (e) => e.status === 429 && e.data.code === 'TEST_SEND_LIMIT' && e.data.retryAfter === 1800 && /limit/i.test(e.message));
    assert.equal(calls.length, 1);
  });
  test('an error that mentions the owner\'s address is masked', async () => {
    const { client } = make({ [`POST /campaigns/${CAMP}/test-send`]: json(409, { success: false, error: 'No verified email for owner@example.com', code: 'TEST_RECIPIENT_UNAVAILABLE' }) });
    await assert.rejects(() => client.commsSendTest({ workspaceId: W1, id: CAMP, dryRun: false }), (e) => !FULL_EMAIL.test(e.message) && !FULL_EMAIL.test(JSON.stringify(e.data)));
  });
});

describe('across the family', () => {
  test('no request body of any tool ever carries a schedule, timezone, pacing or status field, and no path is /schedule or /cancel', async () => {
    const reply = () => ok({ id: CAMP, template_id: TPL, status: 'draft', version: 1, totalRecipients: 1, audience: {}, forecast: {}, sent_to: 'owner@example.com', subject: 'S', name: 'n', subject_suggestion: 's' }, { previous: {}, dry_run: true });
    const table = { 'POST /campaigns': reply, [`PATCH /campaigns/${CAMP}/settings`]: reply, [`GET /campaigns/${CAMP}`]: reply, [`GET /templates/${TPL}`]: reply, [`POST /campaigns/${CAMP}/duplicate`]: reply, [`POST /campaigns/${CAMP}/compile`]: reply, [`POST /campaigns/${CAMP}/test-send`]: reply };
    const { client, calls } = make(table);
    for (const dryRun of [true, false]) {
      await client.commsCreateCampaign({ workspaceId: W1, name: 'n', templateId: TPL, motorBlockId: BLOCK, listIds: [L1], description: DESC, dryRun });
      await client.commsUpdateCampaign({ workspaceId: W1, id: CAMP, description: DESC, fromName: 'x', replyTo: null, templateId: TPL, listIds: [L1], excludeListIds: [], dryRun });
      await client.commsDuplicateCampaign({ workspaceId: W1, id: CAMP, dryRun });
      await client.commsSendTest({ workspaceId: W1, id: CAMP, dryRun });
    }
    await client.commsPreflightCampaign({ workspaceId: W1, id: CAMP });
    assert.ok(calls.length > 10);
    for (const c of calls) {
      assert.ok(!hasForbidden(c.body), `${c.key} ${JSON.stringify(c.body)}`);
      assert.doesNotMatch(c.path, /\/(schedule|cancel|restore)/);
      assert.notEqual(c.method, 'DELETE');
    }
  });
  test('scopes: a read-only grant and an audience-only grant are refused before any network call', async () => {
    for (const scopes of [['read:comms'], ['read:comms', 'write:comms.audience']]) {
      const { client, calls } = make({}, scopes);
      await assert.rejects(() => client.commsCreateCampaign({ workspaceId: W1, name: 'n', templateId: TPL, motorBlockId: BLOCK, listIds: [L1], description: DESC }));
      await assert.rejects(() => client.commsSendTest({ workspaceId: W1, id: CAMP }));
      await assert.rejects(() => client.commsPreflightCampaign({ workspaceId: W1, id: CAMP }));
      assert.equal(calls.length, 0);
    }
  });
});

describe('comms_preflight_campaign carries the workspace settings', () => {
  const settings = { summary: 'Click counts as consent: on. Open tracking: off. Unsubscribe: after unsubscribing people see the shared Motorical page.', warnings: [{ type: 'click_consent_on', message: 'Click counts as consent is ON' }, { type: 'open_tracking_off', message: 'Open tracking is OFF' }] };
  const compile = ok({ version: 3, totalRecipients: 10, audience: { included: 10 }, forecast: {}, warnings: [{ type: 'daily_cap', message: 'Waits' }], settings });
  test('settings warnings come first, the block is returned, and the notes say the person decides', async () => {
    const { client } = make({ [`POST /campaigns/${CAMP}/compile`]: compile });
    const p = (await client.commsPreflightCampaign({ workspaceId: W1, id: CAMP })).preflight;
    assert.deepEqual(p.warnings.map((w) => w.type), ['click_consent_on', 'open_tracking_off', 'daily_cap']);
    assert.equal(p.settings.summary, settings.summary);
    const notes = p.notes.join(' ');
    assert.match(notes, /Settings in force: Click counts as consent: on/); assert.match(notes, /set by the person/i); assert.match(notes, /workspace settings makes this stale/i);
  });
});
