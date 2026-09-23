// packages/motorical-mcp/test/taskStore.test.js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// In-memory fake standing in for ioredis -- this suite is a unit test of
// taskStore.js's OWN logic (key shape, TTL, index bookkeeping), not an
// integration test against a real Redis. taskResolver.test.js and any
// live-smoke test are where the real client gets exercised.
class FakeRedis {
  constructor() { this.store = new Map(); this.sets = new Map(); }
  async set(key, value) { this.store.set(key, value); return 'OK'; }
  async get(key) { return this.store.get(key) ?? null; }
  async sadd(key, member) {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    this.sets.get(key).add(member);
  }
  async smembers(key) { return [...(this.sets.get(key) ?? [])]; }
  async srem(key, member) { this.sets.get(key)?.delete(member); }
  async expire() { return 1; }
  async quit() { return 'OK'; }
}

let taskStore;
let fakeRedis;

beforeEach(async () => {
  fakeRedis = new FakeRedis();
  const mod = await import('../src/native/taskStore.js');
  taskStore = mod.__testOnly_withClient(fakeRedis);
});

describe('taskStore', () => {
  test('createTask returns a taskId, getTask returns exactly what was stored', async () => {
    const { taskId } = await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });
    assert.ok(taskId);
    const task = await taskStore.getTask(taskId);
    assert.equal(task.emailLogId, 'el-1');
    assert.equal(task.motorBlockId, 'mb-1');
    assert.ok(task.createdAt);
  });

  // The record used to carry `expectedRecipients` -- the full recipient
  // address list -- for 72h, and NOTHING ever read it back (resolveTask uses
  // only emailLogId/motorBlockId and re-fetches recipients from the backend on
  // every poll). Pure PII exposure for zero function; this guards the removal.
  test('createTask persists no recipient PII', async () => {
    const { taskId } = await taskStore.createTask({
      emailLogId: 'el-1', motorBlockId: 'mb-1',
      // Passed the way the old call site did; it must be ignored, not stored.
      expectedRecipients: ['alice@x.com'],
    });
    const raw = fakeRedis.store.get(`mcp:task:${taskId}`);
    assert.equal(raw.includes('alice@x.com'), false);
    assert.equal(JSON.parse(raw).expectedRecipients, undefined);
  });

  test('getTask returns null for an unknown taskId', async () => {
    const task = await taskStore.getTask('does-not-exist');
    assert.equal(task, null);
  });

  test('listTasksForMotorBlock returns taskIds created for that block', async () => {
    const { taskId: t1 } = await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });
    const { taskId: t2 } = await taskStore.createTask({ emailLogId: 'el-2', motorBlockId: 'mb-2' });
    const forMb1 = await taskStore.listTasksForMotorBlock('mb-1');
    assert.deepEqual(forMb1, [t1]);
    const forMb2 = await taskStore.listTasksForMotorBlock('mb-2');
    assert.deepEqual(forMb2, [t2]);
  });

  // A task with no resolvable motor block used to be SADD'd into the single
  // global key `mcp:tasks-by-block:undefined`, whose TTL was refreshed on every
  // such send -- an unbounded key in production that no caller could ever
  // usefully list. The task itself must still be fully retrievable by id.
  test('a task with no motorBlockId is stored but never indexed under "undefined"', async () => {
    const { taskId } = await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: undefined });
    assert.equal((await taskStore.getTask(taskId)).emailLogId, 'el-1');
    assert.deepEqual([...fakeRedis.sets.keys()], [], 'no index key may be written at all');
    assert.equal(fakeRedis.sets.has('mcp:tasks-by-block:undefined'), false);
  });
});
