// The send tools of the Communications MCP (M3-5): schedule and cancel, both send:comms.campaign. This is the step that actually emails people, so
// every refusal here must happen BEFORE any real write: a dry run first (the default), a summary with the exact numbers and time, a signed token
// bound to that exact preview, an explicit confirm:true, a preflight that is the same state, and a time that is explicit and in the future.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createDelegatedClient } from '../src/delegatedClient.js';
import { SERVERS, TOOL_ROUTES, HOSTED_ONLY_TOOLS } from '../src/servers.js';
import { TOOLS } from '../src/registry.js';
import { COMMS_SEND_TOOLS } from '../src/commsSendTools.js';
import { TOOL_SCOPES, SERVER_TOOLS } from '@motorical/scope-catalog';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const signer = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'k1' };
const server = SERVERS.find((s) => s.key === 'communications');
const W1 = '33333333-3333-4333-8333-333333333333';
const CAMP = '88888888-8888-4888-8888-888888888888';
const TPL = '55555555-5555-4555-8555-555555555555';
const ALL = ['read:comms', 'write:comms.content', 'write:comms.audience', 'send:comms.campaign'];
const claimsFor = (grantId, scopes = ALL) => ({ grantId, userId: '22222222-2222-4222-8222-222222222222', scopes, motorBlockIds: [] });
const G1 = '11111111-1111-4111-8111-111111111111';
const G2 = '12121212-1212-4212-8212-121212121212';
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const ok = (data, extra = {}) => json(200, { success: true, data, ...extra });
const BASE = 'http://comms.test/api';
const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

const make = (table, { grantId = G1, scopes } = {}) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = url.slice(BASE.length);
    const key = `${init.method} ${path}`;
    calls.push({ key, method: init.method, path, init, body: init.body ? JSON.parse(init.body) : undefined });
    const hit = Object.entries(table).find(([k]) => k === key || (k.endsWith('*') && key.startsWith(k.slice(0, -1))));
    if (!hit) throw new Error(`unexpected call: ${key}`);
    return typeof hit[1] === 'function' ? hit[1](init, path) : hit[1];
  };
  const client = createDelegatedClient({ claims: claimsFor(grantId, scopes), server, signer, apiBaseUrl: 'http://backend.test', commsBaseUrl: BASE, fetchImpl });
  return { client, calls };
};
const realSchedules = (calls) => calls.filter((c) => c.method === 'POST' && /\/schedule$/.test(c.path) && !(c.body && c.body.dry_run === true));
const cancels = (calls) => calls.filter((c) => /\/cancel$/.test(c.path));

const AT = '2030-01-15T09:00'; const AT_UTC = '2030-01-15T07:00:00.000Z'; const TZ = 'Europe/Riga';
const dryReply = (over = {}) => ok({ id: CAMP, status: 'draft', would_become: 'scheduled', scheduled_at: AT_UTC, timezone: TZ, send_immediately: false, total_recipients: 842, audience: { included: 842 }, artifact_version: 4, from_address: 'news@hatfree.com', forecast: { estimated_completion_at: '2030-01-15T09:30:00Z' }, warnings: [{ type: 'daily_cap', message: 'Waits for the daily limit' }], preflight: { expected_version: 3, matches: true }, ...over }, { dry_run: true });
const realReply = ok({ id: CAMP, status: 'scheduled', scheduled_at: '2030-01-15T07:00:00Z', total_recipients: 842, artifact_version: 5, from_address: 'news@hatfree.com' }, { message: 'Campaign scheduled' });
const tableFor = (over = {}) => ({
  [`GET /campaigns/${CAMP}`]: ok({ id: CAMP, name: 'Autumn promo', status: 'draft', template_id: TPL, from_address: 'news@hatfree.com' }),
  [`GET /templates/${TPL}`]: ok({ id: TPL, subject: 'Autumn news' }),
  [`POST /campaigns/${CAMP}/schedule`]: (init) => (JSON.parse(init.body).dry_run === true ? dryReply() : realReply),
  [`POST /campaigns/${CAMP}/cancel`]: ok({ id: CAMP, status: 'cancelled' }, { message: 'Campaign cancelled' }),
  ...over,
});
const base = { workspaceId: W1, id: CAMP, preflightVersion: 3, sendAtLocal: AT, timezone: TZ };
const byName = (n) => TOOLS.find((t) => t.name === n);
const realDate = Date.now;
afterEach(() => { Date.now = realDate; });

