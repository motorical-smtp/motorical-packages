import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchNative } from '../src/native/dispatch.js';
import { SERVERS } from '../src/servers.js';
import { __testOnly_withClient } from '../src/native/taskStore.js';

const transactional = SERVERS.find((s) => s.key === 'transactional');

// Task 9 gates tasks/get and tasks/list on a declared Tasks-extension
// capability (io.modelcontextprotocol/tasks inside _meta's client-
// capabilities object) -- a caller who never declares it must see the
// method as absent entirely (see the two capability-gate tests below).
// Task 8's own tests (above) exercise authorization and error-handling
// logic that only runs once a request clears that gate, so they now need
// to declare the capability to reach the code they're actually testing --
// this constant is spread into their params for exactly that reason; none
// of their assertions changed.
// Per the verified spec (https://modelcontextprotocol.io/extensions/tasks/
// overview, fetched 2026-09-06), Tasks is an Extension: a client declares it
// by nesting the extension's namespaced id under an `extensions` object
// inside clientCapabilities -- not as a bare sibling key directly on
// clientCapabilities.
const DECLARES_TASKS = { 'io.modelcontextprotocol/clientCapabilities': { extensions: { 'io.modelcontextprotocol/tasks': {} } } };

// A per-test in-memory Redis, injected the same way taskResolver.test.js does
// it -- dispatch.js's tasks/get and tasks/list must accept a taskStore
// override for exactly this reason (see Step 3's ctx() addition below).
class FakeRedis {
  constructor() { this.store = new Map(); this.sets = new Map(); }
  async set(key, value) { this.store.set(key, value); return 'OK'; }
  async get(key) { return this.store.get(key) ?? null; }
  async sadd(key, member) { if (!this.sets.has(key)) this.sets.set(key, new Set()); this.sets.get(key).add(member); }
  async smembers(key) { return [...(this.sets.get(key) ?? [])]; }
  async srem(key, member) { this.sets.get(key)?.delete(member); }
  async expire() { return 1; }
}

