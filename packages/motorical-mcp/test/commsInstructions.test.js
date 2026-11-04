// The communications server instructions (Comms MCP M4-1; plan: motorical-docs plans/2026-10-28-comms-mcp-m4-instructions-and-eval-scenes.md).
// They carry the twelve rules of the Agent's Code, the six workspace rules, what the agent cannot do and what only a person can do: cross-cutting
// guidance only. The procedure of each tool lives in that tool's description (one place), so nothing here can drift from it, and policy numbers
// (minutes, days, caps) never appear here: they live in commsPolicy.js and in the tool descriptions that a backend test checks against it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instructionsFor } from '../src/instructions.js';
import { SERVERS } from '../src/servers.js';
import { TOOLS } from '../src/registry.js';
import { TOOL_SCOPES, COMMS_INITIAL_SCOPES } from '@motorical/scope-catalog';

const srv = SERVERS.find((s) => s.key === 'communications');
const text = instructionsFor('communications');
const section = (title) => {
  const i = text.indexOf(title);
  assert.ok(i >= 0, `section "${title}" is missing`);
  const rest = text.slice(i + title.length);
  const next = rest.search(/\n[A-Z][A-Z' ]{6,}:/);
  return next === -1 ? rest : rest.slice(0, next);
};
const MAX_CHARS = 9000;

describe('structure', () => {
  test('five labelled sections, in order: start, the rules, workspaces, cannot, people only', () => {
    const order = ['START HERE:', 'THE TWELVE RULES:', 'WORKSPACES:', 'WHAT YOU CANNOT DO:', 'ONLY A PERSON CAN:'].map((h) => text.indexOf(h));
    assert.ok(order.every((i) => i >= 0), `a section is missing: ${order.join()}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'sections out of order');
  });
  test('all twelve rules are present and numbered', () => {
    const rules = section('THE TWELVE RULES:');
    for (let n = 1; n <= 12; n += 1) assert.match(rules, new RegExp(`(^|\\n)${n}\\. `), `rule ${n} missing`);
    assert.doesNotMatch(rules, /(^|\n)13\. /);
  });
  test('the rules say what the plan requires: numbers from tools, preflight before sending, one confirmation, irreversible means a person, waiting is not failing', () => {
    const rules = section('THE TWELVE RULES:');
    assert.match(rules, /1\. Look before you act/i);
    assert.match(rules, /Numbers come from tools/i);
    assert.match(rules, /preflight/i);
    assert.match(rules, /exact action/i);
    assert.match(rules, /Irreversible means a person/i);
    assert.match(rules, /Waiting is not failing/i);
    assert.match(rules, /closed vocabular/i);
    assert.match(rules, /Privacy by default/i);
    assert.match(rules, /Fail honestly/i);
    assert.match(rules, /carry their own memory/i);
    assert.match(rules, /rulebook/i);
  });
  test('it stays under a size ceiling (it is read at the start of every session)', () => {
    assert.ok(text.length <= MAX_CHARS, `${text.length} characters`);
  });
});

describe('workspaces (rules 1 to 6 of specs/2026-10-27-comms-mcp-workspace-handling.md)', () => {
  const w = () => section('WORKSPACES:');
  test('a customer with one covered workspace never hears the word', () => assert.match(w(), /(^|\n)1\. .*never mention/i));
  test('several covered: explain once, ask once, the default first, the answer holds', () => {
    assert.match(w(), /(^|\n)2\. /); assert.match(w(), /once/i); assert.match(w(), /default/i);
  });
  test('the workspace is stated at the start of every answer: "Working in: ..."', () => assert.match(w(), /Working in:/));
  test('never split for the customer: a workspace is created only when they ask for separation', () => assert.match(w(), /(^|\n)4\. .*never/i));
  test('a request naming another brand is confirmed before acting there', () => assert.match(w(), /(^|\n)5\. .*confirm/i));
  test('a workspace outside the grant looks nonexistent: say so and point to re-authorizing; also covers one added after connecting', () => {
    assert.match(w(), /(^|\n)6\. /); assert.match(w(), /re-?authori[sz]|reconnect/i);
  });
});

describe('what you cannot do is true', () => {
  const names = TOOLS.map((t) => t.name);
  test('the section names each limit', () => {
    const c = section('WHAT YOU CANNOT DO:');
    for (const re of [/delet/i, /resubscribe/i, /export/i, /immediately|send now|right now/i, /default workspace/i, /create a webhook/i, /secret/i, /replace|remove.*sending/i, /real address|full address/i]) assert.match(c, re, String(re));
  });
  test('and there really is no tool that could do any of it (the one deliberate exception is deleting a webhook, which is confirm-gated)', () => {
    const commsTools = srv.tools.filter((n) => n.startsWith('comms_'));
    assert.deepEqual(commsTools.filter((n) => /(delete|erase|purge|export|resubscribe|restore|pause)/i.test(n)).sort(), ['comms_delete_contact', 'comms_delete_list', 'comms_delete_webhook', 'comms_resubscribe_contact']);
    for (const n of ['comms_create_webhook', 'comms_set_default_workspace', 'comms_remove_sending_identity', 'comms_replace_sending_identities', 'comms_delete_workspace', 'comms_send_now', 'comms_export_contacts']) {
      assert.ok(!names.includes(n), n);
    }
  });
});

describe('large contact lists', () => {
  test('a contact file or a large list is uploaded by the person in the dashboard import, and the handshake says so', () => {
    const p = section('ONLY A PERSON CAN:');
    assert.match(p, /upload/i);
    assert.match(p, /dashboard/i);
    assert.match(p, /contact (file|list)/i);
  });
});

describe('first sending identity', () => {
  test('START HERE says a first sending identity asks for the workspace permission, so the person is told before', () => {
    assert.match(section('START HERE:'), /sending identity[^.]*(permission|approval)/i);
  });
});

describe('permissions', () => {
  test('every tool that needs more than the first consent belongs to a family the instructions say is asked for later', () => {
    const later = srv.tools.filter((n) => (TOOL_SCOPES[n] || []).some((s) => !COMMS_INITIAL_SCOPES.includes(s)));
    assert.ok(later.length >= 9, `${later.length} step-up tools`);
    for (const n of later) assert.match(n, /(schedule|cancel|workspace|webhook|sending_identity|delete|cleanup|resubscribe)/, `${n} needs a step-up the instructions do not name`);
    const p = section('ONLY A PERSON CAN:') + section('START HERE:');
    for (const re of [/schedul/i, /cancel/i, /workspace/i, /webhook/i, /delet/i]) assert.match(p, re, String(re));
    assert.match(text, /new permission/i);
  });
});

describe('no drift, no duplication', () => {
  test('every comms_* or motorical_* name the text uses is a tool of this server', () => {
    const slugs = new Set(SERVERS.map((s) => s.slug));
    const named = new Set((text.match(/\b(comms|motorical)_[a-z0-9_]+\b/g) || []).filter((n) => !slugs.has(n)));
    assert.ok(named.size >= 6, 'the instructions should point at the key tools');
    for (const n of named) assert.ok(srv.tools.includes(n), `${n} is not on the communications server`);
  });
  test('procedures stay in the tool descriptions: no argument names, tokens or policy numbers here', () => {
    assert.doesNotMatch(text, /confirmToken|dryRun:?\s*false|preflightVersion|expectedUpdatedAt|consentConfirmed|idempotencyKey/);
    assert.doesNotMatch(text, /\b\d+\s*(minutes?|hours?|days?)\b|\ba day\b|\bper (day|hour)\b|\b\d+ (campaigns|events|test)/i);
  });
  test('the other servers\' instructions are not touched by this', () => {
    for (const key of ['main', 'transactional', 'domains', 'sandbox', 'motorBlocks', 'webhooks']) assert.doesNotMatch(instructionsFor(key), /THE TWELVE RULES/, key);
  });
  test('it keeps the hub pointer and the link rule, and says scheduled or queued is not delivered', () => {
    assert.match(text, /motorical:\/\/docs\/agents-hub/);
    assert.match(text, /markdown link/);
    assert.match(text, /scheduled or queued is not delivered/i);
  });
});

// Found by the 2026-10-31 cold walk (motorical-docs handovers/2026-10-31-comms-mcp-cold-walk-findings.md): a fresh agent read the shared
// transactional preamble first, met undefined words, and did not know which server verifies a domain.
describe('a cold agent can read the opening', () => {
  const opening = text.slice(0, text.indexOf('START HERE:'));
  test('no transactional boilerplate: nothing about a 202, dryRun on a new send, or being a transactional provider', () => {
    assert.doesNotMatch(text, /202|Accepted|dryRun|transactional email API|check the message status/);
    assert.match(opening, /marketing email/i);
  });
  test('defines workspace, sending identity, Motor Block and grant in plain words, once', () => {
    for (const re of [/a workspace is /i, /a sending identity is /i, /a Motor Block is /i, /a grant is /i]) assert.match(opening, re, String(re));
    assert.match(opening, /marketing Motor Block/i, 'ties the tools\' second name for a sending identity to the first');
  });
  test('names the separate domains server by address, and says it asks for its own sign-in', () => {
    const domains = SERVERS.find((s) => s.key === 'domains');
    assert.ok(opening.includes(domains.path), 'the domains server path is named');
    assert.match(opening, /own sign-in/i);
  });
  test('does not quote a plan name or price (they change); it points to readiness for the plan gate', () => {
    assert.doesNotMatch(text, /business plan|€|\bEUR\b|\$\d/i);
    assert.match(opening, /comms_get_readiness/);
  });
  test('the first approval named in START HERE is exactly the initial scopes (read, audience, content)', () => {
    assert.deepEqual([...COMMS_INITIAL_SCOPES].sort(), ['read:comms', 'write:comms.audience', 'write:comms.content']);
    assert.match(section('START HERE:'), /first approval lets you read, edit lists, contacts, templates and campaign drafts/);
  });
});