describe('registration', () => {
  test('two tools, in the table, the catalogue and the registry, hosted-only', () => {
    assert.deepEqual(COMMS_SEND_TOOLS.map((t) => t.tool).sort(), ['comms_cancel_campaign', 'comms_schedule_campaign']);
    for (const n of ['comms_schedule_campaign', 'comms_cancel_campaign']) { assert.ok(SERVER_TOOLS.communications.includes(n), n); assert.ok(byName(n), n); assert.ok(HOSTED_ONLY_TOOLS.includes(n), n); assert.deepEqual(TOOL_SCOPES[n], ['send:comms.campaign'], n); }
  });
  test('the server now offers four scopes, but the FIRST consent is still the three (sending is a step-up)', () => {
    assert.deepEqual([...server.scopes].sort(), ['manage:comms.audience', 'manage:comms.webhooks', 'manage:comms.workspace', 'read:comms', 'send:comms.campaign', 'write:comms.audience', 'write:comms.content']);
    assert.deepEqual([...server.initialScopes].sort(), ['read:comms', 'write:comms.audience', 'write:comms.content']);
  });
  test('both are marked as consequential (destructive, open-world) so a client can warn', () => {
    for (const n of ['comms_schedule_campaign', 'comms_cancel_campaign']) { const t = byName(n); assert.equal(t.annotations.readOnlyHint, false, n); assert.equal(t.annotations.destructiveHint, true, n); assert.equal(t.annotations.openWorldHint, true, n); }
  });
  test('routes are the schedule and cancel routes; nothing else', () => {
    assert.equal(TOOL_ROUTES.comms_schedule_campaign.path, '/comm-api/api/campaigns/{id}/schedule');
    assert.equal(TOOL_ROUTES.comms_cancel_campaign.path, '/comm-api/api/campaigns/{id}/cancel');
    for (const r of COMMS_SEND_TOOLS) assert.equal(r.http, 'POST');
  });
  test('schedule takes only: workspace, campaign, preflight version, one way to say when, dryRun, confirm, token; no recipients, template, lists or pacing', () => {
    assert.deepEqual(Object.keys(byName('comms_schedule_campaign').inputSchema).sort(), ['confirm', 'confirmToken', 'dryRun', 'id', 'preflightVersion', 'sendAtLocal', 'sendAtUtc', 'timezone', 'workspaceId']);
  });
  test('schedule explains the whole procedure; cancel says it is final; cancel uses the existing native confirmation, schedule does not (a dry run must not prompt)', () => {
    const s = byName('comms_schedule_campaign').description;
    for (const re of [/dry run/i, /confirmToken/, /preflight/i, /yes/i, /15 minutes/i, /timezone/i]) assert.match(s, re);
    assert.match(byName('comms_cancel_campaign').description, /final/i);
    assert.equal(byName('comms_cancel_campaign').mrtr.confirmArg, 'confirm');
    assert.ok(!byName('comms_schedule_campaign').mrtr);
  });
  test('no tool can pause, delete or restore', () => assert.deepEqual(COMMS_SEND_TOOLS.filter((r) => /(pause|delete|restore)/i.test(r.tool)), []));
});

