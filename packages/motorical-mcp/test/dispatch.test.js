import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { dispatchNative } from '../src/native/dispatch.js';
import { createMotoricalMcpServer } from '../src/server.js';
import { SERVERS, HOSTED_ONLY_TOOLS } from '../src/servers.js';
import { MotoricalClient } from '../src/client.js';
// motorical_send_email's handler resolves the task store through registry.js's
// module-scope namespace import, which no dispatchNative argument can reach --
// so this file used to be forced onto taskStore.js's real Redis-backed
// singleton and failed with ENOENT wherever ovh24's
// /etc/motorical/redis-password-fallback is absent (every dev machine).
// __testOnly_setDefaultStore points that resolution at an in-memory fake, so
// the real handler runs against a fake store and no Redis connection is ever
// attempted from this file.
import {
  __testOnly_withClient,
  __testOnly_setDefaultStore,
  closeTaskStore,
} from '../src/native/taskStore.js';

const analytics = SERVERS.find((s) => s.key === 'analytics');
const transactional = SERVERS.find((s) => s.key === 'transactional');
const stubClient = new Proxy({}, { get: () => async () => ({ ok: true }) });
const ctx = (server) => ({ server, client: stubClient, version: '1.5.0' });

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

// One fake for the whole file, so the send tests below can inspect exactly
// which keys the handler wrote (see the "never under the literal string
// undefined" assertion).
const fakeRedis = new FakeRedis();
__testOnly_setDefaultStore(__testOnly_withClient(fakeRedis));

after(async () => {
  __testOnly_setDefaultStore(null);
  await closeTaskStore();
});

