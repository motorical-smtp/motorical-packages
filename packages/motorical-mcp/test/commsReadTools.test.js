// The read family of the Communications MCP (M3-1): 17 read-only tools over the Comms Block, one declarative table.
// Reads only; no new scope (read:comms); lists are paged with a cap; no real contact data; ids checked before any network call.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createDelegatedClient } from '../src/delegatedClient.js';
import { SERVERS, TOOL_ROUTES, HOSTED_ONLY_TOOLS, ALL_TOOLS } from '../src/servers.js';
import { TOOLS } from '../src/registry.js';
import { COMMS_READ_TOOLS } from '../src/commsReadTools.js';
import { TOOL_SCOPES, SERVER_TOOLS } from '@motorical/scope-catalog';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const signer = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'k1' };
const server = SERVERS.find((s) => s.key === 'communications');
const W1 = '33333333-3333-4333-8333-333333333333';
const ID1 = '55555555-5555-4555-8555-555555555555';
const ID2 = '66666666-6666-4666-8666-666666666666';
const claims = (scopes = ['read:comms']) => ({ grantId: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222', scopes, motorBlockIds: [] });
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const make = (responder, scopes) => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return responder(url, init); };
  const client = createDelegatedClient({ claims: claims(scopes), server, signer, apiBaseUrl: 'http://backend.test', commsBaseUrl: 'http://comms.test/api', fetchImpl });
  return { client, calls };
};
const ok = (data) => json(200, { success: true, data });
const byName = (n) => TOOLS.find((t) => t.name === n);

const EXPECTED = [
  'comms_list_workspaces', 'comms_list_marketing_blocks',
  'comms_list_lists', 'comms_get_list', 'comms_compare_lists', 'comms_get_list_relations',
  'comms_list_templates', 'comms_get_template', 'comms_get_template_rules', 'comms_lint_template', 'comms_suggest_template_fixes',
  'comms_check_links', 'comms_preview_template', 'comms_list_starters', 'comms_get_brand_kit',
  'comms_list_campaigns', 'comms_get_campaign',
];

describe('the read family is registered everywhere', () => {
  test('the table, the catalogue and the server row agree on the same 17 read tools (plus the proof tools, the write tools of M3-2, the contact tools of M3-3, the campaign tools of M3-4, the send tools of M3-5 and whoami)', () => {
    assert.deepEqual(COMMS_READ_TOOLS.map((t) => t.tool).sort(), [...EXPECTED].sort());
    for (const n of EXPECTED) assert.ok(SERVER_TOOLS.communications.includes(n), `${n} in the catalogue server list`);
    const WRITES = ['comms_create_template', 'comms_create_template_from_starter', 'comms_update_template', 'comms_apply_template_fixes', 'comms_duplicate_template', 'comms_set_brand_kit', 'comms_create_list', 'comms_update_list'];
    const CONTACTS = ['comms_list_list_contacts', 'comms_find_contact', 'comms_import_contacts', 'comms_remove_from_list', 'comms_derive_list', 'comms_unsubscribe_contact', 'comms_add_suppression', 'comms_list_imports', 'comms_get_dashboard_link', 'comms_undo_import', 'comms_set_list_archived', 'comms_add_suppressions', 'comms_delete_list', 'comms_delete_contact', 'comms_cleanup_orphan_contacts', 'comms_resubscribe_contact'];
    const CAMPAIGNS = ['comms_create_campaign', 'comms_update_campaign', 'comms_duplicate_campaign', 'comms_preflight_campaign', 'comms_send_test', 'comms_schedule_campaign', 'comms_cancel_campaign'];
    const MANAGE = ['comms_get_workspace_settings', 'comms_list_webhooks', 'comms_create_workspace', 'comms_update_workspace', 'comms_update_workspace_settings', 'comms_add_sending_identity', 'comms_update_webhook', 'comms_delete_webhook', 'comms_test_webhook'];
    const REPORTS = ['comms_get_campaign_report', 'comms_get_campaign_links', 'comms_get_campaign_timeline', 'comms_list_campaign_events', 'comms_get_analytics_overview'];
    assert.deepEqual([...server.tools].sort(), [...EXPECTED, ...WRITES, ...CONTACTS, ...CAMPAIGNS, ...REPORTS, ...MANAGE, 'comms_get_readiness', 'comms_get_map', 'motorical_whoami'].sort());
  });
  test('every read tool needs only read:comms (the write scopes come in through the write tools, never through a read tool)', () => {
    for (const n of EXPECTED) assert.deepEqual(TOOL_SCOPES[n], ['read:comms'], n);
  });
  test('every tool is hosted-only, absent from the main server, and wraps a documented Comms route', () => {
    for (const n of EXPECTED) {
      assert.ok(HOSTED_ONLY_TOOLS.includes(n), `${n} hosted-only`);
      assert.ok(!ALL_TOOLS.includes(n), `${n} not on main`);
      const r = TOOL_ROUTES[n];
      assert.ok(r && ['GET', 'POST'].includes(r.method) && r.path.startsWith('/comm-api/api/'), `${n} route`);
    }
  });
  test('every tool is in the registry: read-only, non-destructive, idempotent, documented', () => {
    for (const n of EXPECTED) {
      const t = byName(n);
      assert.ok(t, `${n} registered`);
      assert.equal(t.annotations.readOnlyHint, true, n);
      assert.equal(t.annotations.destructiveHint, false, n);
      assert.equal(t.annotations.idempotentHint, true, n);
      assert.ok(t.description.length > 100, `${n} description`);
      if (n !== 'comms_list_workspaces') assert.ok(t.inputSchema.workspaceId, `${n} takes workspaceId`);
    }
  });
  test('the only POSTs are the four read-only ones (lint, fix, check-links, preview); nothing here writes', () => {
    const posts = COMMS_READ_TOOLS.filter((t) => t.http === 'POST').map((t) => TOOL_ROUTES[t.tool].path).sort();
    assert.deepEqual(posts, ['/comm-api/api/templates/check-links', '/comm-api/api/templates/fix', '/comm-api/api/templates/lint', '/comm-api/api/templates/preview']);
    assert.ok(COMMS_READ_TOOLS.every((t) => t.http === 'GET' || t.http === 'POST'));
  });
  test('the preview takes sample data only: a real contact never reaches the chat in this slice', () => {
    const shape = byName('comms_preview_template').inputSchema;
    assert.ok(shape.sample);
    assert.ok(!('contactId' in shape) && !('contact_id' in shape));
  });
});