describe('comms_schedule_campaign: the preview (the default)', () => {
  test('asks the API for a dry run with the exact time, zone and preflight, and writes nothing', async () => {
    const { client, calls } = make(tableFor());
    const out = await client.commsScheduleCampaign(base);
    assert.equal(out.dryRun, true); assert.equal(out.applied, false);
    assert.equal(realSchedules(calls).length, 0);
    const dry = calls.find((c) => c.method === 'POST');
    assert.deepEqual(dry.body, { scheduled_at: AT_UTC, timezone: TZ, expected_preflight_version: 3, dry_run: true });
  });
  test('the summary gives the person everything: campaign, subject, sender, how many people, local time with weekday AND UTC, warnings before the forecast', async () => {
    const { client } = make(tableFor());
    const s = (await client.commsScheduleCampaign(base)).summary;
    assert.equal(s.campaign.name, 'Autumn promo'); assert.equal(s.subject, 'Autumn news'); assert.equal(s.from, 'news@hatfree.com'); assert.equal(s.people, 842);
    assert.match(s.sendsAt.local, /Tuesday/); assert.match(s.sendsAt.local, /15 January 2030/); assert.match(s.sendsAt.local, /09:00/); assert.equal(s.sendsAt.utc, AT_UTC); assert.equal(s.sendsAt.timezone, TZ);
    const keys = Object.keys(s); assert.ok(keys.indexOf('warnings') < keys.indexOf('forecast')); assert.equal(s.warnings[0].type, 'daily_cap');
  });
  test('it returns a confirmToken and tells the agent exactly what to do: read the summary out, get a clear yes, then call again', async () => {
    const { client } = make(tableFor());
    const out = await client.commsScheduleCampaign(base);
    assert.equal(typeof out.confirmToken, 'string'); assert.ok(out.confirmToken.length > 40);
    assert.match(out.nextStep, /yes/i); assert.match(out.nextStep, /confirm/i); assert.match(out.nextStep, /dryRun/); assert.ok(out.expiresInMinutes >= 10);
  });
  test('the preview of the same thing gives a token that still works, but a different thing a different token', async () => {
    const a = (await make(tableFor()).client.commsScheduleCampaign(base)).confirmToken;
    const b = (await make(tableFor()).client.commsScheduleCampaign({ ...base, sendAtLocal: '2030-01-15T10:00' })).confirmToken;
    assert.notEqual(a, b);
  });
  test('the time and the preflight are checked BEFORE any network call', async () => {
    const { client, calls } = make(tableFor());
    await assert.rejects(() => client.commsScheduleCampaign({ ...base, sendAtLocal: undefined }), (e) => e.data.code === 'SEND_TIME_REQUIRED');
    await assert.rejects(() => client.commsScheduleCampaign({ ...base, timezone: undefined }), (e) => e.data.code === 'TIMEZONE_REQUIRED');
    await assert.rejects(() => client.commsScheduleCampaign({ ...base, sendAtLocal: '2020-01-01T09:00' }), (e) => e.data.code === 'SEND_TIME_IN_PAST');
    await assert.rejects(() => client.commsScheduleCampaign({ ...base, sendAtLocal: '2031-03-30T03:30', timezone: TZ }), (e) => e.data.code === 'LOCAL_TIME_DOES_NOT_EXIST');
    await assert.rejects(() => client.commsScheduleCampaign({ ...base, preflightVersion: undefined }), (e) => e.data.code === 'PREFLIGHT_REQUIRED');
    await assert.rejects(() => client.commsScheduleCampaign({ ...base, preflightVersion: 0 }), (e) => e.data.code === 'PREFLIGHT_REQUIRED');
    await assert.rejects(() => client.commsScheduleCampaign({ ...base, id: 'x' }), (e) => e.data.code === 'INVALID_ID');
    assert.equal(calls.length, 0);
  });
  test('sendAtUtc works as the other form', async () => {
    const { client, calls } = make(tableFor());
    await client.commsScheduleCampaign({ workspaceId: W1, id: CAMP, preflightVersion: 3, sendAtUtc: AT_UTC, timezone: TZ });
    assert.equal(calls.find((c) => c.method === 'POST').body.scheduled_at, AT_UTC);
  });
  test('API refusals on the preview reach the agent with their codes and details', async () => {
    for (const [status, body, test2] of [
      [409, { success: false, error: 'stale', code: 'PREFLIGHT_STALE', changes: [{ code: 'recipients_changed', from: 842, to: 790 }] }, (e) => e.data.changes[0].to === 790],
      [429, { success: false, error: 'limit', code: 'AGENT_SCHEDULE_LIMIT', retryAfter: 3600 }, (e) => e.data.retryAfter === 3600],
      [400, { success: false, error: 'soon', code: 'AGENT_SEND_TOO_SOON' }, () => true],
      [400, { success: false, error: 'empty', code: 'EMPTY_AUDIENCE', audience: { included: 0 } }, () => true],
    ]) {
      const { client } = make(tableFor({ [`POST /campaigns/${CAMP}/schedule`]: json(status, body) }));
      await assert.rejects(() => client.commsScheduleCampaign(base), (e) => e.status === status && e.data.code === body.code && test2(e));
    }
  });
});