describe('native tasks/get and tasks/list', () => {
  test('tasks/get returns the completed result once allTerminal', async () => {
    const taskStore = __testOnly_withClient(new FakeRedis());
    const { taskId } = await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });
    const client = { getMessageRecipients: async () => ({ success: true, data: { recipients: [{ address: 'a@x.com', status: 'delivered' }], expectedCount: 1, allTerminal: true } }) };

    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 1, method: 'tasks/get', params: { taskId, _meta: DECLARES_TASKS } },
      { server: transactional, client, version: '1.5.0', taskStore });
    assert.equal(res.result.status, 'completed');
  });

  test('tasks/list returns only taskIds for the caller\'s motor block', async () => {
    const taskStore = __testOnly_withClient(new FakeRedis());
    const { taskId: mine } = await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });
    await taskStore.createTask({ emailLogId: 'el-2', motorBlockId: 'mb-other' });

    // client.motorBlockIds is how delegatedClient.js's createDelegatedClient
    // conveys the caller's own delegated authority to dispatch.js -- see the
    // authorization tests below. This client is authorized for 'mb-1', the
    // block it's requesting, so this stays a happy-path test.
    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 2, method: 'tasks/list', params: { motorBlockId: 'mb-1', _meta: DECLARES_TASKS } },
      { server: transactional, client: { motorBlockIds: ['mb-1'] }, version: '1.5.0', taskStore });
    assert.deepEqual(res.result.tasks.map((t) => t.taskId), [mine]);
    assert.equal(res.result.resultType, 'complete');
  });

  // Finding 1: tasks/list took body.params.motorBlockId straight from the
  // request and handed it to taskStore.listTasksForMotorBlock with no check
  // that this motor block is one the caller's own bearer token authorizes --
  // any caller with a valid token for this path could read a DIFFERENT
  // tenant's live task ids just by naming their motorBlockId. The client
  // fixture here follows the same shape delegatedClient.test.js's `claims`
  // construction uses (see createDelegatedClient's `blocks` /
  // `client.motorBlockIds`): a client authorized for exactly one motor block,
  // asked here about a DIFFERENT one.
  test('tasks/list refuses a motorBlockId outside the caller\'s delegated authority', async () => {
    const taskStore = __testOnly_withClient(new FakeRedis());
    await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-other' });

    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 3, method: 'tasks/list', params: { motorBlockId: 'mb-other', _meta: DECLARES_TASKS } },
      { server: transactional, client: { motorBlockIds: ['mb-1'] }, version: '1.5.0', taskStore });

    assert.ok(res.error, 'must be a clean JSON-RPC error, not the other tenant\'s task data');
    assert.equal(res.result, undefined);
    assert.equal(res.error.code, -32602);
    assert.match(res.error.message, /not covered by this authorization/);
  });

  // Finding 2: tasks/get had no try/catch around resolveTask, unlike
  // tools/call's own handler call a few lines up in dispatch.js -- so a throw
  // from resolveTask (an authorization denial from the delegated client's
  // resolveBlock, or any other upstream/transport failure) propagated all the
  // way out of dispatchNative uncaught, landing only on http.js's outer catch
  // as a bare HTTP 500 with no jsonrpc/id/error shape at all.
  test('tasks/get returns a clean JSON-RPC error when resolveTask throws, not an unhandled rejection', async () => {
    const taskStore = __testOnly_withClient(new FakeRedis());
    const { taskId } = await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });
    const client = { getMessageRecipients: async () => { throw new Error('Motor block is not covered by this authorization'); } };

    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 4, method: 'tasks/get', params: { taskId, _meta: DECLARES_TASKS } },
      { server: transactional, client, version: '1.5.0', taskStore });

    assert.ok(res.error, 'must be a well-formed JSON-RPC error');
    assert.equal(res.result, undefined);
    assert.equal(typeof res.error.code, 'number');
    assert.match(res.error.message, /not covered by this authorization/);
  });

  test('tasks/get refuses a caller who never declared the Tasks extension capability', async () => {
    const taskStore = __testOnly_withClient(new FakeRedis());
    const { taskId } = await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });

    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 3, method: 'tasks/get', params: { taskId, _meta: {} } }, // no clientCapabilities at all
      { server: transactional, client: {}, version: '1.5.0', taskStore });
    assert.equal(res.error?.code, -32601, 'a client that never declared Tasks must see this as an unknown method, not a data leak');
  });

  // The sibling of the test above. tasks/get and tasks/list share the same
  // declaresTasksCapability(body) rule but enforce it in two SEPARATE `&&`
  // clauses on two separate `if`s -- so with only the tasks/get test in place,
  // deleting the check from the tasks/list branch would leave the suite green
  // while a caller who never declared Tasks could enumerate a tenant's live
  // task ids. This test is still meaningful now that the capability is
  // unadvertised (see discover.js): it dispatches by method name directly,
  // bypassing discovery entirely, and the gate is what keeps those branches
  // unreachable until the advertisement is deliberately restored.
  test('tasks/list refuses a caller who never declared the Tasks extension capability', async () => {
    const taskStore = __testOnly_withClient(new FakeRedis());
    await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });

    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 30, method: 'tasks/list', params: { motorBlockId: 'mb-1', _meta: {} } },
      { server: transactional, client: { motorBlockIds: ['mb-1'] }, version: '1.5.0', taskStore });

    assert.equal(res.result, undefined, 'must not return task data to an undeclaring caller');
    assert.equal(res.error?.code, -32601,
      'a client that never declared Tasks must see this as an unknown method, not a data leak');
  });

  test('tasks/get works when the caller DID declare the Tasks extension capability', async () => {
    const taskStore = __testOnly_withClient(new FakeRedis());
    const { taskId } = await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });
    const client = { getMessageRecipients: async () => ({ success: true, data: { recipients: [{ address: 'a@x.com', status: 'delivered' }], expectedCount: 1, allTerminal: true } }) };

    const res = await dispatchNative(
      {
        jsonrpc: '2.0', id: 4, method: 'tasks/get',
        params: { taskId, _meta: { 'io.modelcontextprotocol/clientCapabilities': { extensions: { 'io.modelcontextprotocol/tasks': {} } } } },
      },
      { server: transactional, client, version: '1.5.0', taskStore });
    assert.equal(res.result.status, 'completed');
  });
});
