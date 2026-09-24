import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchNative } from '../src/native/dispatch.js';
import { SERVERS } from '../src/servers.js';

// Field report 2026-09-24: on a Claude client, motorical_motor_block_change_type (and
// assign_domain, deactivate, delete, webhook_delete, ...) could never complete. The native
// path ignored `confirm: true` and always answered resultType 'input_required'; the client
// does not implement that flow and reported "has an output schema but did not return
// structured content". A client that declares its capabilities WITHOUT elicitation cannot
// answer a confirmation form, so it gets the plain `confirm: true` route instead. A client
// that declares elicitation, or declares nothing (unknown), keeps the bound-confirmation form.
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

describe('confirmation for clients that cannot answer the native confirmation form', () => {
  const recorder = () => {
    const seen = [];
    return { seen, client: { motorBlockChangeType: async (a) => { seen.push(a); return { success: true, data: { motorBlockId: BLOCK_ID, changed: true } }; } } };
  };

  test('no elicitation declared + confirm:true -> the action runs, no form', async () => {
    const { seen, client } = recorder();
    const res = await call({ motorBlockId: BLOCK_ID, type: 'general_purpose', confirm: true }, {}, client);
    assert.equal(res.resultType, 'complete');
    assert.equal(res.isError, false);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].confirm, true);
  });

  test('no elicitation declared + no confirm -> a plain, actionable refusal, handler not called', async () => {
    const { seen, client } = recorder();
    const res = await call({ motorBlockId: BLOCK_ID, type: 'general_purpose' }, {}, client);
    assert.equal(res.resultType, 'complete');
    assert.equal(res.isError, true);
    assert.equal(seen.length, 0);
    assert.equal(res.structuredContent.error, 'confirmation_required');
    assert.match(res.content[0].text, /confirm: true/);
    assert.match(res.content[0].text, /general_purpose/);
  });

  test('a client that DECLARES elicitation keeps the form, and a pre-filled confirm:true cannot bypass it', async () => {
    const { seen, client } = recorder();
    const res = await call({ motorBlockId: BLOCK_ID, type: 'general_purpose', confirm: true }, { elicitation: {} }, client);
    assert.equal(res.resultType, 'input_required');
    assert.equal(seen.length, 0);
  });

  test('a client that declares no capabilities at all (unknown) keeps the form', async () => {
    const { seen, client } = recorder();
    const res = await call({ motorBlockId: BLOCK_ID, type: 'general_purpose' }, undefined, client);
    assert.equal(res.resultType, 'input_required');
    assert.equal(seen.length, 0);
  });

  test('logs only the declared capability KEYS (evidence for what real clients send), never values', async () => {
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
