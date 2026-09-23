import { test, describe, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { toolByName } from '../src/registry.js';
// registry.js imports taskStore.js as a namespace at module scope and closes
// over it inside the tool handlers, so a test that exercises the REAL
// registered handler has no argument to inject a fake store through. That used
// to force this file onto the real Redis-backed singleton, which fails with
// ENOENT on every machine without ovh24's /etc/motorical/redis-password-fallback
// -- i.e. every developer laptop, and every user of the published npm package.
//
// __testOnly_setDefaultStore is the seam that fixes it: point the module's
// default-store resolution at a store built over an in-memory fake, and the
// handler runs for real against a fake store instead of a real one. No Redis
// connection is ever attempted from this file, so there is also no ioredis
// handle left open to hang `node --test test/*.test.js`.
import { __testOnly_withClient, __testOnly_setDefaultStore, closeTaskStore } from '../src/native/taskStore.js';

class FakeRedis {
  constructor() { this.store = new Map(); this.sets = new Map(); }
  async set(key, value) { this.store.set(key, value); return 'OK'; }
  async get(key) { return this.store.get(key) ?? null; }
  async sadd(key, member) { if (!this.sets.has(key)) this.sets.set(key, new Set()); this.sets.get(key).add(member); }
  async smembers(key) { return [...(this.sets.get(key) ?? [])]; }
  async srem(key, member) { this.sets.get(key)?.delete(member); }
  async expire() { return 1; }
  async quit() { return 'OK'; }
}

let injected;

beforeEach(() => {
  injected = __testOnly_withClient(new FakeRedis());
  __testOnly_setDefaultStore(injected);
});

// Reset the override so it cannot leak past this file, then close defensively.
// closeTaskStore() no longer BUILDS a store just to close one, so with the
// override cleared and no real client ever created this is a clean no-op.
after(async () => {
  __testOnly_setDefaultStore(null);
  await closeTaskStore();
});

describe('motorical_wait_for_outcome', () => {
  test('is registered with the expected shape', () => {
    const tool = toolByName('motorical_wait_for_outcome');
    assert.ok(tool, 'tool must be registered');
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.idempotentHint, true);
    assert.ok(tool.inputSchema.taskId);
  });

  test('exposes an optional includePII arg, like the sibling message tools', () => {
    const tool = toolByName('motorical_wait_for_outcome');
    assert.ok(tool.inputSchema.includePII, 'includePII must be declared or the SDK strips it before the handler');
    assert.equal(tool.inputSchema.includePII.safeParse(undefined).success, true, 'must be optional');
  });

  test('an unknown taskId resolves not_found promptly, not after the full poll window', async () => {
    const tool = toolByName('motorical_wait_for_outcome');
    const fakeClient = {
      getMessageRecipients: async () => { throw new Error('must not be called for an unknown task'); },
    };
    const start = Date.now();
    const result = await tool.handler(fakeClient)({ taskId: 'nonexistent-task-id' });
    assert.equal(result.status, 'not_found');
    assert.ok(Date.now() - start < 1000, 'not_found must not wait through the backoff ladder');
  });

  test('a completed task resolves through the real handler against the injected store', async () => {
    const tool = toolByName('motorical_wait_for_outcome');
    const { taskId } = await injected.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });
    const client = {
      getMessageRecipients: async () => ({
        success: true,
        data: { recipients: [{ address: 'a@x.com', status: 'delivered' }], expectedCount: 1, allTerminal: true },
      }),
    };
    const result = await tool.handler(client)({ taskId });
    assert.equal(result.status, 'completed');
    assert.equal(result.result.allTerminal, true);
  });

  // Fix 5: without a threaded includePII the backend always masks, so a send to
  // alice@x.com and andrew@x.com resolves to two identical a***@x.com entries.
  test('includePII defaults to false and is forwarded to the recipients call when asked', async () => {
    const tool = toolByName('motorical_wait_for_outcome');
    const { taskId } = await injected.createTask({ emailLogId: 'el-2', motorBlockId: 'mb-1' });
    const seen = [];
    const client = {
      getMessageRecipients: async (_id, opts) => {
        seen.push(opts);
        return { success: true, data: { recipients: [], expectedCount: 0, allTerminal: true } };
      },
    };

    await tool.handler(client)({ taskId });
    assert.equal(seen[0].includePII, false, 'default must stay masked');

    await tool.handler(client)({ taskId, includePII: true });
    assert.equal(seen[1].includePII, true, 'an explicit request must reach the client call');
    assert.equal(seen[1].motorBlockId, 'mb-1', 'the stored block must still scope the lookup');
  });
});