describe('dispatchNative', () => {
  test('answers server/discover', async () => {
    const res = await dispatchNative({ jsonrpc: '2.0', id: 1, method: 'server/discover' }, ctx(analytics));
    assert.equal(res.id, 1);
    assert.equal(res.result.resultType, 'complete');
  });

  test('tools/list advertises only this scoped server’s tools', async () => {
    const res = await dispatchNative({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx(analytics));
    const names = res.result.tools.map((t) => t.name);
    assert.ok(names.includes('motorical_get_metrics'));
    assert.ok(!names.includes('motorical_send_email'),
      'the analytics server must never advertise the send tool');
  });

  test('tools/list carries caching hints, as the spec requires for complete results', async () => {
    const res = await dispatchNative({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, ctx(analytics));
    assert.equal(res.result.resultType, 'complete');
    assert.ok(res.result.ttlMs >= 0);
    assert.equal(res.result.cacheScope, 'public');
  });

  test('tools/list includes annotations and any declared outputSchema', async () => {
    const res = await dispatchNative({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, ctx(transactional));
    const send = res.result.tools.find((t) => t.name === 'motorical_send_email');
    assert.equal(send.annotations.idempotentHint, false);
    assert.ok(send.outputSchema, 'send should expose its declared output schema');
  });

  test('tools/list emits real JSON Schema, not a raw Zod shape', async () => {
    // The defect this fix closes: registry.js's inputSchema/outputSchema are
    // Zod raw shapes (plain objects whose values are Zod validator instances),
    // not JSON Schema. Serializing a Zod validator produces nothing usable --
    // guard against that regressing by asserting the wire shape looks like
    // actual JSON Schema (a "type" keyword, plain-object "properties"), not a
    // Zod internal shape (which carries Zod's own "_def"/"_zod" markers and
    // whose values have a "parse" function, never a plain "type" string).
    const res = await dispatchNative({ jsonrpc: '2.0', id: 40, method: 'tools/list' }, ctx(transactional));
    const send = res.result.tools.find((t) => t.name === 'motorical_send_email');
    assert.equal(send.inputSchema.type, 'object');
    assert.equal(typeof send.inputSchema.properties, 'object');
    assert.equal(send.inputSchema.properties.subject.type, 'string');
    assert.equal(send.inputSchema._def, undefined);
    assert.equal(send.inputSchema._zod, undefined);
    assert.equal(send.outputSchema.type, 'object');
    assert.equal(typeof send.outputSchema.properties, 'object');
  });

  test('tools/call runs the handler and returns content plus structuredContent', async () => {
    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'motorical_get_metrics', arguments: {} } },
      ctx(analytics));
    assert.equal(res.result.content[0].type, 'text');
    assert.deepEqual(res.result.structuredContent, { ok: true });
    assert.equal(res.result.isError, false);
    // Regression guard: tools/list carried resultType from day one and had a
    // test for it, but tools/call didn't -- so a real client speaking protocol
    // 2026-07-28 rejected every call result as malformed while every test
    // still passed. Caught 2026-09-05 by the eval harness, not by this suite.
    assert.equal(res.result.resultType, 'complete');
  });

  test('calling a tool this server does not expose is refused, not executed', async () => {
    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'motorical_send_email', arguments: {} } },
      ctx(analytics));
    assert.ok(res.error, 'must be a JSON-RPC error');
    assert.equal(res.result, undefined);
  });

  test('a real send creates a task and returns nextAction; dryRun does not', async () => {
    const sent = { data: { id: 'email-log-99', to: ['a@x.com'], acceptanceStatus: 'queued' }, success: true };
    const stubClient = { sendEmail: async () => sent };

    const realSend = await dispatchNative(
      { jsonrpc: '2.0', id: 50, method: 'tools/call', params: { name: 'motorical_send_email', arguments: { to: 'a@x.com', subject: 'hi', text: 'hi', dryRun: false, confirmRealSend: true, motorBlockId: '11111111-1111-1111-1111-111111111111' } } },
      { server: transactional, client: stubClient, version: '1.5.0' });
    assert.equal(realSend.result.structuredContent.status, 'accepted');
    assert.equal(realSend.result.structuredContent.delivered, null);
    assert.equal(realSend.result.structuredContent.nextAction.tool, 'motorical_wait_for_outcome');
    assert.ok(realSend.result.structuredContent.nextAction.args.taskId);

    const dryRunSend = await dispatchNative(
      { jsonrpc: '2.0', id: 51, method: 'tools/call', params: { name: 'motorical_send_email', arguments: { to: 'a@x.com', subject: 'hi', text: 'hi' } } },
      { server: transactional, client: { sendEmail: async () => ({ success: true, dryRun: true, data: { status: 'validated' } }) }, version: '1.5.0' });
    assert.equal(dryRunSend.result.structuredContent.nextAction, undefined);
  });

  // Fix 1. createTask ran unguarded AFTER the send had already succeeded, so a
  // throw from it (a Redis blip on ovh24, or -- always -- the published npm
  // package on a machine with no /etc/motorical/redis-password-fallback) was
  // wrapped as isError:true and reported a delivered message as a FAILED send.
  // An agent's natural response to that is to retry: duplicate mail, double
  // quota and billing consumption, for a message that already went out.
  test('a task-store failure never turns a successful send into a reported failure', async () => {
    const exploding = {
      createTask: async () => { throw new Error('Redis is unreachable'); },
      getTask: async () => null,
      listTasksForMotorBlock: async () => [],
      closeTaskStore: async () => {},
    };
    __testOnly_setDefaultStore(exploding);
    try {
      const sent = { data: { id: 'email-log-boom', acceptanceStatus: 'queued' }, success: true };
      const res = await dispatchNative(
        {
          jsonrpc: '2.0', id: 52, method: 'tools/call',
          params: {
            name: 'motorical_send_email',
            arguments: {
              to: 'a@x.com', subject: 'hi', text: 'hi', dryRun: false, confirmRealSend: true,
              motorBlockId: '11111111-1111-1111-1111-111111111111',
            },
          },
        },
        { server: transactional, client: { sendEmail: async () => sent }, version: '1.5.0' });

      assert.equal(res.result.isError, false, 'a successful send must never be reported as an error');
      // Killing the "202 == delivered" lie does not depend on Redis working.
      assert.equal(res.result.structuredContent.status, 'accepted');
      assert.equal(res.result.structuredContent.delivered, null);
      assert.equal(res.result.structuredContent.data.id, 'email-log-boom', 'the real send result must survive');
      // ...but there is no task to wait on, so no nextAction may be advertised.
      assert.equal(res.result.structuredContent.nextAction, undefined);
    } finally {
      __testOnly_setDefaultStore(__testOnly_withClient(fakeRedis));
    }
  });

  // Fix 3. args.motorBlockId is optional and /v1/send's queued response carries
  // no block, so a single-block caller's task used to be stored with
  // motorBlockId: undefined -- which made tasks/list return [] for them and
  // piled every such task into one unbounded `mcp:tasks-by-block:undefined`
  // key whose TTL was refreshed on every send.
  test('a send with no explicit motorBlockId resolves the single-block grant, never indexes under "undefined"', async () => {
    const sent = { data: { id: 'email-log-implicit', acceptanceStatus: 'queued' }, success: true };
    const client = {
      sendEmail: async () => sent,
      // The shape createDelegatedClient gives a single-block authorization.
      motorBlockIds: ['33333333-3333-3333-3333-333333333333'],
    };

    const res = await dispatchNative(
      {
        jsonrpc: '2.0', id: 53, method: 'tools/call',
        params: {
          name: 'motorical_send_email',
          arguments: { to: 'a@x.com', subject: 'hi', text: 'hi', dryRun: false, confirmRealSend: true },
        },
      },
      { server: transactional, client, version: '1.5.0' });

    assert.equal(res.result.isError, false);
    const { taskId } = res.result.structuredContent.nextAction.args;

    const store = __testOnly_withClient(fakeRedis);
    assert.deepEqual(
      await store.listTasksForMotorBlock('33333333-3333-3333-3333-333333333333'),
      [taskId],
      'tasks/list must find this task under the caller\'s real block id'
    );
    assert.equal(
      fakeRedis.sets.has('mcp:tasks-by-block:undefined'), false,
      'no key may ever be created under the literal string "undefined"'
    );
  });

  test('a send with no resolvable motor block still succeeds, just without an index entry', async () => {
    const sent = { data: { id: 'email-log-blockless', acceptanceStatus: 'queued' }, success: true };
    // No motorBlockIds, no config.motorBlockId, nothing in the response --
    // e.g. a multi-block api-key caller whose block lives in the key itself.
    const client = { sendEmail: async () => sent };

    const res = await dispatchNative(
      {
        jsonrpc: '2.0', id: 54, method: 'tools/call',
        params: {
          name: 'motorical_send_email',
          arguments: { to: 'a@x.com', subject: 'hi', text: 'hi', dryRun: false, confirmRealSend: true },
        },
      },
      { server: transactional, client, version: '1.5.0' });

    assert.equal(res.result.isError, false, 'an unresolvable block must not fail the send');
    const { taskId } = res.result.structuredContent.nextAction.args;
    // The task itself is still fully resolvable by id -- only tasks/list's
    // enumeration is affected, which is the whole point of skipping the write.
    const store = __testOnly_withClient(fakeRedis);
    assert.equal((await store.getTask(taskId)).emailLogId, 'email-log-blockless');
    assert.equal(fakeRedis.sets.has('mcp:tasks-by-block:undefined'), false);
    assert.equal(fakeRedis.sets.has('mcp:tasks-by-block:null'), false);
  });

  // Fix 6: the stored record must carry no recipient PII. Nothing ever read
  // expectedRecipients back -- resolveTask re-fetches the recipient breakdown
  // from the backend on every poll -- so it was 72h of addresses in Redis for
  // no function at all.
  test('a created task record stores no recipient addresses', async () => {
    const sent = { data: { id: 'email-log-pii', to: ['alice@x.com', 'andrew@x.com'], acceptanceStatus: 'queued' }, success: true };
    const res = await dispatchNative(
      {
        jsonrpc: '2.0', id: 55, method: 'tools/call',
        params: {
          name: 'motorical_send_email',
          arguments: {
            to: ['alice@x.com', 'andrew@x.com'], subject: 'hi', text: 'hi',
            dryRun: false, confirmRealSend: true,
            motorBlockId: '44444444-4444-4444-4444-444444444444',
          },
        },
      },
      { server: transactional, client: { sendEmail: async () => sent }, version: '1.5.0' });

    const { taskId } = res.result.structuredContent.nextAction.args;
    const rawRecord = fakeRedis.store.get(`mcp:task:${taskId}`);
    assert.ok(rawRecord, 'the task record must exist');
    assert.equal(rawRecord.includes('alice@x.com'), false, 'no recipient address may be persisted');
    assert.equal(rawRecord.includes('andrew@x.com'), false);
    assert.equal(JSON.parse(rawRecord).expectedRecipients, undefined);
  });

  // The actual regression: the 429 catch in client.js's sendEmail used to
  // RETURN a plain object (isError:true, structuredContent, next_action)
  // instead of throwing. motorical_send_email's outputSchema requires
  // success:boolean, and this dispatcher's tools/call success path (below,
  // around line 289-297) hardcodes isError:false and always runs
  // validateOutput() against a returned result -- so that returned object
  // (no `success` field) failed schema validation and the whole payload was
  // discarded in favor of a generic validation error, with none of
  // reason/retryAfterSeconds/nextAction ever reaching the wire. Throwing
  // instead takes the catch path a few lines below, which is isError:true
  // and deliberately skips schema validation. This test exercises the real
  // dispatcher end-to-end -- not just client.sendEmail() in isolation -- so
  // it would have caught the original bug.
  test('a 429 from sendEmail reaches the wire as isError with reason/retryAfterSeconds/nextAction intact', async () => {
    // A REAL MotoricalClient (only its transport-level .request is stubbed),
    // so this exercises the actual fixed code in client.js's sendEmail catch
    // block -- not a hand-rolled double standing in for it -- all the way
    // through the dispatcher's real output-schema-validation branch.
    const rateLimited = new MotoricalClient({ apiBaseUrl: 'https://api.test', mkApiKey: 'mk_test' });
    rateLimited.request = async () => {
      const err = new Error('POST /v1/send → 429: Rate limit exceeded');
      err.status = 429;
      err.data = { success: false, error: 'rate_limited_account', reason: 'acct_daily', retryAfterSeconds: 3600 };
      throw err;
    };

    const res = await dispatchNative(
      {
        jsonrpc: '2.0', id: 56, method: 'tools/call',
        params: {
          name: 'motorical_send_email',
          arguments: {
            from: 'sender@example.com', to: 'a@x.com', subject: 'hi', text: 'hi', dryRun: false, confirmRealSend: true,
            motorBlockId: '55555555-5555-5555-5555-555555555555',
          },
        },
      },
      { server: transactional, client: rateLimited, version: '1.5.0' });

    assert.equal(res.result.isError, true, 'a 429 must surface as a tool error, not a validation failure');
    assert.equal(res.result.structuredContent.details.reason, 'acct_daily');
    assert.equal(res.result.structuredContent.details.retryAfterSeconds, 3600);
    assert.deepEqual(
      res.result.structuredContent.details.nextAction,
      { tool: 'motorical_get_account_rate_limits', args: {} }
    );
  });

  test('an unknown method returns JSON-RPC -32601, not a throw', async () => {
    const res = await dispatchNative({ jsonrpc: '2.0', id: 7, method: 'no/such/method' }, ctx(analytics));
    assert.equal(res.error.code, -32601);
  });

  test('a handler that throws becomes an isError result, not a transport failure', async () => {
    const boom = new Proxy({}, { get: () => async () => { throw Object.assign(new Error('nope'), { status: 429 }); } });
    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'motorical_get_metrics', arguments: {} } },
      { server: analytics, client: boom, version: '1.5.0' });
    assert.equal(res.result.isError, true);
    assert.match(res.result.content[0].text, /nope/);
    assert.equal(res.result.resultType, 'complete');
  });
});

