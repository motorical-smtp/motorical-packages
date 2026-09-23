import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTask } from '../src/native/taskResolver.js';
import { __testOnly_withClient } from '../src/native/taskStore.js';

class FakeRedis {
  constructor() { this.store = new Map(); this.sets = new Map(); }
  async set(key, value) { this.store.set(key, value); return 'OK'; }
  async get(key) { return this.store.get(key) ?? null; }
  async sadd(key, member) { if (!this.sets.has(key)) this.sets.set(key, new Set()); this.sets.get(key).add(member); }
  async smembers(key) { return [...(this.sets.get(key) ?? [])]; }
  async srem() {}
  async expire() { return 1; }
}

describe('resolveTask', () => {
  test('not_found when the taskId does not exist', async () => {
    const taskStore = __testOnly_withClient(new FakeRedis());
    const result = await resolveTask('nope', { getMessageRecipients: async () => { throw new Error('must not be called'); } }, taskStore);
    assert.equal(result.status, 'not_found');
  });

  test('still_pending when not every recipient is terminal yet', async () => {
    const taskStore = __testOnly_withClient(new FakeRedis());
    const { taskId } = await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });
    const client = { getMessageRecipients: async () => ({ success: true, data: { recipients: [{ address: 'a@x.com', status: 'pending' }], expectedCount: 1, allTerminal: false } }) };
    const result = await resolveTask(taskId, client, taskStore);
    assert.equal(result.status, 'still_pending');
    assert.ok(result.retryAfterMs > 0);
  });

  test('completed with the full recipient breakdown when allTerminal', async () => {
    const taskStore = __testOnly_withClient(new FakeRedis());
    const { taskId } = await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });
    const client = { getMessageRecipients: async () => ({ success: true, data: { recipients: [{ address: 'a@x.com', status: 'delivered' }], expectedCount: 1, allTerminal: true } }) };
    const result = await resolveTask(taskId, client, taskStore);
    assert.equal(result.status, 'completed');
    assert.equal(result.result.allTerminal, true);
  });
});
