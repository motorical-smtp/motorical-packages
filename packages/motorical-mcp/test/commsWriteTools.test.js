// The write family of the Communications MCP (M3-2): content (templates, brand kit) and the list card. Every write defaults to a
// dry run, nothing deletes or sends, creates carry an idempotency key, updates carry undo information and an optimistic lock.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createDelegatedClient } from '../src/delegatedClient.js';
import { SERVERS, TOOL_ROUTES, HOSTED_ONLY_TOOLS } from '../src/servers.js';
import { TOOLS } from '../src/registry.js';
import { COMMS_WRITE_TOOLS } from '../src/commsWriteTools.js';
import { TOOL_SCOPES, SERVER_TOOLS } from '@motorical/scope-catalog';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const signer = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'k1' };
const server = SERVERS.find((s) => s.key === 'communications');
const W1 = '33333333-3333-4333-8333-333333333333';
const ID1 = '55555555-5555-4555-8555-555555555555';
const ALL = ['read:comms', 'write:comms.content', 'write:comms.audience'];
const claims = (scopes = ALL) => ({ grantId: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222', scopes, motorBlockIds: [] });
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const ok = (data, extra = {}) => json(200, { success: true, data, ...extra });
const BASE = 'http://comms.test/api';
const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

// A responder from a table of 'METHOD /path' -> response (or function). An unexpected call fails the test loudly.
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

const CURRENT = { id: ID1, name: 'News', subject: 'Hello', type: 'html', body_html: '<p>Hi {{unsubscribe_url}}</p>', body_text: 'Hi {{unsubscribe_url}}', description: 'Monthly newsletter for shop customers.', kind: 'newsletter', derived_from: null, updated_at: '2026-10-27T10:00:00.123Z', used_by: [], used_by_count: 0 };
const VALID = ok({ valid: true, errors: [], warnings: [] });
const LINT = ok({ template_id: null, findings: [], summary: { total: 0 } });
const GOODDESC = 'Subscribers who opted in through the shop checkout box, for the monthly newsletter.';

// Reads and read-only POSTs are allowed in a dry run; list dry runs are the API's own dry_run flag; nothing else is.
const READ_POST = [/^\/templates\/(validate|lint|fix|preview|check-links)$/, /^\/templates\/starters\/[a-z0-9_-]+\/render$/];
const isWrite = (c) => {
  if (c.method === 'GET') return false;
  if (c.method === 'POST' && READ_POST.some((re) => re.test(c.path))) return false;
  if (c.path.startsWith('/lists') && c.body && c.body.dry_run === true) return false;
  return true;
};
const writes = (calls) => calls.filter(isWrite);

const NAMES = ['comms_create_template', 'comms_create_template_from_starter', 'comms_update_template', 'comms_apply_template_fixes', 'comms_duplicate_template', 'comms_set_brand_kit', 'comms_create_list', 'comms_update_list'];
const byName = (n) => TOOLS.find((t) => t.name === n);

describe('registration', () => {
  test('the table, the catalogue and the registry agree on the same 8 write tools', () => {
    assert.deepEqual(COMMS_WRITE_TOOLS.map((t) => t.tool).sort(), [...NAMES].sort());
    for (const n of NAMES) { assert.ok(SERVER_TOOLS.communications.includes(n), n); assert.ok(byName(n), `${n} registered`); assert.ok(HOSTED_ONLY_TOOLS.includes(n), `${n} hosted-only`); }
  });
  test('scopes: content tools write:comms.content, list-card tools write:comms.audience', () => {
    for (const n of NAMES.filter((x) => !x.includes('list'))) assert.deepEqual(TOOL_SCOPES[n], ['write:comms.content'], n);
    for (const n of ['comms_create_list', 'comms_update_list']) assert.deepEqual(TOOL_SCOPES[n], ['write:comms.audience'], n);
  });
  test('the server offers those three scopes plus send (M3-5), but its FIRST consent is still read + audience + content', () => {
    assert.deepEqual([...server.scopes].sort(), ['manage:comms.audience', 'manage:comms.webhooks', 'manage:comms.workspace', 'read:comms', 'send:comms.campaign', 'write:comms.audience', 'write:comms.content']);
    assert.deepEqual([...server.initialScopes].sort(), ['read:comms', 'write:comms.audience', 'write:comms.content']);
  });
  test('every tool is annotated as a non-destructive write, says dry run, takes dryRun and workspaceId', () => {
    for (const n of NAMES) {
      const t = byName(n);
      assert.equal(t.annotations.readOnlyHint, false, n);
      assert.equal(t.annotations.destructiveHint, false, n);
      assert.match(t.description, /dry run/i, n);
      assert.ok(t.inputSchema.dryRun && t.inputSchema.workspaceId, n);
    }
  });
  test('no write tool maps to DELETE, to a send or schedule route, or to contacts', () => {
    for (const row of COMMS_WRITE_TOOLS) {
      assert.ok(['POST', 'PATCH'].includes(row.http), `${row.tool} ${row.http}`);
      const r = TOOL_ROUTES[row.tool];
      assert.ok(r && ['POST', 'PATCH'].includes(r.method) && r.path.startsWith('/comm-api/api/'), row.tool);
      assert.ok(!/(schedule|cancel|test-send|contacts|suppress|import)/.test(r.path), `${row.tool} ${r.path}`);
    }
  });
});

describe('creating a template', () => {
  const args = { workspaceId: W1, name: 'Autumn', subject: 'Autumn news', type: 'html', bodyHtml: '<p>Hi {{unsubscribe_url}}</p>', description: GOODDESC, kind: 'newsletter' };
  const table = { 'POST /templates/validate': VALID, 'POST /templates/lint': LINT, 'POST /templates': ok({ id: ID1, name: 'Autumn' }) };

  test('dry run is the default: validated and linted, nothing written', async () => {
    const { client, calls } = make(table);
    const out = await client.commsCreateTemplate(args);
    assert.equal(out.dryRun, true); assert.equal(out.applied, false);
    assert.equal(out.would_create.name, 'Autumn'); assert.equal(out.would_create.kind, 'newsletter');
    assert.equal(out.validation.valid, true); assert.ok(out.lint);
    assert.equal(writes(calls).length, 0);
  });
  test('an invalid template is reported as data in a dry run, not thrown, and is not linted', async () => {
    const { client, calls } = make({ 'POST /templates/validate': json(422, { success: false, data: { valid: false, errors: [{ message: 'body too large' }], warnings: [] } }) });
    const out = await client.commsCreateTemplate(args);
    assert.equal(out.validation.valid, false);
    assert.equal(out.validation.errors[0].message, 'body too large');
    assert.equal(calls.length, 1);
  });
  test('dryRun:false writes exactly once, with an Idempotency-Key, and the card', async () => {
    const { client, calls } = make(table);
    const out = await client.commsCreateTemplate({ ...args, dryRun: false });
    assert.equal(out.applied, true); assert.equal(out.dryRun, false); assert.equal(out.data.id, ID1);
    const w = writes(calls);
    assert.equal(w.length, 1);
    assert.match(w[0].init.headers['Idempotency-Key'], KEY_RE);
    assert.deepEqual(w[0].body, { name: 'Autumn', subject: 'Autumn news', type: 'html', body_html: '<p>Hi {{unsubscribe_url}}</p>', description: GOODDESC, kind: 'newsletter' });
  });
  test('the same call gets the same key (a retry cannot double-create); a different call a different key; the caller\'s key wins', async () => {
    const keyOf = async (over) => { const { client, calls } = make(table); await client.commsCreateTemplate({ ...args, dryRun: false, ...over }); return writes(calls)[0].init.headers['Idempotency-Key']; };
    const a = await keyOf({}); const b = await keyOf({}); const c = await keyOf({ name: 'Winter' });
    assert.equal(a, b); assert.notEqual(a, c);
    assert.equal(await keyOf({ idempotencyKey: 'my-own-key-0001' }), 'my-own-key-0001');
  });
  test('a malformed caller key is refused before any network call', async () => {
    const { client, calls } = make(table);
    await assert.rejects(() => client.commsCreateTemplate({ ...args, dryRun: false, idempotencyKey: 'x y' }), (e) => e.data.code === 'INVALID_IDEMPOTENCY_KEY');
    assert.equal(calls.length, 0);
  });
  test('description and kind are required: refused locally, in a dry run too', async () => {
    const { client, calls } = make(table);
    await assert.rejects(() => client.commsCreateTemplate({ ...args, description: undefined }), (e) => e.data.code === 'MISSING_CARD' && /description/.test(e.message));
    await assert.rejects(() => client.commsCreateTemplate({ ...args, kind: undefined }), (e) => e.data.code === 'MISSING_CARD' && /kind/.test(e.message));
    await assert.rejects(() => client.commsCreateTemplate({ ...args, description: '   ' }), (e) => e.data.code === 'MISSING_CARD');
    assert.equal(calls.length, 0);
  });
});

describe('creating a template from a starter', () => {
  const args = { workspaceId: W1, starter: 'newsletter', name: 'October', description: GOODDESC, kind: 'newsletter', slots: { headline: 'Hi' } };
  const table = { 'POST /templates/starters/newsletter/render': ok({ subject_suggestion: 'S', body_html: '<p>x</p>' }), 'POST /templates/from-starter': ok({ template: { id: ID1 } }) };
  test('dry run renders the starter with the stored brand kit and writes nothing', async () => {
    const { client, calls } = make(table);
    const out = await client.commsCreateTemplateFromStarter(args);
    assert.equal(out.applied, false); assert.ok(out.render);
    assert.equal(writes(calls).length, 0);
  });
  test('dryRun:false creates once with a key', async () => {
    const { client, calls } = make(table);
    const out = await client.commsCreateTemplateFromStarter({ ...args, dryRun: false });
    assert.equal(out.applied, true);
    const w = writes(calls);
    assert.equal(w.length, 1); assert.equal(w[0].body.starter, 'newsletter'); assert.match(w[0].init.headers['Idempotency-Key'], KEY_RE);
  });
  test('a starter key that could escape the path is refused locally', async () => {
    const { client, calls } = make(table);
    await assert.rejects(() => client.commsCreateTemplateFromStarter({ ...args, starter: '../../lists' }), (e) => e.data.code === 'INVALID_ID');
    assert.equal(calls.length, 0);
  });
  test('the card is required here too', async () => {
    const { client } = make(table);
    await assert.rejects(() => client.commsCreateTemplateFromStarter({ ...args, description: undefined }), (e) => e.data.code === 'MISSING_CARD');
  });
});

describe('updating a template', () => {
  const table = (cur = CURRENT) => ({
    'GET /templates/*': ok(cur), 'POST /templates/validate': VALID, 'POST /templates/lint': LINT,
    'PATCH /templates/*': ok({ ...cur, subject: 'Hi there', updated_at: '2026-10-27T10:05:00.000Z' }),
  });
  const args = { workspaceId: W1, id: ID1, subject: 'Hi there' };

  test('dry run shows exactly what would change, validated and linted, and hands back the version to pass next time', async () => {
    const { client, calls } = make(table());
    const out = await client.commsUpdateTemplate(args);
    assert.equal(out.dryRun, true); assert.equal(out.applied, false);
    assert.deepEqual(out.changes, { subject: { from: 'Hello', to: 'Hi there' } });
    assert.equal(out.expectedUpdatedAt, CURRENT.updated_at);
    assert.equal(out.validation.valid, true); assert.ok(out.lint);
    assert.equal(writes(calls).length, 0);
  });
  test('a change that changes nothing says so', async () => {
    const { client } = make(table());
    const out = await client.commsUpdateTemplate({ ...args, subject: 'Hello' });
    assert.equal(out.noChange, true); assert.equal(out.applied, false);
  });
  test('a real write needs expectedUpdatedAt: refused locally, before any network call', async () => {
    const { client, calls } = make(table());
    await assert.rejects(() => client.commsUpdateTemplate({ ...args, dryRun: false }), (e) => e.data.code === 'MISSING_EXPECTED_UPDATED_AT');
    assert.equal(calls.length, 0);
  });
  test('a real write sends only the changed fields with the lock, and returns the previous values and the new row', async () => {
    const { client, calls } = make(table());
    const out = await client.commsUpdateTemplate({ ...args, dryRun: false, expectedUpdatedAt: CURRENT.updated_at, name: 'News' });
    assert.equal(out.applied, true);
    assert.deepEqual(out.previous, { subject: 'Hello' });
    assert.equal(out.data.subject, 'Hi there');
    const w = writes(calls);
    assert.equal(w.length, 1); assert.equal(w[0].method, 'PATCH');
    assert.deepEqual(w[0].body, { subject: 'Hi there', expected_updated_at: CURRENT.updated_at });
  });
  test('a stale version is refused by the API; the agent gets STALE_TEMPLATE and the current version', async () => {
    const t = table(); t['PATCH /templates/*'] = json(409, { success: false, error: 'changed', code: 'STALE_TEMPLATE', current_updated_at: '2026-10-27T10:30:00.000Z' });
    const { client } = make(t);
    await assert.rejects(() => client.commsUpdateTemplate({ ...args, dryRun: false, expectedUpdatedAt: CURRENT.updated_at }), (e) => e.status === 409 && e.data.code === 'STALE_TEMPLATE' && e.data.current_updated_at === '2026-10-27T10:30:00.000Z');
  });
  test('a template used by a scheduled or sending campaign carries a warning: that campaign was compiled and will NOT change', async () => {
    const cur = { ...CURRENT, used_by: [{ id: 'c1', name: 'November', status: 'scheduled', in_recycle_bin: false }, { id: 'c2', name: 'Old', status: 'completed', in_recycle_bin: false }, { id: 'c3', name: 'Draft', status: 'draft', in_recycle_bin: false }], used_by_count: 3 };
    const dry = await make(table(cur)).client.commsUpdateTemplate(args);
    assert.equal(dry.warnings.length, 1);
    assert.equal(dry.warnings[0].type, 'template_used_by_scheduled_campaign');
    assert.deepEqual(dry.warnings[0].campaigns.map((c) => c.id), ['c1']);
    assert.match(dry.warnings[0].message, /will not change/i);
    const real = await make(table(cur)).client.commsUpdateTemplate({ ...args, dryRun: false, expectedUpdatedAt: cur.updated_at });
    assert.equal(real.warnings[0].type, 'template_used_by_scheduled_campaign');
  });
  test('finished and draft campaigns, and a campaign in the recycle bin, raise no warning', async () => {
    const cur = { ...CURRENT, used_by: [{ id: 'c2', name: 'Old', status: 'completed', in_recycle_bin: false }, { id: 'c3', name: 'Draft', status: 'draft', in_recycle_bin: false }, { id: 'c4', name: 'Bin', status: 'scheduled', in_recycle_bin: true }], used_by_count: 3 };
    const out = await make(table(cur)).client.commsUpdateTemplate(args);
    assert.deepEqual(out.warnings, []);
  });
  test('nothing to change is refused locally; the type can never be changed (it is not an argument)', async () => {
    const { client, calls } = make(table());
    await assert.rejects(() => client.commsUpdateTemplate({ workspaceId: W1, id: ID1 }), (e) => e.data.code === 'NOTHING_TO_UPDATE');
    assert.equal(calls.length, 0);
    assert.ok(!('type' in byName('comms_update_template').inputSchema));
  });
  test('a bad id is refused locally', async () => {
    const { client, calls } = make(table());
    await assert.rejects(() => client.commsUpdateTemplate({ ...args, id: 'nope' }), (e) => e.data.code === 'INVALID_ID');
    assert.equal(calls.length, 0);
  });
});

describe('applying the safe fixes', () => {
  const FIX = { result: { subject: 'Hello', body_html: '<p>Hi {{unsubscribe_url}}</p>', body_text: 'Hi fixed' }, changes: [{ type: 'empty_greeting_risk', field: 'body_text' }], lint_before: {}, lint_after: { findings: [] } };
  const table = (fix = FIX) => ({ 'GET /templates/*': ok(CURRENT), 'POST /templates/fix': ok({ template_id: ID1, applied: false, ...fix }), 'PATCH /templates/*': ok({ ...CURRENT, body_text: 'Hi fixed' }) });
  test('dry run returns the fixes and the re-lint, and writes nothing', async () => {
    const { client, calls } = make(table());
    const out = await client.commsApplyTemplateFixes({ workspaceId: W1, id: ID1 });
    assert.equal(out.applied, false); assert.equal(out.fix.changes.length, 1); assert.equal(out.expectedUpdatedAt, CURRENT.updated_at);
    assert.equal(writes(calls).length, 0);
  });
  test('a real write patches the fixed fields with the lock and returns the previous text', async () => {
    const { client, calls } = make(table());
    const out = await client.commsApplyTemplateFixes({ workspaceId: W1, id: ID1, dryRun: false, expectedUpdatedAt: CURRENT.updated_at });
    assert.equal(out.applied, true);
    assert.deepEqual(out.previous, { body_text: 'Hi {{unsubscribe_url}}' });
    const w = writes(calls);
    assert.equal(w.length, 1); assert.deepEqual(w[0].body, { body_text: 'Hi fixed', expected_updated_at: CURRENT.updated_at });
  });
  test('nothing to fix: no write, and it says so', async () => {
    const { client, calls } = make(table({ ...FIX, changes: [] }));
    const out = await client.commsApplyTemplateFixes({ workspaceId: W1, id: ID1, dryRun: false, expectedUpdatedAt: CURRENT.updated_at });
    assert.equal(out.noChange, true); assert.equal(out.applied, false);
    assert.equal(writes(calls).length, 0);
  });
  test('a real write needs expectedUpdatedAt', async () => {
    const { client, calls } = make(table());
    await assert.rejects(() => client.commsApplyTemplateFixes({ workspaceId: W1, id: ID1, dryRun: false }), (e) => e.data.code === 'MISSING_EXPECTED_UPDATED_AT');
    assert.equal(calls.length, 0);
  });
});

describe('duplicating a template', () => {
  const table = { 'GET /templates/*': ok(CURRENT), 'POST /templates/*/duplicate': ok({ id: 'new', name: 'News (copy)' }) };
  test('dry run says what the copy would be and writes nothing', async () => {
    const { client, calls } = make({ 'GET /templates/*': ok(CURRENT) });
    const out = await client.commsDuplicateTemplate({ workspaceId: W1, id: ID1 });
    assert.deepEqual(out.would_create, { name: 'News (copy)', derived_from: ID1 }); assert.equal(writes(calls).length, 0);
  });
  test('a real duplicate is one POST with a key', async () => {
    const { client, calls } = make({ ...table, 'POST /templates/55555555-5555-4555-8555-555555555555/duplicate': ok({ id: 'new', name: 'News (copy)' }) });
    const out = await client.commsDuplicateTemplate({ workspaceId: W1, id: ID1, dryRun: false });
    assert.equal(out.applied, true);
    const w = writes(calls);
    assert.equal(w.length, 1); assert.match(w[0].init.headers['Idempotency-Key'], KEY_RE);
  });
});

describe('the brand kit', () => {
  const KIT = { brand_kit: { sender_name: 'Shop', footer_text: 'Old footer', colors: { primary: '#112233' } }, missing: [], ready_for_starters: true, effective: {} };
  const table = { 'GET /settings/brand-kit': ok(KIT), 'PATCH /settings/brand-kit': ok({ brand_kit: { sender_name: 'Shop Ltd' } }) };
  test('dry run shows the current kit and the patch, writes nothing', async () => {
    const { client, calls } = make(table);
    const out = await client.commsSetBrandKit({ workspaceId: W1, brandKit: { sender_name: 'Shop Ltd' } });
    assert.equal(out.applied, false); assert.deepEqual(out.patch, { sender_name: 'Shop Ltd' }); assert.equal(out.current.sender_name, 'Shop');
    assert.equal(writes(calls).length, 0);
  });
  test('a real write sends the patch as is (null clears) and returns only the previous values of the touched keys', async () => {
    const { client, calls } = make(table);
    const out = await client.commsSetBrandKit({ workspaceId: W1, dryRun: false, brandKit: { sender_name: 'Shop Ltd', footer_text: null } });
    assert.equal(out.applied, true);
    assert.deepEqual(out.previous, { sender_name: 'Shop', footer_text: 'Old footer' });
    const w = writes(calls);
    assert.equal(w.length, 1); assert.deepEqual(w[0].body, { sender_name: 'Shop Ltd', footer_text: null });
  });
  test('an empty patch is refused locally', async () => {
    const { client, calls } = make(table);
    await assert.rejects(() => client.commsSetBrandKit({ workspaceId: W1, brandKit: {} }), (e) => e.data.code === 'NOTHING_TO_UPDATE');
    assert.equal(calls.length, 0);
  });
});

describe('the list card', () => {
  const card = { id: ID1, name: 'Newsletter', description: GOODDESC, kind: 'subscribers', source_label: 'Shopify', updated_at: 't' };
  const args = { workspaceId: W1, name: 'Newsletter', description: GOODDESC, kind: 'subscribers', sourceLabel: 'Shopify' };
  test('create: dry run asks the API to check (strict + dry_run) and nothing is stored', async () => {
    const { client, calls } = make({ 'POST /lists': ok({ name: 'Newsletter' }, { dry_run: true, warnings: [] }) });
    const out = await client.commsCreateList(args);
    assert.equal(out.dryRun, true); assert.equal(out.applied, false);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, { name: 'Newsletter', description: GOODDESC, kind: 'subscribers', source_label: 'Shopify', strict: true, dry_run: true });
    assert.equal(writes(calls).length, 0);
  });
  test('create: dryRun:false is strict (not dry_run), one POST, with a key', async () => {
    const { client, calls } = make({ 'POST /lists': ok(card, { warnings: [] }) });
    const out = await client.commsCreateList({ ...args, dryRun: false });
    assert.equal(out.applied, true);
    assert.equal(calls[0].body.strict, true); assert.ok(!('dry_run' in calls[0].body));
    assert.match(calls[0].init.headers['Idempotency-Key'], KEY_RE);
  });
  test('create: a weak card is refused by the API (LIST_CARD_INVALID) and the findings reach the agent', async () => {
    const { client } = make({ 'POST /lists': json(422, { success: false, error: 'too short', code: 'LIST_CARD_INVALID', warnings: [{ type: 'description_too_short', message: 'too short' }] }) });
    await assert.rejects(() => client.commsCreateList({ ...args, description: 'Shop people.' }), (e) => e.status === 422 && e.data.code === 'LIST_CARD_INVALID' && e.data.warnings[0].type === 'description_too_short');
  });
  test('create: description and a settable kind are required locally; derived and system_view are not settable by hand', async () => {
    const { client, calls } = make({ 'POST /lists': ok(card) });
    await assert.rejects(() => client.commsCreateList({ ...args, description: undefined }), (e) => e.data.code === 'MISSING_CARD');
    await assert.rejects(() => client.commsCreateList({ ...args, kind: undefined }), (e) => e.data.code === 'MISSING_CARD');
    await assert.rejects(() => client.commsCreateList({ ...args, kind: 'derived' }), (e) => e.data.code === 'INVALID_KIND');
    await assert.rejects(() => client.commsCreateList({ ...args, kind: 'system_view' }), (e) => e.data.code === 'INVALID_KIND');
    assert.equal(calls.length, 0);
  });
  test('update: dry run is the API\'s dry_run, strict, and shows previous and new', async () => {
    const { client, calls } = make({ 'PATCH /lists/*': ok({ ...card, name: 'Shop newsletter' }, { dry_run: true, previous: { name: 'Newsletter' } }) });
    const out = await client.commsUpdateList({ workspaceId: W1, id: ID1, name: 'Shop newsletter' });
    assert.equal(out.applied, false); assert.deepEqual(out.previous, { name: 'Newsletter' });
    assert.deepEqual(calls[0].body, { name: 'Shop newsletter', strict: true, dry_run: true });
    assert.equal(writes(calls).length, 0);
  });
  test('update: a real write reads the card first for the undo information, then one strict PATCH', async () => {
    const { client, calls } = make({ 'GET /lists/*': ok(card), 'PATCH /lists/*': ok({ ...card, description: 'New description that is long enough to be useful here.' }) });
    const out = await client.commsUpdateList({ workspaceId: W1, id: ID1, dryRun: false, description: 'New description that is long enough to be useful here.' });
    assert.equal(out.applied, true);
    assert.deepEqual(out.previous, { description: GOODDESC });
    const w = writes(calls);
    assert.equal(w.length, 1); assert.equal(w[0].body.strict, true); assert.ok(!('dry_run' in w[0].body));
  });
  test('update: nothing to change, and a bad id, are refused locally', async () => {
    const { client, calls } = make({});
    await assert.rejects(() => client.commsUpdateList({ workspaceId: W1, id: ID1 }), (e) => e.data.code === 'NOTHING_TO_UPDATE');
    await assert.rejects(() => client.commsUpdateList({ workspaceId: W1, id: 'x', name: 'n' }), (e) => e.data.code === 'INVALID_ID');
    assert.equal(calls.length, 0);
  });
});

describe('scopes are checked before any network call', () => {
  test('a read-only grant cannot call any write tool', async () => {
    const { client, calls } = make({}, ['read:comms']);
    await assert.rejects(() => client.commsCreateTemplate({ workspaceId: W1, name: 'n', subject: 's', type: 'html', bodyHtml: 'x', description: GOODDESC, kind: 'newsletter' }));
    await assert.rejects(() => client.commsCreateList({ workspaceId: W1, name: 'n', description: GOODDESC, kind: 'other' }));
    assert.equal(calls.length, 0);
  });
  test('content and audience are separate: each grant reaches only its own tools', async () => {
    const onlyContent = make({}, ['read:comms', 'write:comms.content']);
    await assert.rejects(() => onlyContent.client.commsCreateList({ workspaceId: W1, name: 'n', description: GOODDESC, kind: 'other' }));
    const onlyAudience = make({}, ['read:comms', 'write:comms.audience']);
    await assert.rejects(() => onlyAudience.client.commsSetBrandKit({ workspaceId: W1, brandKit: { sender_name: 'x' } }));
    assert.equal(onlyContent.calls.length + onlyAudience.calls.length, 0);
  });
});
