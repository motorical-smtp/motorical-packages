// The hosted `communications` server in the catalogue (Comms MCP M2c). Its scopes are, as for every server, exactly the union of its
// tools' scopes: write/send/manage scopes are offered only when tools that need them exist (M3).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SERVER_TOOLS, TOOL_SCOPES, RESOURCE_SCOPES, scopesForTools, COMMS_CANONICAL_URI, COMMS_SCOPES, RESOURCE_SERVER_DEFAULTS, listGrantableScopes,
} = require('../src');

const WRITE_CONTENT = ['comms_create_template', 'comms_create_template_from_starter', 'comms_update_template', 'comms_apply_template_fixes', 'comms_duplicate_template', 'comms_set_brand_kit'];
const WRITE_AUDIENCE = ['comms_create_list', 'comms_update_list', 'comms_import_contacts', 'comms_remove_from_list', 'comms_derive_list', 'comms_unsubscribe_contact', 'comms_add_suppression'];
const READ_CONTACTS = ['comms_list_list_contacts', 'comms_find_contact'];
const CAMPAIGN_TOOLS = ['comms_create_campaign', 'comms_update_campaign', 'comms_duplicate_campaign', 'comms_preflight_campaign', 'comms_send_test'];

test('the communications server has the proof tools, the 17 read tools (M3-1), the 8 write tools (M3-2), the 7 contact tools (M3-3), the 5 campaign-draft tools (M3-4) and whoami', () => {
  const t = SERVER_TOOLS.communications;
  assert.equal(t.length, 40);
  for (const n of CAMPAIGN_TOOLS) assert.ok(t.includes(n), n);
  for (const n of READ_CONTACTS) assert.ok(t.includes(n), n);
  assert.deepEqual(t.slice(0, 2), ['comms_get_readiness', 'comms_get_map']);
  assert.equal(t[t.length - 1], 'motorical_whoami');
  assert.equal(new Set(t).size, t.length, 'no duplicates');
  for (const n of [...WRITE_CONTENT, ...WRITE_AUDIENCE]) assert.ok(t.includes(n), n);
});

test('content tools need write:comms.content, list-card tools need write:comms.audience, everything else read:comms', () => {
  for (const n of WRITE_CONTENT) assert.deepEqual(TOOL_SCOPES[n], ['write:comms.content'], n);
  for (const n of WRITE_AUDIENCE) assert.deepEqual(TOOL_SCOPES[n], ['write:comms.audience'], n);
  for (const n of SERVER_TOOLS.communications.filter((x) => x.startsWith('comms_') && ![...WRITE_CONTENT, ...WRITE_AUDIENCE, ...CAMPAIGN_TOOLS].includes(x))) assert.deepEqual(TOOL_SCOPES[n], ['read:comms'], n);
});

test('the campaign-draft tools all need write:comms.content', () => {
  for (const n of CAMPAIGN_TOOLS) assert.deepEqual(TOOL_SCOPES[n], ['write:comms.content'], n);
});

test('contact reads need read:comms only', () => {
  for (const n of READ_CONTACTS) assert.deepEqual(TOOL_SCOPES[n], ['read:comms'], n);
});

test('the server offers exactly read + audience + content: no sending, no workspace, no webhook scope', () => {
  assert.deepEqual([...scopesForTools(SERVER_TOOLS.communications)].sort(), ['read:comms', 'write:comms.audience', 'write:comms.content']);
});

test('no communications tool can delete, erase, export, resubscribe, send, schedule or cancel', () => {
  // M3-3 adds import/remove/unsubscribe as GATED, dry-run-by-default contact tools; the genuinely dangerous verbs stay absent.
  // comms_send_test is the one name with "send": it goes to the account owner only (no recipient input). Nothing may schedule or cancel.
  const bad = SERVER_TOOLS.communications.filter((n) => /(delete|erase|purge|export|resubscribe|send|schedule|cancel|restore)/i.test(n) && n !== 'comms_send_test');
  assert.deepEqual(bad, []);
  assert.deepEqual(SERVER_TOOLS.communications.filter((n) => /send/i.test(n)), ['comms_send_test']);
});


test('both tools need read:comms and nothing else', () => {
  assert.deepEqual(TOOL_SCOPES.comms_get_readiness, ['read:comms']);
  assert.deepEqual(TOOL_SCOPES.comms_get_map, ['read:comms']);
});

test('its canonical URI is the one the delegation and the grants use, and it offers only what its tools need', () => {
  assert.deepEqual([...RESOURCE_SCOPES[COMMS_CANONICAL_URI]].sort(), ['read:comms', 'write:comms.audience', 'write:comms.content']);
  assert.equal(COMMS_CANONICAL_URI, 'https://mcp.motorical.com/v1/motorical_communications/mcp');
});

test('the main server and every other server carry no Communications tool or scope', () => {
  for (const [key, tools] of Object.entries(SERVER_TOOLS)) { // whoami is deliberately shared
    if (key === 'communications') continue;
    for (const t of tools) assert.ok(!t.startsWith('comms_'), `${key} lists ${t}`);
  }
  for (const [uri, scopes] of Object.entries(RESOURCE_SCOPES)) {
    if (uri === COMMS_CANONICAL_URI) continue;
    for (const s of scopes) assert.ok(!COMMS_SCOPES.includes(s), `${uri} offers ${s}`);
  }
});

test('sending, workspace and webhook scopes stay grantable in name but are offered by no server yet', () => {
  for (const s of COMMS_SCOPES.slice(3)) {
    assert.ok(listGrantableScopes().includes(s));
    assert.ok(!RESOURCE_SCOPES[COMMS_CANONICAL_URI].includes(s));
  }
});

test('a new communications resource row is created marketing-only and DISABLED: it must be switched on deliberately', () => {
  assert.deepEqual(RESOURCE_SERVER_DEFAULTS[COMMS_CANONICAL_URI], { blockTypes: ['marketing'], enabled: false });
});
