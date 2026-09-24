import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchNative } from '../src/native/dispatch.js';
import { SERVERS } from '../src/servers.js';

// Field evidence 2026-09-24 (server log `[mrtr] ... clientCapabilityKeys=elicitation,roots`): the Claude
// client DECLARES elicitation and roots, yet cannot complete a native `input_required` reply. Its
// `elicitation` capability is the older server-initiated form, not the 2026-07-28 incomplete-result flow,
// so no declared capability reliably says "this client can answer input_required". The consequence was
// that change_type, assign_domain, deactivate, delete (and webhook_delete, domain_verify, sandbox_convert)
// could never complete on the flagship client: the server ignored `confirm: true`.
//
// Decision (owner delegated it): `confirm: true` is honored for every client, the trust level every
// pre-2026 client already had. Without it the server still replies `input_required` (the bound form is
// untouched for a client that answers it) but the same result also carries a readable message and
// isError, so a client that cannot handle the form shows the model plain instructions.
const CAPS = 'io.modelcontextprotocol/clientCapabilities';
const main = SERVERS.find((s) => s.key === 'main');
const BLOCK_ID = '11111111-1111-4111-8111-111111111111';

const call = (args, caps, client) => dispatchNative(
  { jsonrpc: '2.0', id: 5, method: 'tools/call', params: {
    name: 'motorical_motor_block_change_type', arguments: args,
    ...(caps === undefined ? {} : { _meta: { [CAPS]: caps } }),
  } },
  { server: main, client, version: '1.9.4' }
).then((r) => r.result);

const recorder = () => {
  const seen = [];
  return { seen, client: { motorBlockChangeType: async (a) => { seen.push(a); return { success: true, data: { motorBlockId: BLOCK_ID, changed: true } }; } } };
};

describe('confirm: true completes a confirmation-gated tool on any client', () => {
  test('a client that declares elicitation (as Claude does) + confirm:true -> the action runs', async () => {
    const { seen, client } = recorder();
    const res = await call({ motorBlockId: BLOCK_ID, type: 'general_purpose', confirm: true }, { elicitation: {}, roots: {} }, client);
    assert.equal(res.resultType, 'complete');
    assert.equal(res.isError, false);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].confirm, true);
  });

  test('a client that sends no capabilities + confirm:true -> the action runs', async () => {
    const { seen, client } = recorder();
    const res = await call({ motorBlockId: BLOCK_ID, type: 'general_purpose', confirm: true }, undefined, client);
    assert.equal(res.resultType, 'complete');
    assert.equal(seen.length, 1);
  });

  test('confirm:false or absent never runs the action', async () => {
    for (const confirm of [false, undefined]) {
      const { seen, client } = recorder();
      const res = await call({ motorBlockId: BLOCK_ID, type: 'general_purpose', ...(confirm === undefined ? {} : { confirm }) }, { elicitation: {} }, client);
      assert.equal(res.resultType, 'input_required');
      assert.equal(seen.length, 0);
    }
  });
});

describe('without confirm the bound form is intact AND a form-less client gets readable instructions', () => {
  test('input_required still carries the bound request and state', async () => {
    const { client } = recorder();
    const res = await call({ motorBlockId: BLOCK_ID, type: 'general_purpose' }, { elicitation: {} }, client);
    assert.equal(res.resultType, 'input_required');
    assert.ok(res.inputRequests.confirm);
    assert.equal(typeof res.requestState, 'string');
  });

  test('the same result also explains, in plain text, what to do (for a client that cannot answer the form)', async () => {
    const { client } = recorder();
    const res = await call({ motorBlockId: BLOCK_ID, type: 'general_purpose' }, { elicitation: {} }, client);
    assert.equal(res.isError, true);
    assert.match(res.content[0].text, /confirm: true/);
    assert.match(res.content[0].text, /general_purpose/);
    assert.equal(res.structuredContent.error, 'confirmation_required');
  });
});

describe('evidence logging', () => {
  test('logs only the declared capability KEYS, never values', async () => {
    const log = mock.method(console, 'log', () => {});
    try {
      const { client } = recorder();
      await call({ motorBlockId: BLOCK_ID, type: 'general_purpose' }, { elicitation: {}, roots: { secret: 'do-not-log' } }, client);
      const lines = log.mock.calls.map((c) => c.arguments.join(' ')).filter((l) => l.includes('[mrtr]'));
      assert.equal(lines.length, 1);
      assert.match(lines[0], /motorical_motor_block_change_type/);
      assert.match(lines[0], /elicitation/);
      assert.match(lines[0], /roots/);
      assert.doesNotMatch(lines[0], /do-not-log/);
    } finally { log.mock.restore(); }
  });
});
