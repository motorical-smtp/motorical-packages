import { test, describe, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { objectFromShape, safeParseAsync } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { TOOLS, toolByName } from '../src/registry.js';
import { resolveTask } from '../src/native/taskResolver.js';
import { __testOnly_withClient, __testOnly_setDefaultStore, closeTaskStore } from '../src/native/taskStore.js';

// Task 11: pii_masked/pii_unmask_path (Task 10's backend fields) have to be
// declared on the outputSchema of motorical_get_message,
// motorical_get_message_events and motorical_wait_for_outcome, or a
// schema-driven re-parse of structuredContent silently drops them.
//
// Divergence from the task-11 brief, found before writing this file (grepping
// per the brief's own instruction): `validateOutput` in src/native/dispatch.js
// is NOT exported, and its real contract does not match what the brief's
// sample test assumes. It returns `null` on success (letting dispatch.js's
// caller fall back to the UNTOUCHED original `result`) or an error object on
// failure -- never a validated/reshaped result with a `.structuredContent` to
// inspect. Confirmed empirically (see git history / task-11-report.md): with
// the OLD outputSchema (missing these two fields), running the real
// dispatchNative('tools/call', ...) pipeline end to end still delivered
// pii_masked/pii_unmask_path untouched, because dispatch.js's validateOutput
// only validates-or-rejects -- it never substitutes the schema-parsed
// `.data` for the original object the handler returned. So neither
// dispatch.js's native path nor the legacy McpServer path (src/server.js's
// jsonResult) nor even the official MCP TypeScript SDK's own client-side
// callTool() (node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js)
// reshapes structuredContent on the happy path today -- all three
// validate-or-throw, never strip.
//
// That does NOT make the task moot. dispatch.js's own comment on
// validateArguments (a few lines above validateOutput) documents the
// mechanism this task guards against directly: "Zod STRIPS unknown keys."
// That is real, load-bearing Zod behavior in THIS exact dependency
// (objectFromShape + safeParseAsync, imported from
// @modelcontextprotocol/sdk/server/zod-compat.js) -- it is simply applied to
// input args today, via `parsed.data`, not to output. The moment any code
// (a future dispatch.js refactor, a stricter consumer, or the calling agent's
// own client re-validating structuredContent against the tool's advertised
// outputSchema and trusting the parsed result) takes `.data` from parsing
// structuredContent against an outputSchema that doesn't declare these two
// fields, they vanish -- silently, because Zod's default object parsing
// SUCCEEDS (extra keys are dropped, not rejected) rather than raising an
// error a caller would notice.
//
// The first describe block below proves that mechanism is real using this
// package's own real dependency, not a hypothetical: it re-parses realistic
// structuredContent against the OLD (pre-Task-11) schema shape and shows the
// fields disappear from `.data` while parsing still reports success, then
// repeats the same operation against the live, post-fix schema imported from
// registry.js and shows they survive. The second block proves the production
// change doesn't regress anything by running the real registered handlers
// end to end.

describe('outputSchema silently drops undeclared fields on a schema-driven re-parse (the mechanism this task defends against)', () => {
  // Deliberately a literal, not an import: this is registry.js's
  // motorical_get_message `data` shape as it stood BEFORE this task's fix.
  // Keeping it as an inline literal (rather than checking out git history at
  // test time) means this test stays a stable regression pin even if a
  // future change reshapes today's outputSchema further -- it will always
  // prove the OLD shape drops the fields, and the second half of each test
  // proves the CURRENT registry.js shape does not.
  const OLD_GET_MESSAGE_DATA_SHAPE = {
    id: z.string().optional(),
    smtpMessageId: z.string().nullable().optional(),
    currentOutcome: z.string().optional(),
    isTerminal: z.boolean().optional(),
    from: z.string().optional(),
    recipient: z.string().optional(),
    subject: z.string().optional(),
    queuedAt: z.string().optional(),
    processedAt: z.string().nullable().optional(),
    deliveredAt: z.string().nullable().optional(),
    bouncedAt: z.string().nullable().optional(),
    smtpCode: z.string().nullable().optional(),
    smtpResponse: z.string().nullable().optional(),
  };

  test('motorical_get_message: OLD schema silently drops pii_masked/pii_unmask_path on re-parse', async () => {
    const structuredContent = {
      id: 'm1',
      recipient: 'a***@x.com',
      pii_masked: true,
      pii_unmask_path: 'not available over OAuth',
    };
    const parsed = await safeParseAsync(objectFromShape(OLD_GET_MESSAGE_DATA_SHAPE), structuredContent);
    // The critical, dangerous part: this SUCCEEDS. A caller checking only
    // parsed.success would see no error at all -- the fields are just gone.
    assert.equal(parsed.success, true, 'Zod object parsing of an extra key must succeed, not error -- that is what makes the drop silent');
    assert.equal(parsed.data.pii_masked, undefined, 'pii_masked must be silently absent from .data under the OLD schema');
    assert.equal(parsed.data.pii_unmask_path, undefined, 'pii_unmask_path must be silently absent from .data under the OLD schema');
  });

  test('motorical_get_message: CURRENT (post-fix) outputSchema preserves both fields on the same re-parse', async () => {
    const tool = TOOLS.find((t) => t.name === 'motorical_get_message');
    const structuredContent = {
      id: 'm1',
      recipient: 'a***@x.com',
      pii_masked: true,
      pii_unmask_path: 'not available over OAuth',
    };
    const parsed = await tool.outputSchema.data.safeParseAsync(structuredContent);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.pii_masked, true, 'pii_masked must survive the live registry.js schema');
    assert.equal(parsed.data.pii_unmask_path, 'not available over OAuth', 'pii_unmask_path must survive the live registry.js schema');
  });

  test('motorical_get_message_events: CURRENT outputSchema preserves both fields', async () => {
    const tool = TOOLS.find((t) => t.name === 'motorical_get_message_events');
    const structuredContent = {
      id: 'm1',
      recipient: 'a***@x.com',
      pii_masked: true,
      pii_unmask_path: 'not available over OAuth',
      events: [],
    };
    const parsed = await tool.outputSchema.data.safeParseAsync(structuredContent);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.pii_masked, true);
    assert.equal(parsed.data.pii_unmask_path, 'not available over OAuth');
  });

  test('motorical_wait_for_outcome: OLD result shape silently dropped pii_masked; CURRENT preserves it', async () => {
    const OLD_RESULT_SHAPE = {
      recipients: z.array(z.object({
        address: z.string(),
        status: z.enum(['delivered', 'bounced', 'pending']),
        dsnCode: z.string().nullable().optional(),
        at: z.string().nullable().optional(),
      })),
      expectedCount: z.number(),
      allTerminal: z.boolean(),
    };
    const structuredContent = {
      recipients: [{ address: 'a***@x.com', status: 'delivered' }],
      expectedCount: 1,
      allTerminal: true,
      pii_masked: true,
      pii_unmask_path: 'not available over OAuth',
    };
    const oldParsed = await safeParseAsync(objectFromShape(OLD_RESULT_SHAPE), structuredContent);
    assert.equal(oldParsed.success, true);
    assert.equal(oldParsed.data.pii_masked, undefined, 'pii_masked must be silently absent under the OLD result shape');

    const tool = TOOLS.find((t) => t.name === 'motorical_wait_for_outcome');
    const currentParsed = await tool.outputSchema.result.safeParseAsync(structuredContent);
    assert.equal(currentParsed.success, true);
    assert.equal(currentParsed.data.pii_masked, true, 'pii_masked must survive the live registry.js result schema');
    assert.equal(currentParsed.data.pii_unmask_path, 'not available over OAuth');
  });
});

