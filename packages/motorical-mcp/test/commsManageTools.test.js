// The management tools of the Communications MCP (M3-7): two settings/webhook reads (read:comms), four workspace tools (manage:comms.workspace) and
// three webhook tools (manage:comms.webhooks). Every write is a dry run by default; changing where a webhook sends its events needs a confirmed
// preview (a signed token) because campaign events carry recipient addresses; a webhook URL is never shown beyond its host; the default workspace
// and the signing secret are never an assistant's (plan: motorical-docs plans/2026-10-27-comms-mcp-m3-7-workspace-and-webhooks.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createDelegatedClient } from '../src/delegatedClient.js';
import { SERVERS, TOOL_ROUTES, HOSTED_ONLY_TOOLS } from '../src/servers.js';
import { TOOLS } from '../src/registry.js';
import { COMMS_MANAGE_TOOLS } from '../src/commsManageTools.js';
import { TOOL_SCOPES, SERVER_TOOLS } from '@motorical/scope-catalog';
import { FULL_EMAIL } from '../src/commsMask.js';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const signer = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'k1' };
const server = SERVERS.find((s) => s.key === 'communications');
const W1 = '33333333-3333-4333-8333-333333333333';
const W2 = '44444444-4444-4444-8444-444444444444';
const WID = '77777777-7777-4777-8777-777777777777';
const DOMAIN = '55555555-5555-4555-8555-555555555555';
const BLOCK = '66666666-6666-4666-8666-666666666666';
const ALL = ['read:comms', 'manage:comms.workspace', 'manage:comms.webhooks'];
const G1 = '11111111-1111-4111-8111-111111111111';
const G2 = '12121212-1212-4212-8212-121212121212';
const claimsFor = (grantId, scopes) => ({ grantId, userId: '22222222-2222-4222-8222-222222222222', scopes, motorBlockIds: [] });
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const ok = (data, extra = {}) => json(200, { success: true, data, ...extra });
const BASE = 'http://comms.test/api';
const NAMES = {
  reads: ['comms_get_workspace_settings', 'comms_list_webhooks'],
  workspace: ['comms_create_workspace', 'comms_update_workspace', 'comms_update_workspace_settings', 'comms_add_sending_identity'],
  webhooks: ['comms_update_webhook', 'comms_delete_webhook', 'comms_test_webhook'],
};
const ALL_NAMES = [...NAMES.reads, ...NAMES.workspace, ...NAMES.webhooks];

const make = (table, { scopes = ALL, grantId = G1 } = {}) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = url.slice(BASE.length);
    const key = `${init.method} ${path}`;
    calls.push({ key, method: init.method, path, init, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    const hit = Object.entries(table).find(([k]) => k === key || (k.endsWith('*') && key.startsWith(k.slice(0, -1))));
    if (!hit) throw new Error(`unexpected call: ${key}`);
    return typeof hit[1] === 'function' ? hit[1](init, path) : hit[1];
  };
  const client = createDelegatedClient({ claims: claimsFor(grantId, scopes), server, signer, apiBaseUrl: 'http://backend.test', commsBaseUrl: BASE, fetchImpl });
  return { client, calls };
};
const writesOf = (calls) => calls.filter((c) => c.method !== 'GET');
const byName = (n) => TOOLS.find((t) => t.name === n);

const URL_OLD = 'https://old.example.com/services/T0/B0/SECRETPATH?token=AAA';
const URL_NEW = 'https://new.example.com/hook/NEWSECRET?token=BBB';
const hook = (over = {}) => ({ id: WID, url: URL_OLD, events: ['message.bounced'], enabled: true, failure_count: 0, created_at: '2026-10-01T10:00:00Z', last_delivery_status: 'delivered', ...over });
const webhooksTable = (over = {}) => ({ [`GET /workspaces/${W1}/webhooks`]: ok([hook()]), ...over });