// The real deliverable of the JSON-Schema fix: prove the native dispatcher's
// tools/list and the SDK's OWN legacy tools/list path describe EVERY tool
// identically -- not a hand-picked few. Both read registry.js's raw Zod
// shapes; if they diverged for even one tool, a client routed to one path
// could see a different contract than a client routed to the other for that
// exact tool name, and a hand-picked sample would have no way to catch it.
// (Two real divergences -- a missing pipeStrategy option and a wrong
// empty-shape fallback -- shipped past an earlier 3-tool version of this
// test for exactly that reason: neither hand-picked tool exercised them.)
describe('native tools/list JSON Schema matches the SDK legacy tools/list JSON Schema, for every tool', () => {
  async function legacyToolsByName(server) {
    const { server: mcpServer } = createMotoricalMcpServer({
      client: stubClient,
      allowedTools: server.tools,
      serverKey: server.key,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'legacy-equality-check', version: '1.0.0' });
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    await client.close();
    return new Map(tools.map((t) => [t.name, t]));
  }

  // signup is excluded here: its one tool (motorical_signup_handoff) is
  // HOSTED_ONLY -- deliberately absent from registry.js's TOOLS array until
  // the tool itself is built (a later task in this same plan) -- so BOTH the
  // legacy SDK path and dispatchNative would register/advertise zero tools
  // for it right now. That is a true statement about today's registry, not a
  // schema divergence this parity test exists to catch; asserting it here
  // would just re-encode "the tool doesn't exist yet" as a test failure.
  for (const server of SERVERS.filter((s) => !s.tools.every((t) => HOSTED_ONLY_TOOLS.includes(t)))) {
    test(`${server.key}: every exposed tool's inputSchema/outputSchema matches legacy byte-for-byte`, async () => {
      const legacyTools = await legacyToolsByName(server);
      const nativeRes = await dispatchNative({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, ctx(server));
      const nativeByName = new Map(nativeRes.result.tools.map((t) => [t.name, t]));

      assert.ok(legacyTools.size > 0, `${server.key}: legacy tools/list returned zero tools`);
      assert.deepEqual(
        [...nativeByName.keys()].sort(),
        [...legacyTools.keys()].sort(),
        `${server.key}: native and legacy advertise different tool sets`
      );

      for (const [name, legacyTool] of legacyTools) {
        const nativeTool = nativeByName.get(name);
        assert.deepEqual(
          nativeTool.inputSchema,
          legacyTool.inputSchema,
          `${server.key}/${name}: native inputSchema diverged from the SDK's own legacy-path conversion`
        );
        if (legacyTool.outputSchema) {
          assert.deepEqual(
            nativeTool.outputSchema,
            legacyTool.outputSchema,
            `${server.key}/${name}: native outputSchema diverged from the SDK's own legacy-path conversion`
          );
        } else {
          assert.equal(
            nativeTool.outputSchema,
            undefined,
            `${server.key}/${name}: native declares an outputSchema the legacy path does not`
          );
        }
      }
    });
  }
});

// The native path advertised a schema it did not enforce. `registerTool` makes
// the SDK safeParse params.arguments against inputSchema before the handler
// runs (and validate structuredContent against outputSchema after), while
// dispatchNative called `tool.handler(client)(body.params?.arguments ?? {})`
// raw. Measured on the unfixed branch with motorical_get_logs and
// {hours:'not-a-number', motorBlockId:12345, EXTRA_SMUGGLED:'x', webhookId:7}:
//
//   NATIVE  isError=false, handler received the object verbatim, extras included
//   LEGACY  isError=true,  "Input validation error: ... Expected string,
//                           received number at motorBlockId"
//
// Zod also STRIPS unknown keys on the legacy path; native forwarded them, and
// client.sendEmail spreads ...rest into the POST /v1/send body. This is not an
// authorization bypass -- every delegated client method is wrapped with
// assertToolAllowed on both paths, and /v1/send rejects unknown body keys
// server-side -- but it is a systematic divergence between two paths whose
// whole discipline is that they must agree.
//
// These tests compare the two paths against each other rather than against a
// hardcoded expectation, so neither can drift alone.
describe('native tools/call validates arguments exactly as the legacy path does', () => {
  async function legacyCall(server, name, args) {
    const { server: mcpServer } = createMotoricalMcpServer({
      client: echoClient,
      allowedTools: server.tools,
      serverKey: server.key,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'legacy-validation-check', version: '1.0.0' });
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({ name, arguments: args });
    await client.close();
    return result;
  }

  function nativeCall(server, name, args) {
    return dispatchNative(
      { jsonrpc: '2.0', id: 99, method: 'tools/call', params: { name, arguments: args } },
      { server, client: echoClient, version: '1.5.0' }
    ).then((r) => r.result);
  }

  // Echoes whatever reached the handler, so a test can see exactly which keys
  // survived validation on each path.
  const echoClient = new Proxy({}, { get: () => async (args) => ({ received: args }) });

  const BAD_ARGS = { hours: 'not-a-number', motorBlockId: 12345, EXTRA_SMUGGLED: 'x', webhookId: 7 };

  test('a bad-argument call is refused on both paths, identically', async () => {
    const native = await nativeCall(analytics, 'motorical_get_logs', BAD_ARGS);
    const legacy = await legacyCall(analytics, 'motorical_get_logs', BAD_ARGS);

    assert.equal(legacy.isError, true, 'precondition: the legacy path must reject these arguments');
    assert.equal(native.isError, true, 'the native path must reject the same arguments the legacy path rejects');
    assert.deepEqual(native.content, legacy.content, 'the two paths must give the same refusal text');
    assert.match(native.content[0].text, /motorBlockId/);
  });

  test('the handler never runs when validation fails', async () => {
    let ran = false;
    const spy = new Proxy({}, { get: () => async () => { ran = true; return { ok: true }; } });
    const res = await dispatchNative(
      { jsonrpc: '2.0', id: 98, method: 'tools/call', params: { name: 'motorical_get_logs', arguments: BAD_ARGS } },
      { server: analytics, client: spy, version: '1.5.0' }
    );
    assert.equal(res.result.isError, true);
    assert.equal(ran, false, 'a tool handler must not run on arguments the schema rejects');
  });

  test('unknown keys are stripped on both paths, so nothing smuggles through to the API call', async () => {
    // client.sendEmail spreads ...rest into the POST body, so a forwarded
    // unknown key is not inert.
    const args = { motorBlockId: '11111111-1111-1111-1111-111111111111', limit: 5, EXTRA_SMUGGLED: 'x' };
    const native = await nativeCall(analytics, 'motorical_get_logs', args);
    const legacy = await legacyCall(analytics, 'motorical_get_logs', args);

    assert.equal(native.isError, false);
    assert.equal(legacy.isError, false);
    assert.deepEqual(native.structuredContent, legacy.structuredContent,
      'native and legacy must hand the handler the same arguments');
    assert.equal(native.structuredContent.received.EXTRA_SMUGGLED, undefined,
      'an unknown key must not reach the handler');
    assert.equal(native.structuredContent.received.limit, 5,
      'a declared key must survive validation');
  });

  test('a valid call still succeeds and still reaches the handler', async () => {
    const res = await nativeCall(analytics, 'motorical_get_metrics', {});
    assert.equal(res.isError, false);
    assert.ok(res.structuredContent.received);
  });

  test('a result that violates the declared outputSchema is refused on both paths', async () => {
    // The legacy path runs validateToolOutput against structuredContent; the
    // native path returned whatever the handler produced, unchecked.
    const junk = new Proxy({}, { get: () => async () => ({ definitely: 'not the declared shape' }) });
    // motorical_get_message lives on the transactional server, and its
    // inputSchema requires a real UUID -- so these arguments clear input
    // validation and it is genuinely the OUTPUT check that fires.
    const args = { messageId: '33333333-3333-3333-3333-333333333333' };
    const nativeRes = await dispatchNative(
      { jsonrpc: '2.0', id: 97, method: 'tools/call', params: { name: 'motorical_get_message', arguments: args } },
      { server: transactional, client: junk, version: '1.5.0' }
    );

    const { server: mcpServer } = createMotoricalMcpServer({
      client: junk, allowedTools: transactional.tools, serverKey: transactional.key,
    });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'legacy-output-check', version: '1.0.0' });
    await Promise.all([mcpServer.connect(st), client.connect(ct)]);
    const legacyRes = await client.callTool({ name: 'motorical_get_message', arguments: args });
    await client.close();

    assert.equal(legacyRes.isError, true, 'precondition: the legacy path must reject this output');
    assert.equal(nativeRes.result.isError, true, 'the native path must reject the output legacy rejects');
    assert.deepEqual(nativeRes.result.content, legacyRes.content);
  });
});

