import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../src/registry.js';
import { instructionsFor } from '../src/instructions.js';

const desc = (n) => TOOLS.find((t) => t.name === n).description;

test('no onboarding description or instruction hand-types a limit', () => {
  const text = [
    'motorical_sandbox_provision', 'motorical_sandbox_status', 'motorical_sandbox_convert', 'motorical_domain_add',
    'motorical_get_onboarding_state', 'motorical_free_recipient_add',
  ].map(desc).join(' ') + ['main', 'sandbox', 'domains'].map(instructionsFor).join(' ');
  assert.doesNotMatch(text, /\b(20|5|50|200|500|10)\s*(real|per|\/|recipients|sends|messages)/i);
});

test('sandbox_status explains the allowlist is the effective list and what domain.sandbox means', () => {
  const d = desc('motorical_sandbox_status');
  assert.match(d, /effective/i);
  assert.match(d, /confirmed/i);
  assert.match(d, /domain\.sandbox/);
});

test('sandbox_provision names the automatic own-domain sandbox', () => {
  assert.match(desc('motorical_sandbox_provision'), /own (verified )?domain/i);
  assert.match(desc('motorical_sandbox_provision'), /automatic/i);
});

test('the sandbox server instruction no longer says allowlisting is unavailable over OAuth, and points at the recipient tool', () => {
  const t = instructionsFor('sandbox');
  assert.doesNotMatch(t, /unavailable over OAuth regardless of scope/);
  assert.match(t, /motorical_free_recipient_add/);
  assert.match(t, /manage:recipients/);
});

test('main and domains instructions carry the decision rule', () => {
  for (const k of ['main', 'domains']) {
    assert.match(instructionsFor(k), /own domain/i);
    assert.match(instructionsFor(k), /no human|only trying|no domain/i);
  }
});

test('onboarding state describes options, choose and humanRequired', () => {
  const d = desc('motorical_get_onboarding_state');
  for (const w of ['own_domain', 'sandbox_domain', 'choose', 'humanRequired']) assert.match(d, new RegExp(w));
});

// Spec item 5: the consent note is text only. An authorization that predates manage:recipients must be re-approved.
test('the recipient scope re-consent note is in the state tool, the recipient tool and the sandbox instructions', () => {
  for (const text of [desc('motorical_get_onboarding_state'), desc('motorical_free_recipient_add'), instructionsFor('sandbox')]) {
    assert.match(text, /manage:recipients/);
    assert.match(text, /re-approved/);
  }
});

test('the domain tool tells a Free account about the one-domain rule', () => {
  assert.match(desc('motorical_domain_add'), /free_domain_limit/);
  assert.match(desc('motorical_domain_add'), /nextAction/);
});

test('sandbox_convert says the target is a verified real domain and an own-domain sandbox needs no DNS change', () => {
  const d = desc('motorical_sandbox_convert');
  assert.match(d, /verified real domain/);
  assert.match(d, /no DNS change/);
});

test('the sandbox server blurb carries the decision rule', () => {
  const t = instructionsFor('sandbox');
  assert.match(t, /own domain/i);
  assert.match(t, /only trying|no domain|no human/i);
});

test('automatic own-domain creation is always stated conditionally in the provision description', () => {
  assert.match(desc('motorical_sandbox_provision'), /Free account/);
  assert.match(desc('motorical_sandbox_provision'), /when automatic provisioning is enabled/);
});

test('send_email names both sandbox refusal codes', () => {
  const d = desc('motorical_send_email');
  assert.match(d, /sandbox_outbound_locked/);
  assert.match(d, /sandbox_recipient_denied/);
});

test('free_recipient_add qualifies where an unconfirmed recipient is refused', () => {
  const d = desc('motorical_free_recipient_add');
  assert.doesNotMatch(d, /Until they confirm, sends to that address are refused\./);
  assert.match(d, /sandbox allowlist/);
  assert.match(d, /Free account/);
});