describe('registration', () => {
  test('nine tools: two reads (read:comms), four workspace tools, three webhook tools; hosted-only, in the catalogue and the registry', () => {
    assert.deepEqual(COMMS_MANAGE_TOOLS.map((t) => t.tool).sort(), [...ALL_NAMES].sort());
    for (const n of ALL_NAMES) { assert.ok(SERVER_TOOLS.communications.includes(n), n); assert.ok(byName(n), n); assert.ok(HOSTED_ONLY_TOOLS.includes(n), n); assert.ok(TOOL_ROUTES[n], n); }
    for (const n of NAMES.reads) assert.deepEqual(TOOL_SCOPES[n], ['read:comms'], n);
    for (const n of NAMES.workspace) assert.deepEqual(TOOL_SCOPES[n], ['manage:comms.workspace'], n);
    for (const n of NAMES.webhooks) assert.deepEqual(TOOL_SCOPES[n], ['manage:comms.webhooks'], n);
  });
  test('reads are read-only; writes are not; delete is marked destructive', () => {
    for (const n of NAMES.reads) assert.equal(byName(n).annotations.readOnlyHint, true, n);
    for (const n of [...NAMES.workspace, ...NAMES.webhooks]) assert.equal(byName(n).annotations.readOnlyHint, false, n);
    assert.equal(byName('comms_delete_webhook').annotations.destructiveHint, true);
  });
  test('the server now offers six scopes, but the FIRST consent is still the three (managing is a step-up, like sending)', () => {
    assert.deepEqual([...server.scopes].sort(), ['manage:comms.audience', 'manage:comms.webhooks', 'manage:comms.workspace', 'read:comms', 'send:comms.campaign', 'write:comms.audience', 'write:comms.content']);
    assert.deepEqual([...server.initialScopes].sort(), ['read:comms', 'write:comms.audience', 'write:comms.content']);
  });
  test('what an assistant must never have: no create-webhook tool, no default-workspace input, no replace/remove of sending identities, no secret input', () => {
    const names = TOOLS.map((t) => t.name);
    assert.ok(!names.includes('comms_create_webhook'));
    assert.ok(!names.some((n) => /(delete_workspace|set_default|remove_sending|replace_sending|rotate|secret)/i.test(n)), names.filter((n) => /workspace|webhook|sending/.test(n)).join());
    for (const n of ['comms_update_workspace', 'comms_create_workspace']) assert.ok(!('isDefault' in byName(n).inputSchema) && !('is_default' in byName(n).inputSchema), n);
  });
});

describe('scope and id checks come before any network call', () => {
  test('a grant without the manage scopes cannot use the manage tools (read:comms does not imply them)', async () => {
    const { client, calls } = make({}, { scopes: ['read:comms'] });
    await assert.rejects(() => client.commsCreateWorkspace({ name: 'x' }));
    await assert.rejects(() => client.commsUpdateWebhook({ workspaceId: W1, webhookId: WID, enabled: false }));
    assert.equal(calls.length, 0);
  });
  test('a workspace-only grant cannot touch webhooks and a webhooks-only grant cannot touch workspaces', async () => {
    const a = make({}, { scopes: ['read:comms', 'manage:comms.workspace'] });
    await assert.rejects(() => a.client.commsDeleteWebhook({ workspaceId: W1, webhookId: WID, confirm: true, dryRun: false }));
    const b = make({}, { scopes: ['read:comms', 'manage:comms.webhooks'] });
    await assert.rejects(() => b.client.commsCreateWorkspace({ name: 'x' }));
    assert.equal(a.calls.length + b.calls.length, 0);
  });
  test('bad ids are refused', async () => {
    const { client, calls } = make({});
    await assert.rejects(() => client.commsUpdateWebhook({ workspaceId: W1, webhookId: 'nope', enabled: false }), (e) => e.data.code === 'INVALID_ID');
    await assert.rejects(() => client.commsAddSendingIdentity({ workspaceId: W1, domainId: 'nope' }), (e) => e.data.code === 'INVALID_ID');
    await assert.rejects(() => client.commsUpdateWorkspace({ id: 'nope', name: 'x' }), (e) => e.data.code === 'INVALID_ID');
    assert.equal(calls.length, 0);
  });
});