describe('end-to-end: pii_masked/pii_unmask_path survive the real registered handlers', () => {
  test('motorical_get_message forwards pii_masked/pii_unmask_path from the client response untouched', async () => {
    const tool = toolByName('motorical_get_message');
    const fakeClient = {
      getMessage: async () => ({
        success: true,
        data: { id: 'm1', recipient: 'a***@x.com', pii_masked: true, pii_unmask_path: 'not available over OAuth' },
      }),
    };
    const result = await tool.handler(fakeClient)({ messageId: '00000000-0000-0000-0000-000000000000' });
    assert.equal(result.data.pii_masked, true);
    assert.equal(result.data.pii_unmask_path, 'not available over OAuth');
    // And it validates cleanly against the tool's own declared outputSchema --
    // proving the schema and the real handler output actually agree.
    const validated = await safeParseAsync(objectFromShape(tool.outputSchema), result);
    assert.equal(validated.success, true);
    assert.equal(validated.data.data.pii_masked, true);
  });

  test('motorical_get_message_events forwards pii_masked/pii_unmask_path from the client response untouched', async () => {
    const tool = toolByName('motorical_get_message_events');
    const fakeClient = {
      getMessageEvents: async () => ({
        success: true,
        data: { id: 'm1', recipient: 'a***@x.com', pii_masked: false, pii_unmask_path: null, events: [] },
      }),
    };
    const result = await tool.handler(fakeClient)({ messageId: '00000000-0000-0000-0000-000000000000' });
    assert.equal(result.data.pii_masked, false);
    assert.equal(result.data.pii_unmask_path, null);
    const validated = await safeParseAsync(objectFromShape(tool.outputSchema), result);
    assert.equal(validated.success, true);
    assert.equal(validated.data.data.pii_masked, false);
  });

  describe('motorical_wait_for_outcome', () => {
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

    after(async () => {
      __testOnly_setDefaultStore(null);
      await closeTaskStore();
    });

    test('forwards pii_masked/pii_unmask_path on the composed result, not per-recipient', async () => {
      const tool = toolByName('motorical_wait_for_outcome');
      const { taskId } = await injected.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });
      const fakeClient = {
        getMessageRecipients: async () => ({
          success: true,
          data: {
            recipients: [{ address: 'a***@x.com', status: 'delivered' }],
            expectedCount: 1,
            allTerminal: true,
            pii_masked: true,
            pii_unmask_path: 'not available over OAuth',
          },
        }),
      };
      const result = await tool.handler(fakeClient)({ taskId });
      assert.equal(result.status, 'completed');
      assert.equal(result.result.pii_masked, true);
      assert.equal(result.result.pii_unmask_path, 'not available over OAuth');
      assert.equal(result.result.recipients[0].pii_masked, undefined, 'pii_masked belongs on the result, not per-recipient');

      const validated = await safeParseAsync(objectFromShape(tool.outputSchema), result);
      assert.equal(validated.success, true);
      assert.equal(validated.data.result.pii_masked, true);
    });
  });
});

