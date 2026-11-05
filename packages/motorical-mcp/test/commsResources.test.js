// The communications resources (Comms MCP M4-2): four reference pages an agent can read instead of remembering. Numbers come from the published
// agent-facts.json (generated from commsPolicy.js), vocabularies from the constants the tools themselves validate with, the rulebook from the
// Comms API's own endpoint, so none of them is typed twice.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { COMMS_RESOURCES } from '../src/commsResources.js';
import { SERVERS } from '../src/servers.js';
import { dispatchNative } from '../src/native/dispatch.js';
import { createMotoricalMcpServer } from '../src/server.js';
import { SUPPRESSION_REASONS, DERIVE_OPERATIONS } from '../src/commsContactTools.js';
import { WEBHOOK_EVENTS } from '../src/commsManageTools.js';
import { EVENT_TYPES } from '../src/commsReportTools.js';
import { TEMPLATE_KINDS, LIST_KINDS, BRAND_FONTS } from '../src/commsWriteTools.js';

const srv = SERVERS.find((s) => s.key === 'communications');
const URIS = ['motorical://comms/how-sending-works', 'motorical://comms/limits-and-pacing', 'motorical://comms/vocabularies', 'motorical://comms/template-rulebook'];
const FACTS = { policy: { comms: { testSendPerCampaignPerHour: 5, testSendPerAccountPerDay: 20, mergeFallbackMaxChars: 100, maxCampaignDays: 7, accountSharePercent: 80,
  bulkTemplateDeleteMax: 100, agentMinLeadMinutes: 15, agentMaxLeadDays: 90, agentSchedulesPerDay: 3, preflightMaxAgeMinutes: 30, mcpEventsPageSize: 50, agentWebhookTestsPerHour: 5 } } };
const client = (over = {}) => ({
  fetchDocs: async (p) => { if (p !== '/agent-facts.json') throw new Error(`unexpected ${p}`); return JSON.stringify(FACTS); },
  commsGetTemplateRules: async () => ({ success: true, rules: { maxHtmlBytes: 102400, findings: ['NO_UNSUBSCRIBE_LINK'] } }),
  ...over,
});
const read = async (uri, c = client(), server = srv) => dispatchNative({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri } }, { server, client: c, version: '1.5.0' });
const textOf = async (uri, c) => (await read(uri, c)).result.contents[0].text;

describe('the table', () => {
  test('four resources with the agreed uris, names, descriptions and mime types', () => {
    assert.deepEqual(COMMS_RESOURCES.map((r) => r.uri), URIS);
    for (const r of COMMS_RESOURCES) assert.ok(r.name && r.description.length > 20 && r.mimeType && typeof r.handler === 'function', r.uri);
  });
});

describe('native resources/list and resources/read', () => {
  test('the communications server and the front door (main) list them next to the public docs; no other server does', async () => {
    const res = await dispatchNative({ jsonrpc: '2.0', id: 1, method: 'resources/list' }, { server: srv, client: {}, version: '1.5.0' });
    const uris = res.result.resources.map((r) => r.uri);
    for (const u of URIS) assert.ok(uris.includes(u), u);
    assert.ok(uris.includes('motorical://docs/agents-hub'));
    assert.ok(res.result.resources.every((r) => !('handler' in r)));
    const mainRes = await dispatchNative({ jsonrpc: '2.0', id: 9, method: 'resources/list' }, { server: SERVERS.find((x) => x.key === 'main'), client: {}, version: '1.5.0' });
    for (const u of URIS) assert.ok(mainRes.result.resources.map((r) => r.uri).includes(u), `main lists ${u}`);
    for (const s of SERVERS.filter((x) => !['communications', 'main'].includes(x.key))) {
      const other = await dispatchNative({ jsonrpc: '2.0', id: 2, method: 'resources/list' }, { server: s, client: {}, version: '1.5.0' });
      assert.ok(other.result.resources.every((r) => !r.uri.startsWith('motorical://comms/')), s.key);
    }
  });
  test('they are private (they follow the connection), readable on the front door, and unreadable on other servers', async () => {
    const res = await read(URIS[0]);
    assert.equal(res.result.cacheScope, 'private');
    const main = SERVERS.find((s) => s.key === 'main');
    assert.equal((await read(URIS[0], client(), main)).result.cacheScope, 'private');
    const analytics = SERVERS.find((s) => s.key === 'analytics');
    assert.equal((await read(URIS[0], client(), analytics)).error.code, -32602);
  });
});

describe('how sending works', () => {
  test('states the facts the runbook says the agent can rely on, with no policy numbers', async () => {
    const t = await textOf(URIS[0]);
    for (const re of [/workspace/i, /marketing Motor Block/i, /unsubscribe_url/, /account-wide/i, /owner/i, /compiled/i, /closed/i, /estimate|upper bound/i]) assert.match(t, re, String(re));
    assert.doesNotMatch(t, /\b\d+\s*(minutes?|hours?|days?|percent|%|per (hour|day|campaign))\b/i);
    assert.match(t, /motorical:\/\/comms\/limits-and-pacing/, 'numbers are one page away');
  });
});

