// packages/motorical-mcp/test/mrtrDispatch.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchNative } from '../src/native/dispatch.js';
import { signRequestState } from '../src/native/requestState.js';
import { SERVERS } from '../src/servers.js';

const main = SERVERS.find((s) => s.key === 'main');

describe('native MRTR interception for confirmable tools', () => {
  const BLOCK_ID = '11111111-1111-4111-8111-111111111111';
  const DOMAIN_ID = '22222222-2222-4222-8222-222222222222';
  const CONFIRMABLE = [
    ['motorical_motor_block_change_type', 'motorBlockChangeType', { motorBlockId: BLOCK_ID, type: 'transactional' }],
    ['motorical_motor_block_assign_domain', 'motorBlockAssignDomain', { motorBlockId: BLOCK_ID, domainId: DOMAIN_ID }],
    ['motorical_motor_block_deactivate', 'motorBlockDeactivate', { motorBlockId: BLOCK_ID }],
    ['motorical_motor_block_delete', 'motorBlockDelete', { motorBlockId: BLOCK_ID, deleteHistory: true }],
    ['motorical_sandbox_convert', 'sandboxConvert', { domainId: DOMAIN_ID, name: 'Orders', type: 'transactional' }],
  ];

  for (const [tool, method, args] of CONFIRMABLE) {
    test(`${tool} requires bound MRTR confirmation before calling its handler`, async () => {
      let called = false;
      const client = { [method]: async () => { called = true; return { success: true, data: {} }; } };
      const first = await dispatchNative(
        { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: tool, arguments: args } },
        { server: main, client, version: '1.9.0' }
      );
      assert.equal(first.result.resultType, 'input_required');
      assert.equal(called, false);

      const accepted = await dispatchNative(
        { jsonrpc: '2.0', id: 11, method: 'tools/call', params: {
          name: tool,
          arguments: args,
          inputResponses: { confirm: { action: 'accept', content: {} } },
          requestState: first.result.requestState,
        } },
        { server: main, client, version: '1.9.0' }
      );
      assert.notEqual(accepted.result.resultType, 'input_required');
      assert.equal(called, true);
    });
  }

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