describe('comms_schedule_campaign: the real thing', () => {
  const preview = async (client) => (await client.commsScheduleCampaign(base)).confirmToken;
  const real = (over = {}) => ({ ...base, dryRun: false, confirm: true, ...over });

  test('without confirm:true, or without a token, it is refused before any network call', async () => {
    const { client, calls } = make(tableFor());
    await assert.rejects(() => client.commsScheduleCampaign({ ...base, dryRun: false }), (e) => e.data.code === 'CONFIRMATION_REQUIRED');
    await assert.rejects(() => client.commsScheduleCampaign({ ...base, dryRun: false, confirm: true }), (e) => e.data.code === 'CONFIRM_TOKEN_REQUIRED');
    await assert.rejects(() => client.commsScheduleCampaign({ ...base, dryRun: false, confirm: 'yes', confirmToken: 'x' }), (e) => e.data.code === 'CONFIRMATION_REQUIRED');
    assert.equal(calls.length, 0);
  });
  test('with the token of the SAME preview it schedules once: the API dry run, then one real POST with the time, zone, preflight and an idempotency key', async () => {
    const { client, calls } = make(tableFor());
    const token = await preview(client);
    const out = await client.commsScheduleCampaign(real({ confirmToken: token }));
    assert.equal(out.applied, true); assert.equal(out.scheduled.status, 'scheduled');
    const w = realSchedules(calls);
    assert.equal(w.length, 1);
    assert.deepEqual(w[0].body, { scheduled_at: AT_UTC, timezone: TZ, expected_preflight_version: 3 });
    assert.match(w[0].init.headers['Idempotency-Key'], KEY_RE);
    assert.match(out.note, /owner/i); assert.match(out.note, /cancel/i);
  });
  test('the key is stable for the same intended action (a retry never schedules twice) whatever the token', async () => {
    const keyOf = async () => { const { client, calls } = make(tableFor()); const t = await preview(client); await client.commsScheduleCampaign(real({ confirmToken: t })); return realSchedules(calls)[0].init.headers['Idempotency-Key']; };
    assert.equal(await keyOf(), await keyOf());
  });
  test('a token from a DIFFERENT preview (another time) is refused, and nothing is scheduled', async () => {
    const { client, calls } = make(tableFor());
    const other = (await client.commsScheduleCampaign({ ...base, sendAtLocal: '2030-01-15T10:00' })).confirmToken;
    await assert.rejects(() => client.commsScheduleCampaign(real({ confirmToken: other })), (e) => e.data.code === 'CONFIRM_TOKEN_INVALID');
    assert.equal(realSchedules(calls).length, 0);
  });
  test('the numbers changed between the preview and the confirmation (842 -> 790): the token no longer fits, the person must see the new numbers', async () => {
    let n = 842;
    const { client, calls } = make(tableFor({ [`POST /campaigns/${CAMP}/schedule`]: (init) => (JSON.parse(init.body).dry_run === true ? dryReply({ total_recipients: n }) : realReply) }));
    const token = await preview(client);
    n = 790;
    await assert.rejects(() => client.commsScheduleCampaign(real({ confirmToken: token })), (e) => e.data.code === 'CONFIRM_TOKEN_INVALID' && /preview/i.test(e.message));
    assert.equal(realSchedules(calls).length, 0);
  });
  test('a token from another connection is refused', async () => {
    const a = make(tableFor(), { grantId: G1 }); const b = make(tableFor(), { grantId: G2 });
    const token = await preview(a.client);
    await assert.rejects(() => b.client.commsScheduleCampaign(real({ confirmToken: token })), (e) => e.data.code === 'CONFIRM_TOKEN_INVALID');
    assert.equal(realSchedules(b.calls).length, 0);
  });
  test('a token expires (15 minutes)', async () => {
    const { client, calls } = make(tableFor());
    const token = await preview(client);
    const t0 = Date.now(); Date.now = () => t0 + 16 * 60 * 1000;
    await assert.rejects(() => client.commsScheduleCampaign(real({ confirmToken: token })), (e) => e.data.code === 'CONFIRM_TOKEN_INVALID');
    assert.equal(realSchedules(calls).length, 0);
  });
  test('a made-up token is refused', async () => {
    const { client, calls } = make(tableFor());
    await assert.rejects(() => client.commsScheduleCampaign(real({ confirmToken: 'AAAA-not-a-token-AAAA' })), (e) => e.data.code === 'CONFIRM_TOKEN_INVALID');
    assert.equal(realSchedules(calls).length, 0);
  });
  test('if the API then says the preflight is stale (the template changed in between), that reaches the agent and nothing is scheduled', async () => {
    const { client } = make(tableFor({ [`POST /campaigns/${CAMP}/schedule`]: (init) => (JSON.parse(init.body).dry_run === true ? dryReply() : json(409, { success: false, error: 'stale', code: 'PREFLIGHT_STALE', changes: [{ code: 'content_changed' }] })) }));
    const token = await preview(client);
    await assert.rejects(() => client.commsScheduleCampaign(real({ confirmToken: token })), (e) => e.status === 409 && e.data.code === 'PREFLIGHT_STALE' && e.data.changes[0].code === 'content_changed');
  });
});