// JSON-RPC 2.0 forbids answering a notification (a request object with no `id`
// member). The dispatcher replied to an unroutable one with
// {jsonrpc, id: null, error: {code: -32601}}. notifications/initialized is
// hard-routed legacy in revision.js, so the common case was already safe; these
// close the rest. Over HTTP the correct answer is 202 with no body.
describe('native dispatch never answers a JSON-RPC notification', () => {
  const caps = { 'io.modelcontextprotocol/clientCapabilities': {} };

  test('an unroutable notification produces no response at all', async () => {
    const res = await dispatchNative(
      { jsonrpc: '2.0', method: 'no/such/method', params: { _meta: caps } }, ctx(analytics));
    assert.equal(res, null, 'a notification must not be answered, not even with an error');
  });

  test('a notification for a method the dispatcher DOES serve is also unanswered', async () => {
    const res = await dispatchNative({ jsonrpc: '2.0', method: 'tools/list', params: { _meta: caps } }, ctx(analytics));
    assert.equal(res, null);
  });

  test('a notification still runs its method, it just gets no reply', async () => {
    let ran = false;
    const spy = new Proxy({}, { get: () => async () => { ran = true; return { ok: true }; } });
    const res = await dispatchNative(
      { jsonrpc: '2.0', method: 'tools/call', params: { name: 'motorical_get_metrics', arguments: {}, _meta: caps } },
      { server: analytics, client: spy, version: '1.5.0' });
    assert.equal(res, null, 'no response body for a notification');
    assert.equal(ran, true, 'the method must still run — only the reply is suppressed');
  });

  test('an id of 0 is a real request id, not a missing one', async () => {
    const res = await dispatchNative({ jsonrpc: '2.0', id: 0, method: 'tools/list' }, ctx(analytics));
    assert.ok(res, 'id 0 is falsy but present — this must still be answered');
    assert.equal(res.id, 0);
  });
});