describe('workspace and id handling', () => {
  test('list_workspaces is account-level: it names no workspace in X-Tenant-Id', async () => {
    const { client, calls } = make(() => ok([{ id: W1, name: 'Shop', isDefault: true, status: 'active' }]));
    const out = await client.commsListWorkspaces({});
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://comms.test/api/workspaces');
    assert.equal(calls[0].init.headers['X-Tenant-Id'], undefined);
    assert.equal(out.data[0].isDefault, true);
  });
  test('a workspace tool with a named workspace goes straight there (no lookup)', async () => {
    const { client, calls } = make(() => ok({ id: ID1 }));
    await client.commsGetList({ workspaceId: W1, id: ID1 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `http://comms.test/api/lists/${ID1}`);
    assert.equal(calls[0].init.headers['X-Tenant-Id'], W1);
  });
  test('a workspace tool without workspaceId and one covered workspace looks it up first', async () => {
    const { client, calls } = make((url) => (url.endsWith('/workspaces') ? ok([{ id: W1, name: 'Shop', status: 'active', isDefault: true }]) : ok([])));
    await client.commsListTemplates({});
    assert.ok(calls[0].url.endsWith('/workspaces'));
    assert.equal(calls[1].init.headers['X-Tenant-Id'], W1);
  });
  test('a malformed id is refused BEFORE any network call', async () => {
    const { client, calls } = make(() => ok({}));
    await assert.rejects(() => client.commsGetList({ workspaceId: W1, id: 'not-a-uuid' }), (e) => e.data.code === 'INVALID_ID');
    await assert.rejects(() => client.commsGetCampaign({ workspaceId: W1, id: '../x' }), (e) => e.data.code === 'INVALID_ID');
    await assert.rejects(() => client.commsCompareLists({ workspaceId: W1, a: ID1, b: 'nope' }), (e) => e.data.code === 'INVALID_ID');
    assert.equal(calls.length, 0);
  });
  test('a grant without read:comms is refused before any network call', async () => {
    const { client, calls } = make(() => ok({}), ['send:transactional']);
    await assert.rejects(() => client.commsListLists({ workspaceId: W1 }));
    assert.equal(calls.length, 0);
  });
});

describe('paging: every list tool is capped', () => {
  const many = (n) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, name: `n${i}` }));
  test('default 50, with page info and a truncated flag', async () => {
    const { client } = make(() => ok(many(120)));
    const out = await client.commsListLists({ workspaceId: W1 });
    assert.equal(out.data.length, 50);
    assert.deepEqual(out.page, { total: 120, limit: 50, offset: 0, returned: 50, truncated: true });
  });
  test('limit is capped at 200 and offset pages on', async () => {
    const { client } = make(() => ok(many(300)));
    const big = await client.commsListTemplates({ workspaceId: W1, limit: 9999 });
    assert.equal(big.data.length, 200);
    const next = await client.commsListTemplates({ workspaceId: W1, limit: 100, offset: 250 });
    assert.equal(next.data.length, 50);
    assert.equal(next.page.truncated, false);
    assert.equal(next.data[0].id, 'id-250');
  });
  test('campaigns are listed compact (no artifact bodies)', async () => {
    const { client, calls } = make(() => ok(many(3)));
    await client.commsListCampaigns({ workspaceId: W1 });
    assert.equal(calls[0].url, 'http://comms.test/api/campaigns?compact=true');
  });
  test('a short list is returned whole, truncated:false', async () => {
    const { client } = make(() => ok(many(3)));
    const out = await client.commsListLists({ workspaceId: W1 });
    assert.equal(out.data.length, 3);
    assert.equal(out.page.truncated, false);
  });
});

