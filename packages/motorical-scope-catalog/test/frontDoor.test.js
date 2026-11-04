// The front door: the main server also carries the Communications tools (spec 2026-11-04 section 1).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SERVER_TOOLS, TOOL_SCOPES, RESOURCE_SCOPES, MCP_HOST, COMMS_SCOPES,
  MAIN_BASE_TOOLS, groupForConsentByTask, permissionHint, PERMISSION_REFRESH_SENTENCE,
} = require('../src');

const MAIN_URI = `${MCP_HOST}/v1/motorical/mcp`;

test('main lists the union: its old tools first, in the old order, then every communications tool', () => {
  assert.deepEqual(SERVER_TOOLS.main.slice(0, MAIN_BASE_TOOLS.length), MAIN_BASE_TOOLS);
  for (const t of SERVER_TOOLS.communications) {
    assert.ok(SERVER_TOOLS.main.includes(t), t);
  }
  assert.equal(new Set(SERVER_TOOLS.main).size, SERVER_TOOLS.main.length, 'no duplicates');
});

test('main offers every communications scope, and the narrow servers are unchanged', () => {
  for (const s of COMMS_SCOPES) assert.ok(RESOURCE_SCOPES[MAIN_URI].includes(s), s);
  assert.ok(!RESOURCE_SCOPES[`${MCP_HOST}/v1/motorical_analytics/mcp`].includes('read:comms'));
  assert.ok(!SERVER_TOOLS.analytics.some((t) => t.startsWith('comms_')));
  assert.ok(!SERVER_TOOLS.transactional.some((t) => t.startsWith('comms_')));
});

test('every main tool still has a scope entry', () => {
  for (const t of SERVER_TOOLS.main) assert.ok(TOOL_SCOPES[t], t);
});

test('consent groups by task, not by scope name', () => {
  const g = groupForConsentByTask(['send:transactional', 'read:analytics', 'manage:domains', 'read:comms', 'write:comms.audience', 'write:comms.content', 'send:comms.campaign']);
  const labels = g.map((x) => x.label);
  assert.ok(labels.some((l) => /transactional email/i.test(l)));
  assert.ok(labels.some((l) => /newsletters and lists/i.test(l)));
  assert.ok(labels.some((l) => /domains/i.test(l)));
  // Sending to contacts is never folded under editing.
  const sending = g.find((x) => x.scopes.includes('send:comms.campaign'));
  assert.deepEqual(sending.scopes, ['send:comms.campaign']);
  // Every granted scope is listed exactly once.
  const all = g.flatMap((x) => x.scopes).sort();
  assert.deepEqual(all, [...new Set(all)]);
  assert.equal(all.length, 7);
  for (const x of g) assert.ok(x.label && x.resource);
});

test('a scope with no task falls back to its resource line instead of vanishing', () => {
  const g = groupForConsentByTask(['manage:motor-blocks']);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].scopes, ['manage:motor-blocks']);
});

test('the permission hint is generated from TOOL_SCOPES and names the scope, the place and the refresh step', () => {
  const h = permissionHint('comms_schedule_campaign');
  assert.match(h.marker, /send:comms\.campaign/);
  assert.match(h.error, /send:comms\.campaign/);
  assert.match(h.error, /Settings/);
  assert.ok(h.error.includes(PERMISSION_REFRESH_SENTENCE));
  assert.equal(permissionHint('motorical_whoami'), null, 'an any-grant tool never needs permission');
  assert.throws(() => permissionHint('no_such_tool'));
});