describe('taskResolver.resolveTask forwards the backend\'s pii fields rather than recomputing them', () => {
  class FakeRedis {
    constructor() { this.store = new Map(); this.sets = new Map(); }
    async set(key, value) { this.store.set(key, value); return 'OK'; }
    async get(key) { return this.store.get(key) ?? null; }
    async sadd(key, member) { if (!this.sets.has(key)) this.sets.set(key, new Set()); this.sets.get(key).add(member); }
    async smembers(key) { return [...(this.sets.get(key) ?? [])]; }
    async srem() {}
    async expire() { return 1; }
  }

  test('forwards raw.data.pii_masked/pii_unmask_path verbatim when allTerminal', async () => {
    const taskStore = __testOnly_withClient(new FakeRedis());
    const { taskId } = await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });
    const client = {
      getMessageRecipients: async () => ({
        success: true,
        data: {
          recipients: [{ address: 'a@x.com', status: 'delivered' }],
          expectedCount: 1,
          allTerminal: true,
          pii_masked: true,
          pii_unmask_path: 'not available over OAuth',
        },
      }),
    };
    const result = await resolveTask(taskId, client, taskStore, { includePII: false });
    assert.equal(result.status, 'completed');
    assert.equal(result.result.pii_masked, true);
    assert.equal(result.result.pii_unmask_path, 'not available over OAuth');
  });

  // Proves this is genuinely a FORWARD, not a re-derivation from `includePII`:
  // the backend value disagrees with what `!includePII` would compute, and
  // the backend's own value must win. (In production the backend 403s an
  // unauthorized includePII:true before this code ever runs, so the two
  // never actually disagree today -- but resolveTask must not depend on that
  // being true forever by re-deriving the same decision a second time.)
  test('trusts the backend value even when it disagrees with what !includePII would compute', async () => {
    const taskStore = __testOnly_withClient(new FakeRedis());
    const { taskId } = await taskStore.createTask({ emailLogId: 'el-1', motorBlockId: 'mb-1' });
    const client = {
      getMessageRecipients: async () => ({
        success: true,
        data: {
          recipients: [{ address: 'a@x.com', status: 'delivered' }],
          expectedCount: 1,
          allTerminal: true,
          pii_masked: true, // backend says masked...
          pii_unmask_path: 'not available over OAuth',
        },
      }),
    };
    // ...even though the caller requested includePII:true, which a
    // recompute-locally implementation (`pii_masked: !includePII`) would
    // report as false.
    const result = await resolveTask(taskId, client, taskStore, { includePII: true });
    assert.equal(result.result.pii_masked, true, 'must forward the backend\'s value, not recompute !includePII locally');
  });
});