describe('each tool calls its route', () => {
  const cases = [
    ['commsListMarketingBlocks', { workspaceId: W1 }, 'GET', '/workspaces/current/motor-blocks'],
    ['commsCompareLists', { workspaceId: W1, a: ID1, b: ID2 }, 'GET', `/lists/compare?a=${ID1}&b=${ID2}`],
    ['commsGetListRelations', { workspaceId: W1, id: ID1 }, 'GET', `/lists/${ID1}/relations`],
    ['commsGetTemplate', { workspaceId: W1, id: ID1 }, 'GET', `/templates/${ID1}`],
    ['commsGetTemplateRules', { workspaceId: W1 }, 'GET', '/templates/rules'],
    ['commsListStarters', { workspaceId: W1 }, 'GET', '/templates/starters'],
    ['commsGetBrandKit', { workspaceId: W1 }, 'GET', '/settings/brand-kit'],
    ['commsGetCampaign', { workspaceId: W1, id: ID1 }, 'GET', `/campaigns/${ID1}`],
  ];
  for (const [method, args, http, path] of cases) {
    test(`${method} -> ${http} ${path}`, async () => {
      const { client, calls } = make(() => ok({}));
      await client[method](args);
      assert.equal(calls[0].init.method, http);
      assert.equal(calls[0].url, `http://comms.test/api${path}`);
      assert.equal(calls[0].init.headers['X-Tenant-Id'], W1);
    });
  }
});

describe('the template tools that read a draft', () => {
  test('lint by saved template sends template_id in a JSON POST', async () => {
    const { client, calls } = make(() => ok({ findings: [] }));
    await client.commsLintTemplate({ workspaceId: W1, templateId: ID1 });
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].url, 'http://comms.test/api/templates/lint');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), { template_id: ID1 });
  });
  test('lint of an unsaved draft sends the draft fields in snake_case', async () => {
    const { client, calls } = make(() => ok({}));
    await client.commsLintTemplate({ workspaceId: W1, subject: 'Hi', bodyHtml: '<p>x</p>', bodyText: 'x' });
    assert.deepEqual(JSON.parse(calls[0].init.body), { subject: 'Hi', body_html: '<p>x</p>', body_text: 'x' });
  });
  test('giving neither a template nor a draft is refused locally', async () => {
    const { client, calls } = make(() => ok({}));
    await assert.rejects(() => client.commsCheckLinks({ workspaceId: W1 }), (e) => e.data.code === 'MISSING_TEMPLATE');
    assert.equal(calls.length, 0);
  });
  test('giving both a template and a draft is refused: the agent must not guess which wins', async () => {
    const { client, calls } = make(() => ok({}));
    await assert.rejects(() => client.commsLintTemplate({ workspaceId: W1, templateId: ID1, bodyHtml: '<p>x</p>' }), (e) => e.data.code === 'AMBIGUOUS_TEMPLATE');
    assert.equal(calls.length, 0);
  });
  test('suggest_template_fixes can narrow to fix types, and says nothing was saved (the API already does)', async () => {
    const { client, calls } = make(() => ok({ applied: false }));
    const out = await client.commsSuggestTemplateFixes({ workspaceId: W1, templateId: ID1, types: ['merge_variable_fallback'] });
    assert.equal(calls[0].url, 'http://comms.test/api/templates/fix');
    assert.deepEqual(JSON.parse(calls[0].init.body), { template_id: ID1, types: ['merge_variable_fallback'] });
    assert.equal(out.data.applied, false);
  });
  test('preview passes the sample, never a contact id', async () => {
    const { client, calls } = make(() => ok({}));
    await client.commsPreviewTemplate({ workspaceId: W1, templateId: ID1, sample: { name: 'Ada', email: 'ada@example.com', identity_name: 'Ada L' }, contactId: ID2 });
    assert.deepEqual(JSON.parse(calls[0].init.body), { template_id: ID1, sample: { name: 'Ada', email: 'ada@example.com', identity_name: 'Ada L' } });
  });
});

describe('errors keep their data and never leak', () => {
  test('a Comms Block refusal keeps its code', async () => {
    const { client } = make(() => json(404, { success: false, error: 'List not found', code: 'LIST_NOT_FOUND' }));
    await assert.rejects(() => client.commsGetList({ workspaceId: W1, id: ID1 }), (e) => e.status === 404 && e.data.code === 'LIST_NOT_FOUND');
  });
});