describe('comms_cancel_campaign', () => {
  test('without confirm:true it is refused with a plain explanation, before any network call', async () => {
    const { client, calls } = make(tableFor());
    await assert.rejects(() => client.commsCancelCampaign({ workspaceId: W1, id: CAMP }), (e) => e.data.code === 'CONFIRMATION_REQUIRED' && /final/i.test(e.message));
    assert.equal(calls.length, 0);
  });
  test('with confirm:true it reads the campaign, cancels once, and says it is final', async () => {
    const { client, calls } = make(tableFor({ [`GET /campaigns/${CAMP}`]: ok({ id: CAMP, name: 'Autumn promo', status: 'scheduled' }) }));
    const out = await client.commsCancelCampaign({ workspaceId: W1, id: CAMP, confirm: true });
    assert.equal(out.applied, true); assert.equal(out.status, 'cancelled'); assert.equal(cancels(calls).length, 1);
    assert.match(out.note, /final/i); assert.match(out.note, /duplicate/i); assert.match(out.note, /nothing had been sent|had not started/i);
  });
  test('cancelling a campaign that is already sending says that mail already sent cannot be recalled', async () => {
    const { client } = make(tableFor({ [`GET /campaigns/${CAMP}`]: ok({ id: CAMP, name: 'Autumn promo', status: 'sending' }) }));
    const out = await client.commsCancelCampaign({ workspaceId: W1, id: CAMP, confirm: true });
    assert.match(out.note, /already sent/i); assert.match(out.note, /cannot be recalled/i);
  });
  test('a finished or already-cancelled campaign is refused by the API and the agent sees it', async () => {
    const { client } = make(tableFor({ [`POST /campaigns/${CAMP}/cancel`]: json(409, { success: false, error: 'The campaign has already finished or was cancelled', code: 'INVALID_STATE' }) }));
    await assert.rejects(() => client.commsCancelCampaign({ workspaceId: W1, id: CAMP, confirm: true }), (e) => e.status === 409 && e.data.code === 'INVALID_STATE');
  });
  test('a bad id is refused locally', async () => {
    const { client, calls } = make(tableFor());
    await assert.rejects(() => client.commsCancelCampaign({ workspaceId: W1, id: 'x', confirm: true }), (e) => e.data.code === 'INVALID_ID');
    assert.equal(calls.length, 0);
  });
});

