import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toolByName } from '../src/registry.js';
import { ACCOUNT_SCOPED_TOOLS } from '../src/servers.js';
import { TOOL_FOR_METHOD } from '../src/delegatedClient.js';

describe('motorical_get_onboarding_state', () => {
  test('is registered with the expected shape', () => {
    const tool = toolByName('motorical_get_onboarding_state');
    assert.ok(tool, 'tool must be registered');
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
  });

  test('calls client.getAccountState with args passed through', async () => {
    const tool = toolByName('motorical_get_onboarding_state');
    let seenArgs;
    const fakeClient = { getAccountState: async (args) => { seenArgs = args; return { success: true, data: { stage: 'production_ready' } }; } };
    const result = await tool.handler(fakeClient)({ motorBlockId: 'mb-1' });
    assert.deepEqual(seenArgs, { motorBlockId: 'mb-1' });
    assert.equal(result.data.stage, 'production_ready');
  });

  test('is account-scoped (no Motor Block required)', () => {
    assert.ok(ACCOUNT_SCOPED_TOOLS.has('motorical_get_onboarding_state'));
  });

  test('is wrapped by the delegated client for the hosted OAuth path', () => {
    assert.equal(TOOL_FOR_METHOD.getAccountState, 'motorical_get_onboarding_state');
  });
});
