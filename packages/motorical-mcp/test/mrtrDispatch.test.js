// packages/motorical-mcp/test/mrtrDispatch.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchNative } from '../src/native/dispatch.js';
import { signRequestState } from '../src/native/requestState.js';
import { SERVERS } from '../src/servers.js';

const main = SERVERS.find((s) => s.key === 'main');

describe('native MRTR interception for confirmable tools', () => {
  test('webhook_delete with no inputResponses returns input_required naming the webhookId', async () => {
    const client = { webhookDelete: async () => { throw new Error('should not be called'); } };
    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'motorical_webhook_delete', arguments: { motorBlockId: '11111111-1111-4111-8111-111111111111', webhookId: 'wh-1' } } },
      { server: main, client, version: '1.6.0' }
    );
    assert.equal(res.result.resultType, 'input_required');
    assert.ok(res.result.inputRequests.confirm);
    assert.match(res.result.inputRequests.confirm.params.message, /wh-1/);
    assert.equal(typeof res.result.requestState, 'string');
  });

  test('accepting with a valid requestState calls the real handler', async () => {
    let called = false;
    const client = { webhookDelete: async (args) => { called = true; assert.equal(args.confirm, true); return { success: true }; } };
    const args = { motorBlockId: '11111111-1111-4111-8111-111111111111', webhookId: 'wh-1' };
    const requestState = signRequestState({ tool: 'motorical_webhook_delete', args });
    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
        name: 'motorical_webhook_delete', arguments: args,
        inputResponses: { confirm: { action: 'accept', content: {} } },
        requestState,
      } },
      { server: main, client, version: '1.6.0' }
    );
    assert.equal(called, true);
    assert.equal(res.result.resultType, 'complete');
  });

  test('declining returns complete without calling the handler', async () => {
    const client = { webhookDelete: async () => { throw new Error('should not be called'); } };
    const args = { motorBlockId: '11111111-1111-4111-8111-111111111111', webhookId: 'wh-1' };
    const requestState = signRequestState({ tool: 'motorical_webhook_delete', args });
    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
        name: 'motorical_webhook_delete', arguments: args,
        inputResponses: { confirm: { action: 'decline' } },
        requestState,
      } },
      { server: main, client, version: '1.6.0' }
    );
    assert.equal(res.result.resultType, 'complete');
    assert.equal(res.result.isError, false);
  });

  test('a requestState signed for different args is rejected with a fresh input_required, not a crash', async () => {
    const client = { webhookDelete: async () => { throw new Error('should not be called'); } };
    const requestState = signRequestState({ tool: 'motorical_webhook_delete', args: { webhookId: 'wh-DIFFERENT' } });
    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: {
        name: 'motorical_webhook_delete', arguments: { motorBlockId: '11111111-1111-4111-8111-111111111111', webhookId: 'wh-1' },
        inputResponses: { confirm: { action: 'accept', content: {} } },
        requestState,
      } },
      { server: main, client, version: '1.6.0' }
    );
    assert.equal(res.result.resultType, 'input_required');
  });

  test('a non-confirmable tool (e.g. domain_list) is unaffected', async () => {
    const client = { domainList: async () => ({ success: true, data: [] }) };
    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'motorical_domain_list', arguments: {} } },
      { server: main, client, version: '1.6.0' }
    );
    assert.equal(res.result.resultType, 'complete');
  });
});
