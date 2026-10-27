// The Communications scopes (Comms MCP M2a; spec: motorical-docs specs/2026-10-27-comms-mcp-m2-auth-delegation-scopes-design.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SCOPES, listGrantableScopes, expandMcpImplied, groupForConsent, publicScopesFor,
  COMMS_SCOPES, COMMS_INITIAL_SCOPES, COMMS_CANONICAL_URI, COMMS_DELEGATION_AUDIENCE, MCP_HOST,
} = require('../src');

const EXPECTED = ['read:comms', 'write:comms.audience', 'write:comms.content', 'send:comms.campaign', 'manage:comms.workspace', 'manage:comms.webhooks'];

test('six scopes, in a fixed order, all defined in the catalogue', () => {
  assert.deepEqual(COMMS_SCOPES, EXPECTED);
  for (const id of EXPECTED) assert.ok(SCOPES[id], `${id} is defined`);
  assert.deepEqual(listGrantableScopes().filter((s) => s.endsWith('comms') || s.includes('comms.')), EXPECTED);
});

test('the comms scopes come after the existing nine, so existing scope order is untouched', () => {
  const ids = Object.keys(SCOPES);
  assert.deepEqual(ids.slice(0, 9), ['send:transactional', 'read:analytics', 'manage:domains', 'manage:motor-blocks', 'manage:sandbox', 'manage:recipients', 'manage:webhooks', 'read:webhooks', 'read:domains']);
  assert.deepEqual(ids.slice(9), EXPECTED);
});

test('every comms scope is fully described and none unlocks a Public API scope', () => {
  for (const id of EXPECTED) {
    const s = SCOPES[id];
    assert.ok(s.agentDescription.length > 30 && s.customerAction.length > 10, id);
    assert.ok(s.level === 'read' || s.level === 'manage', id);
    assert.deepEqual(s.publicScopes, [], `${id} must not reach the Public API`);
  }
  assert.deepEqual(publicScopesFor(EXPECTED), []);
});

test('no scope is a destructive one: permanent delete, purge and GDPR are never grantable', () => {
  for (const id of Object.keys(SCOPES)) assert.doesNotMatch(id, /delete|purge|erase|gdpr|destroy/i);
  for (const id of EXPECTED) assert.doesNotMatch(SCOPES[id].agentDescription, /permanently delete|erase|purge/i, id);
});

test('every write, send and manage scope implies read:comms; read implies nothing more', () => {
  for (const id of EXPECTED.slice(1)) assert.ok(expandMcpImplied([id]).includes('read:comms'), id);
  assert.deepEqual(expandMcpImplied(['read:comms']), ['read:comms']);
  assert.ok(!expandMcpImplied(['write:comms.content']).includes('send:comms.campaign'), 'writing content never implies sending');
  assert.ok(!expandMcpImplied(['send:comms.campaign']).includes('write:comms.audience'));
});

test('the first consent is read plus the two writes; sending and managing are a step-up', () => {
  assert.deepEqual(COMMS_INITIAL_SCOPES, ['read:comms', 'write:comms.audience', 'write:comms.content']);
  for (const id of COMMS_INITIAL_SCOPES) assert.ok(COMMS_SCOPES.includes(id));
  for (const id of ['send:comms.campaign', 'manage:comms.workspace', 'manage:comms.webhooks']) assert.ok(!COMMS_INITIAL_SCOPES.includes(id));
});

const EDIT_LINE = 'View and edit your lists, contacts, templates and campaign drafts, and send test emails to you. This never emails your contacts.';

test('the consent screen: view and edit is ONE line, sending is its own line (grants stay simple, owner principle 2026-10-27)', () => {
  const lines = groupForConsent(COMMS_SCOPES);
  assert.equal(lines.length, 4, 'view+edit, send, workspace settings, webhooks');
  const edit = lines.find((l) => l.scopes.includes('read:comms'));
  assert.deepEqual(edit.scopes, ['read:comms', 'write:comms.audience', 'write:comms.content']);
  assert.equal(edit.label, EDIT_LINE);
  const send = lines.find((l) => l.scopes.includes('send:comms.campaign'));
  assert.deepEqual(send.scopes, ['send:comms.campaign']);
  assert.match(send.label, /send campaigns to your contacts/i);
  assert.ok(!send.label.includes('never emails'), 'the sending line must not borrow the reassurance');
});

test('the FIRST consent shows exactly one line; the send step-up adds exactly one more', () => {
  const first = groupForConsent(COMMS_INITIAL_SCOPES);
  assert.equal(first.length, 1);
  assert.equal(first[0].label, EDIT_LINE);
  const stepUp = groupForConsent([...COMMS_INITIAL_SCOPES, 'send:comms.campaign']);
  assert.equal(stepUp.length, 2);
});

test('a read-only grant still shows the read-only wording, and a single write scope shows the edit line', () => {
  assert.equal(groupForConsent(['read:comms'])[0].label, 'View your lists, templates, campaigns and results');
  assert.equal(groupForConsent(['write:comms.content'])[0].label, EDIT_LINE);
  assert.equal(groupForConsent(['write:comms.audience'])[0].label, EDIT_LINE);
});

test('the canonical URI and the delegation audience are comms-specific and distinct from the backend audience', () => {
  assert.equal(COMMS_CANONICAL_URI, `${MCP_HOST}/v1/motorical_communications/mcp`);
  assert.equal(COMMS_DELEGATION_AUDIENCE, 'https://api.motorical.com/internal/mcp/comms');
  assert.notEqual(COMMS_DELEGATION_AUDIENCE, 'https://api.motorical.com/internal/mcp');
});