describe('scopes and the whole family', () => {
  test('a grant without send:comms.campaign cannot schedule or cancel, even with every other scope; nothing is called', async () => {
    const { client, calls } = make(tableFor(), { scopes: ['read:comms', 'write:comms.content', 'write:comms.audience'] });
    await assert.rejects(() => client.commsScheduleCampaign(base));
    await assert.rejects(() => client.commsCancelCampaign({ workspaceId: W1, id: CAMP, confirm: true }));
    assert.equal(calls.length, 0);
  });
  test('no request body of either tool ever carries recipients, a template, lists, contacts or pacing', async () => {
    const { client, calls } = make(tableFor());
    const t = (await client.commsScheduleCampaign(base)).confirmToken;
    await client.commsScheduleCampaign({ ...base, dryRun: false, confirm: true, confirmToken: t });
    await client.commsCancelCampaign({ workspaceId: W1, id: CAMP, confirm: true });
    const allowed = new Set(['scheduled_at', 'timezone', 'expected_preflight_version', 'dry_run']);
    for (const c of calls.filter((x) => x.body)) for (const k of Object.keys(c.body)) assert.ok(allowed.has(k), `${c.key} sent ${k}`);
  });
});

describe('workspace settings in the schedule summary', () => {
  const SETTINGS_A = { click_consent: { enabled: false, source: 'workspace' }, summary: 'Click counts as consent: off. Open tracking: on. Unsubscribe: after unsubscribing people see the shared Motorical page.', warnings: [] };
  const SETTINGS_B = { ...SETTINGS_A, click_consent: { enabled: true, source: 'workspace' }, summary: 'Click counts as consent: on. Open tracking: on. Unsubscribe: after unsubscribing people see the shared Motorical page.', warnings: [{ type: 'click_consent_on', message: 'Click counts as consent is ON' }] };
  const withSettings = (settings) => tableFor({ [`POST /campaigns/${CAMP}/schedule`]: (init) => (JSON.parse(init.body).dry_run === true ? dryReply({ settings }) : ok({ id: CAMP, status: 'scheduled', scheduled_at: '2030-01-15T07:00:00Z', total_recipients: 842, artifact_version: 5, from_address: 'news@hatfree.com', settings }, { message: 'Campaign scheduled' })) });
  test('the summary carries the settings, and their warnings come before the other warnings', async () => {
    const out = await make(withSettings(SETTINGS_B)).client.commsScheduleCampaign(base);
    assert.equal(out.summary.settings.summary, SETTINGS_B.summary);
    assert.deepEqual(out.summary.warnings.map((w) => w.type), ['click_consent_on', 'daily_cap']);
    assert.match(out.nextStep, /settings sentence/i);
  });
  test('a setting that changed between the preview and the yes voids the confirmation', async () => {
    const token = (await make(withSettings(SETTINGS_A)).client.commsScheduleCampaign(base)).confirmToken;
    const later = make(withSettings(SETTINGS_B));
    await assert.rejects(() => later.client.commsScheduleCampaign({ ...base, dryRun: false, confirm: true, confirmToken: token }), (e) => e.data.code === 'CONFIRM_TOKEN_INVALID');
    assert.equal(realSchedules(later.calls).length, 0, 'nothing was scheduled');
    const same = make(withSettings(SETTINGS_A));
    const done = await same.client.commsScheduleCampaign({ ...base, dryRun: false, confirm: true, confirmToken: token });
    assert.equal(done.applied, true); assert.equal(done.scheduled.settings, SETTINGS_A.summary);
  });
});