describe('comms_get_workspace_settings', () => {
  test('reads the three settings of one workspace (account-level routes, no tenant header)', async () => {
    const { client, calls } = make({
      [`GET /workspaces/${W1}/settings/consent`]: ok({ click_consent_enabled: true }),
      [`GET /workspaces/${W1}/settings/open-tracking`]: ok({ open_tracking_enabled: false }),
      [`GET /workspaces/${W1}/settings/unsubscribe`]: ok({ unsubscribe_landing_url: 'https://shop.example/bye' }),
    });
    const r = await client.commsGetWorkspaceSettings({ workspaceId: W1 });
    assert.deepEqual(r.data, { click_consent_enabled: true, open_tracking_enabled: false, unsubscribe_landing_url: 'https://shop.example/bye' });
    assert.equal(calls.length, 3); assert.ok(calls.every((c) => !c.headers['X-Tenant-Id']));
  });
});

describe('comms_list_webhooks', () => {
  test('lists endpoints with only the host of each URL (no path, no query), events, state and last delivery; never a secret', async () => {
    const { client, calls } = make(webhooksTable({ [`GET /workspaces/${W1}/webhooks`]: ok([hook(), hook({ id: W2, url: 'https://x.example/a?b=c', enabled: false, failure_count: 3 })]) }));
    const r = await client.commsListWebhooks({ workspaceId: W1 });
    assert.equal(calls[0].headers['X-Tenant-Id'], W1);
    assert.equal(r.data[0].url, 'https://old.example.com/...'); assert.equal(r.data[1].url, 'https://x.example/...');
    const s = JSON.stringify(r); assert.doesNotMatch(s, /SECRETPATH|AAA|secret"/i); assert.equal(r.data[1].failure_count, 3);
  });
});

describe('comms_create_workspace', () => {
  const listed = (names) => ok(names.map((n, i) => ({ id: i ? W2 : W1, name: n, slug: n.toLowerCase(), isDefault: i === 0, status: 'active' })));
  test('dry run is the default: shows what would be created and the owner email, creates nothing', async () => {
    const { client, calls } = make({ 'GET /workspaces': listed(['Shop']) });
    const r = await client.commsCreateWorkspace({ name: 'Second brand' });
    assert.equal(r.dryRun, true); assert.equal(r.applied, false); assert.equal(r.would_create.name, 'Second brand');
    assert.match(r.note, /emailed/i); assert.equal(writesOf(calls).length, 0);
  });
  test('a name that already exists is reported, not created again', async () => {
    const { client, calls } = make({ 'GET /workspaces': listed(['Shop', 'Second brand']) });
    const r = await client.commsCreateWorkspace({ name: ' second BRAND ' });
    assert.equal(r.alreadyExists, true); assert.equal(r.existing.id, W2); assert.equal(writesOf(calls).length, 0);
  });
  test('the real call posts the name (and slug) and reports the new workspace, with what comes next', async () => {
    const { client, calls } = make({ 'GET /workspaces': listed(['Shop']), 'POST /workspaces': json(201, { success: true, data: { id: W2, name: 'Second brand', slug: 'second-brand', isDefault: false, status: 'active' } }) });
    const r = await client.commsCreateWorkspace({ name: 'Second brand', dryRun: false });
    assert.equal(r.applied, true); assert.equal(r.data.id, W2);
    assert.deepEqual(writesOf(calls)[0].body, { name: 'Second brand' });
    assert.match(r.nextStep, /comms_add_sending_identity/);
  });
  test('if the service says the name exists (a retry), that is success with the existing workspace', async () => {
    const { client } = make({ 'GET /workspaces': listed(['Shop']), 'POST /workspaces': json(409, { success: false, error: 'exists', code: 'WORKSPACE_NAME_EXISTS', existing: { id: W2, name: 'Second brand' } }) });
    const r = await client.commsCreateWorkspace({ name: 'Second brand', dryRun: false });
    assert.equal(r.alreadyExists, true); assert.equal(r.existing.id, W2);
  });
  test('an empty name is refused before the network; the workspace limit surfaces as an error the agent can read', async () => {
    const a = make({}); await assert.rejects(() => a.client.commsCreateWorkspace({ name: '   ' }), (e) => e.data.code === 'MISSING_NAME'); assert.equal(a.calls.length, 0);
    const b = make({ 'GET /workspaces': listed(['Shop']), 'POST /workspaces': json(400, { success: false, error: 'limit', code: 'WORKSPACE_LIMIT' }) });
    await assert.rejects(() => b.client.commsCreateWorkspace({ name: 'x', dryRun: false }), (e) => e.data.code === 'WORKSPACE_LIMIT');
  });
});

describe('comms_update_workspace', () => {
  const list = ok([{ id: W1, name: 'Shop', slug: 'shop', isDefault: true, status: 'active' }]);
  test('dry run shows the before and after; the real call patches only name and slug', async () => {
    const { client, calls } = make({ 'GET /workspaces': list, [`PATCH /workspaces/${W1}`]: ok({ id: W1, name: 'Shop UK', slug: 'shop', isDefault: true, status: 'active' }) });
    const dry = await client.commsUpdateWorkspace({ id: W1, name: 'Shop UK' });
    assert.equal(dry.applied, false); assert.equal(dry.previous.name, 'Shop'); assert.equal(dry.changes.name, 'Shop UK'); assert.equal(writesOf(calls).length, 0);
    const real = await client.commsUpdateWorkspace({ id: W1, name: 'Shop UK', dryRun: false });
    assert.equal(real.applied, true); assert.deepEqual(writesOf(calls)[0].body, { name: 'Shop UK' });
  });
  test('nothing to change is refused; an unknown workspace is not found', async () => {
    const a = make({ 'GET /workspaces': list });
    await assert.rejects(() => a.client.commsUpdateWorkspace({ id: W1 }), (e) => e.data.code === 'NOTHING_TO_UPDATE');
    await assert.rejects(() => a.client.commsUpdateWorkspace({ id: W2, name: 'x' }), (e) => e.status === 404);
  });
});

describe('comms_update_workspace_settings', () => {
  const settings = (over = {}) => ({
    [`GET /workspaces/${W1}/settings/consent`]: ok({ click_consent_enabled: false }),
    [`GET /workspaces/${W1}/settings/open-tracking`]: ok({ open_tracking_enabled: true }),
    [`GET /workspaces/${W1}/settings/unsubscribe`]: ok({ unsubscribe_landing_url: null }),
    [`PATCH /workspaces/${W1}/settings/consent`]: ok({ click_consent_enabled: true }),
    [`PATCH /workspaces/${W1}/settings/open-tracking`]: ok({ open_tracking_enabled: false }),
    [`PATCH /workspaces/${W1}/settings/unsubscribe`]: ok({ unsubscribe_landing_url: 'https://shop.example/bye' }),
    ...over,
  });
  test('dry run shows before and after for each change, explains click consent in plain words, and writes nothing', async () => {
    const { client, calls } = make(settings());
    const r = await client.commsUpdateWorkspaceSettings({ workspaceId: W1, clickConsentEnabled: true, openTracking: false });
    assert.equal(r.applied, false);
    assert.deepEqual(r.changes.click_consent_enabled, { from: false, to: true });
    assert.deepEqual(r.changes.open_tracking_enabled, { from: true, to: false });
    assert.match(JSON.stringify(r.explain), /click/i); assert.match(r.nextStep, /yes/i);
    assert.equal(writesOf(calls).length, 0);
  });
  test('the real call patches only what changes', async () => {
    const { client, calls } = make(settings());
    const r = await client.commsUpdateWorkspaceSettings({ workspaceId: W1, clickConsentEnabled: true, openTracking: true, unsubscribeLandingUrl: 'https://shop.example/bye', dryRun: false });
    assert.equal(r.applied, true);
    const w = writesOf(calls);
    assert.deepEqual(w.map((c) => c.path).sort(), [`/workspaces/${W1}/settings/consent`, `/workspaces/${W1}/settings/unsubscribe`]);
    assert.deepEqual(w.find((c) => /consent/.test(c.path)).body, { click_consent_enabled: true });
    assert.deepEqual(w.find((c) => /unsubscribe/.test(c.path)).body, { unsubscribe_landing_url: 'https://shop.example/bye' });
  });
  test('values that are already so change nothing; null clears the unsubscribe page; nothing given is refused; a non-https page is refused', async () => {
    const same = make(settings());
    const r = await same.client.commsUpdateWorkspaceSettings({ workspaceId: W1, openTracking: true, dryRun: false });
    assert.equal(r.applied, false); assert.match(r.note, /already/i); assert.equal(writesOf(same.calls).length, 0);
    const clear = make(settings({ [`GET /workspaces/${W1}/settings/unsubscribe`]: ok({ unsubscribe_landing_url: 'https://shop.example/old' }) }));
    await clear.client.commsUpdateWorkspaceSettings({ workspaceId: W1, unsubscribeLandingUrl: null, dryRun: false });
    assert.deepEqual(writesOf(clear.calls)[0].body, { unsubscribe_landing_url: null });
    const none = make({}); await assert.rejects(() => none.client.commsUpdateWorkspaceSettings({ workspaceId: W1 }), (e) => e.data.code === 'NOTHING_TO_UPDATE');
    await assert.rejects(() => none.client.commsUpdateWorkspaceSettings({ workspaceId: W1, unsubscribeLandingUrl: 'http://plain.example' }), (e) => e.data.code === 'INVALID_URL');
    assert.equal(none.calls.length, 0);
  });
});

describe('comms_add_sending_identity', () => {
  test('dry run asks the service to check and change nothing; the real call adds, and says nothing is removed', async () => {
    const { client, calls } = make({
      [`POST /workspaces/${W1}/motor-blocks/add`]: (init) => (JSON.parse(init.body).dry_run === true
        ? ok({ workspaceId: W1, domain: 'shop.example', wouldAdd: 'the marketing sending identity for this domain' }, { applied: false })
        : ok({ workspaceId: W1, motorBlockId: BLOCK, domain: 'shop.example', newlyAssigned: true }, { applied: true })),
    });
    const dry = await client.commsAddSendingIdentity({ workspaceId: W1, domainId: DOMAIN });
    assert.equal(dry.dryRun, true); assert.equal(dry.applied, false); assert.equal(calls[0].body.dry_run, true); assert.equal(calls[0].headers['X-Tenant-Id'], undefined);
    const real = await client.commsAddSendingIdentity({ workspaceId: W1, domainId: DOMAIN, dryRun: false });
    assert.equal(real.applied, true); assert.equal(real.data.newlyAssigned, true); assert.match(real.note, /nothing .*removed|never removes|not removed/i);
    assert.deepEqual(calls[1].body, { domainId: DOMAIN });
  });
  test('an unverified domain surfaces its code so the agent can say what to do', async () => {
    const { client } = make({ [`POST /workspaces/${W1}/motor-blocks/add`]: json(409, { success: false, error: 'not verified', code: 'DOMAIN_NOT_VERIFIED' }) });
    await assert.rejects(() => client.commsAddSendingIdentity({ workspaceId: W1, domainId: DOMAIN }), (e) => e.data.code === 'DOMAIN_NOT_VERIFIED');
  });
});

describe('comms_update_webhook', () => {
  const patchOk = ok({ id: WID, url: URL_NEW, events: ['message.bounced'], enabled: true, failure_count: 0 });
  test('events and pause/resume: a dry run shows before and after, the real call patches only those fields', async () => {
    const { client, calls } = make(webhooksTable({ [`PATCH /workspaces/${W1}/webhooks/${WID}`]: ok({ id: WID, url: URL_OLD, events: ['message.bounced', 'contact.unsubscribed'], enabled: false, failure_count: 0 }) }));
    const dry = await client.commsUpdateWebhook({ workspaceId: W1, webhookId: WID, enabled: false, events: ['message.bounced', 'contact.unsubscribed'] });
    assert.equal(dry.applied, false); assert.equal(dry.changes.enabled.to, false); assert.equal(writesOf(calls).length, 0); assert.equal(dry.confirmToken, undefined);
    const real = await client.commsUpdateWebhook({ workspaceId: W1, webhookId: WID, enabled: false, events: ['message.bounced', 'contact.unsubscribed'], dryRun: false });
    assert.equal(real.applied, true);
    assert.deepEqual(writesOf(calls)[0].body, { enabled: false, events: ['message.bounced', 'contact.unsubscribed'] });
    assert.doesNotMatch(JSON.stringify(real), /SECRETPATH|AAA/);
  });
  test('a URL change: the dry run names the old and new HOST only, warns that events carry addresses, and returns a confirmToken', async () => {
    const { client, calls } = make(webhooksTable());
    const dry = await client.commsUpdateWebhook({ workspaceId: W1, webhookId: WID, url: URL_NEW });
    assert.equal(dry.applied, false); assert.equal(dry.summary.from, 'old.example.com'); assert.equal(dry.summary.to, 'new.example.com');
    assert.ok(dry.confirmToken); assert.match(dry.summary.warning, /email addresses/i); assert.match(dry.nextStep, /owner/i);
    assert.doesNotMatch(JSON.stringify(dry), /NEWSECRET|SECRETPATH|AAA|BBB/); assert.equal(writesOf(calls).length, 0);
  });
  test('a real URL change needs dryRun:false AND confirm:true AND the matching token; none of the refusals reach the network', async () => {
    const { client, calls } = make(webhooksTable({ [`PATCH /workspaces/${W1}/webhooks/${WID}`]: patchOk }));
    const base = { workspaceId: W1, webhookId: WID, url: URL_NEW, dryRun: false };
    const { confirmToken } = await client.commsUpdateWebhook({ workspaceId: W1, webhookId: WID, url: URL_NEW });
    await assert.rejects(() => client.commsUpdateWebhook(base), (e) => e.data.code === 'CONFIRMATION_REQUIRED');
    await assert.rejects(() => client.commsUpdateWebhook({ ...base, confirm: true }), (e) => e.data.code === 'CONFIRM_TOKEN_REQUIRED');
    await assert.rejects(() => client.commsUpdateWebhook({ ...base, confirm: true, confirmToken: `${confirmToken}x` }), (e) => e.data.code === 'CONFIRM_TOKEN_INVALID');
    await assert.rejects(() => client.commsUpdateWebhook({ ...base, url: 'https://evil.example/steal', confirm: true, confirmToken }), (e) => e.data.code === 'CONFIRM_TOKEN_INVALID');
    assert.equal(writesOf(calls).length, 0);
    const done = await client.commsUpdateWebhook({ ...base, confirm: true, confirmToken });
    assert.equal(done.applied, true); assert.equal(writesOf(calls).length, 1); assert.equal(writesOf(calls)[0].body.url, URL_NEW);
    assert.match(done.note, /emailed/i); assert.doesNotMatch(JSON.stringify(done), /NEWSECRET|BBB/);
  });
  test('a token made for another connection is refused', async () => {
    const a = make(webhooksTable(), { grantId: G1 });
    const { confirmToken } = await a.client.commsUpdateWebhook({ workspaceId: W1, webhookId: WID, url: URL_NEW });
    const b = make(webhooksTable({ [`PATCH /workspaces/${W1}/webhooks/${WID}`]: patchOk }), { grantId: G2 });
    await assert.rejects(() => b.client.commsUpdateWebhook({ workspaceId: W1, webhookId: WID, url: URL_NEW, dryRun: false, confirm: true, confirmToken }), (e) => e.data.code === 'CONFIRM_TOKEN_INVALID');
    assert.equal(writesOf(b.calls).length, 0);
  });
  test('a URL that is not https, an unknown event, nothing to change and an unknown webhook are refused', async () => {
    const { client, calls } = make(webhooksTable());
    await assert.rejects(() => client.commsUpdateWebhook({ workspaceId: W1, webhookId: WID, url: 'http://plain.example/hook' }), (e) => e.data.code === 'INVALID_WEBHOOK_URL');
    await assert.rejects(() => client.commsUpdateWebhook({ workspaceId: W1, webhookId: WID, events: ['everything'] }), (e) => e.data.code === 'INVALID_EVENTS');
    await assert.rejects(() => client.commsUpdateWebhook({ workspaceId: W1, webhookId: WID }), (e) => e.data.code === 'NOTHING_TO_UPDATE');
    assert.equal(calls.length, 0);
    await assert.rejects(() => client.commsUpdateWebhook({ workspaceId: W1, webhookId: W2, enabled: false }), (e) => e.data.code === 'WEBHOOK_NOT_FOUND');
  });
  test('when the owner cannot be emailed the service refuses and the error says so', async () => {
    const { client } = make(webhooksTable({ [`PATCH /workspaces/${W1}/webhooks/${WID}`]: json(409, { success: false, error: 'owner not told', code: 'OWNER_NOTICE_UNAVAILABLE' }) }));
    const { confirmToken } = await client.commsUpdateWebhook({ workspaceId: W1, webhookId: WID, url: URL_NEW });
    await assert.rejects(() => client.commsUpdateWebhook({ workspaceId: W1, webhookId: WID, url: URL_NEW, dryRun: false, confirm: true, confirmToken }), (e) => e.data.code === 'OWNER_NOTICE_UNAVAILABLE');
  });
});

describe('comms_delete_webhook', () => {
  test('dry run says what would be deleted (host only); the real call needs dryRun:false and confirm:true', async () => {
    const { client, calls } = make(webhooksTable({ [`DELETE /workspaces/${W1}/webhooks/${WID}`]: ok(undefined) }));
    const dry = await client.commsDeleteWebhook({ workspaceId: W1, webhookId: WID });
    assert.equal(dry.applied, false); assert.match(JSON.stringify(dry.would_delete), /old\.example\.com/); assert.doesNotMatch(JSON.stringify(dry), /SECRETPATH/); assert.match(dry.nextStep, /cannot be undone|final/i);
    await assert.rejects(() => client.commsDeleteWebhook({ workspaceId: W1, webhookId: WID, dryRun: false }), (e) => e.data.code === 'CONFIRMATION_REQUIRED');
    assert.equal(writesOf(calls).length, 0);
    const real = await client.commsDeleteWebhook({ workspaceId: W1, webhookId: WID, dryRun: false, confirm: true });
    assert.equal(real.applied, true); assert.equal(writesOf(calls)[0].method, 'DELETE'); assert.equal(writesOf(calls)[0].headers['X-Tenant-Id'], W1);
  });
});

describe('comms_test_webhook', () => {
  test('dry run queues nothing; the real call queues one test event with no personal data; the limit surfaces with when to retry', async () => {
    const { client, calls } = make(webhooksTable({ [`POST /workspaces/${W1}/webhooks/${WID}/test`]: json(202, { success: true, data: { queued: true } }) }));
    const dry = await client.commsTestWebhook({ workspaceId: W1, webhookId: WID });
    assert.equal(dry.applied, false); assert.match(dry.note, /no personal data/i); assert.equal(writesOf(calls).length, 0);
    const real = await client.commsTestWebhook({ workspaceId: W1, webhookId: WID, dryRun: false });
    assert.equal(real.applied, true); assert.equal(real.queued, true); assert.equal(writesOf(calls).length, 1);
    const limited = make(webhooksTable({ [`POST /workspaces/${W1}/webhooks/${WID}/test`]: json(429, { success: false, error: 'too many', code: 'WEBHOOK_TEST_LIMIT', retryAfter: 3600 }) }));
    await assert.rejects(() => limited.client.commsTestWebhook({ workspaceId: W1, webhookId: WID, dryRun: false }), (e) => e.data.code === 'WEBHOOK_TEST_LIMIT' && e.data.retryAfter === 3600);
  });
});

describe('masking', () => {
  test('an address inside an error from the service is masked', async () => {
    const { client } = make(webhooksTable({ [`DELETE /workspaces/${W1}/webhooks/${WID}`]: json(500, { success: false, error: 'failed for jane@example.com' }) }));
    await assert.rejects(() => client.commsDeleteWebhook({ workspaceId: W1, webhookId: WID, dryRun: false, confirm: true }), (e) => !FULL_EMAIL.test(e.message));
  });
});