describe('limits and pacing', () => {
  test('every number is rendered from the published agent-facts policy (fetched at read time)', async () => {
    const seen = [];
    const t = await textOf(URIS[1], client({ fetchDocs: async (p) => { seen.push(p); return JSON.stringify(FACTS); } }));
    assert.deepEqual(seen, ['/agent-facts.json']);
    const p = FACTS.policy.comms;
    for (const v of [p.testSendPerCampaignPerHour, p.testSendPerAccountPerDay, p.mergeFallbackMaxChars, p.maxCampaignDays, p.accountSharePercent, p.agentMinLeadMinutes, p.agentMaxLeadDays, p.agentSchedulesPerDay, p.preflightMaxAgeMinutes]) {
      assert.match(t, new RegExp(`\\b${v}\\b`), `missing ${v}`);
    }
  });
  test('a changed policy changes the page (nothing is typed twice)', async () => {
    const changed = { policy: { comms: { ...FACTS.policy.comms, agentSchedulesPerDay: 7, agentMinLeadMinutes: 42 } } };
    const t = await textOf(URIS[1], client({ fetchDocs: async () => JSON.stringify(changed) }));
    assert.match(t, /\b7\b/); assert.match(t, /\b42\b/);
    assert.doesNotMatch(t, /\b3 campaigns\b/);
  });
  test('explains waiting for a limit: it resumes by itself, and the agent never raises a limit', async () => {
    const t = await textOf(URIS[1]);
    assert.match(t, /resume/i); assert.match(t, /never/i);
  });
  test('missing policy data is an honest error, not an empty page', async () => {
    const res = await read(URIS[1], client({ fetchDocs: async () => JSON.stringify({ policy: {} }) }));
    assert.equal(res.error.code, -32603);
    assert.match(res.error.message, /policy/i);
  });
});

describe('vocabularies', () => {
  test('are generated from the constants the tools validate with', async () => {
    const data = JSON.parse(await textOf(URIS[2]));
    assert.deepEqual(data.suppressionReasons, SUPPRESSION_REASONS);
    assert.deepEqual(data.deriveOperations, DERIVE_OPERATIONS);
    assert.deepEqual(data.webhookEvents, WEBHOOK_EVENTS);
    assert.deepEqual(data.eventTypes, EVENT_TYPES);
    assert.deepEqual(data.templateKinds, TEMPLATE_KINDS);
    assert.deepEqual(data.listKinds, LIST_KINDS);
    assert.deepEqual(data.brandFonts, BRAND_FONTS);
  });
  test('says where the rest comes from instead of listing it by hand', async () => {
    const data = JSON.parse(await textOf(URIS[2]));
    assert.match(data.note, /comms_get_template_rules/);
    assert.match(data.note, /comms_get_campaign/);
  });
});

describe('template rulebook', () => {
  test('a revoked or refused grant is an error, not a readable page (401 and 403 are never swallowed by the fallback)', async () => {
    for (const status of [401, 403]) {
      const res = await read(URIS[3], client({ commsGetTemplateRules: async () => { throw Object.assign(new Error('authorization_revoked'), { status, data: { code: 'authorization_revoked' } }); } }));
      assert.equal(res.error.code, -32603, `status ${status}`);
      assert.match(res.error.message, /authorization_revoked/);
      assert.equal(res.result, undefined);
    }
  });
  test('is the Comms API rulebook as returned, nothing added', async () => {
    const data = JSON.parse(await textOf(URIS[3]));
    assert.deepEqual(data, { success: true, rules: { maxHtmlBytes: 102400, findings: ['NO_UNSUBSCRIBE_LINK'] } });
  });
  test('when the rulebook cannot be read (for instance several workspaces and none named) it says so and points at the tool, rather than failing the read', async () => {
    const t = await textOf(URIS[3], client({ commsGetTemplateRules: async () => { throw new Error('This authorization covers several workspaces; pass workspaceId.'); } }));
    assert.match(t, /several workspaces/);
    assert.match(t, /comms_get_template_rules/);
  });
});

describe('the legacy path', () => {
  const registered = (serverKey) => Object.keys(createMotoricalMcpServer({ client: {}, serverKey }).server._registeredResources || {});
  test('the communications server and the front door (main) register them', () => {
    for (const u of URIS) assert.ok(registered('communications').includes(u), u);
    for (const u of URIS) assert.ok(registered('main').includes(u), `main: ${u}`);
    for (const key of ['domains', 'analytics']) assert.ok(URIS.every((u) => !registered(key).includes(u)), key);
  });
});
