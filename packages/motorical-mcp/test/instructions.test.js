import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { instructionsFor } from '../src/instructions.js';
import { createMotoricalMcpServer } from '../src/server.js';
import { SERVERS } from '../src/servers.js';

describe('instructions', () => {
  test('every scoped server has instructions', () => {
    for (const s of SERVERS) {
      const text = instructionsFor(s.key);
      assert.ok(text && text.length > 80, `${s.key}: instructions too thin`);
    }
  });

  test('an unknown server key returns usable generic guidance, never undefined', () => {
    const text = instructionsFor('no_such_server');
    assert.ok(text && text.length > 80);
  });

  test('the transactional server warns that acceptance is not delivery', () => {
    const text = instructionsFor('transactional');
    assert.match(text, /accepted/i);
    assert.match(text, /not\s+delivered|is NOT delivered/i);
  });

  test('an inherited Object property name is not mistaken for a server key', () => {
    // `PER_SERVER[serverKey] || GENERIC` walks the prototype chain, so
    // instructionsFor('toString') returned a FUNCTION rather than instructions.
    for (const key of ['toString', 'constructor', 'valueOf', '__proto__', 'hasOwnProperty']) {
      assert.equal(typeof instructionsFor(key), 'string', `${key}: not a string`);
      assert.equal(instructionsFor(key), instructionsFor('no_such_server'), `${key}: did not fall through to GENERIC`);
    }
  });

  test('instructions never name a tool that does not exist yet', () => {
    for (const s of SERVERS) {
      // motorical_wait_for_outcome ships in P2. Promising it now sends agents
      // hunting a tool that is absent from tools/list.
      assert.doesNotMatch(instructionsFor(s.key), /wait_for_outcome/);
    }
  });

  // Derived from SERVERS, not a hardcoded list of keys -- a hardcoded list is
  // exactly what let 'main' fall through to instructions with no 202 warning
  // (it was byte-identical to instructionsFor('nonexistent-key')) even though
  // it carries motorical_send_email and is the unscoped, highest-traffic
  // route. Any server whose tools include the send tool -- now or in the
  // future -- must get the acceptance-is-not-delivery warning.
  test('every server that can send email warns that 202 is acceptance, not delivery', () => {
    const sendCapableServers = SERVERS.filter((s) => s.tools.includes('motorical_send_email'));
    assert.ok(sendCapableServers.length > 0, 'expected at least one send-capable server to check');

    for (const s of sendCapableServers) {
      const text = instructionsFor(s.key);
      assert.match(text, /202/, `${s.key}: missing 202 warning`);
      assert.match(text, /accepted/i, `${s.key}: missing "accepted"`);
      assert.match(text, /not\s+delivered|is NOT delivered/i, `${s.key}: missing acceptance-vs-delivery distinction`);
    }

    // src/index.js -- the stdio entrypoint every existing @motorical/mcp
    // install uses -- calls createMotoricalMcpServer with no serverKey, so
    // instructionsFor(undefined) is the path it actually hits.
    const stdioText = instructionsFor(undefined);
    assert.match(stdioText, /202/, 'stdio path (undefined): missing 202 warning');
    assert.match(stdioText, /accepted/i, 'stdio path (undefined): missing "accepted"');
    assert.match(
      stdioText,
      /not\s+delivered|is NOT delivered/i,
      'stdio path (undefined): missing acceptance-vs-delivery distinction'
    );
  });
});

// The tests above exercise the PURE function. They passed identically while
// `instructions` was being handed to McpServer's FIRST constructor argument
// (serverInfo) instead of its second (options) -- so the string was absorbed
// into serverInfo, `Server._instructions` stayed undefined, and the
// InitializeResult carried no top-level `instructions` at all. Every
// @motorical/mcp install in Claude Desktop/Code reads `result.instructions`,
// so the one sentence Task 5 exists to deliver reached no legacy client.
//
// A pure-function test cannot see that. These boot the REAL server over the
// SDK's in-memory transport and assert what actually goes on the wire.
describe('instructions on the wire (legacy InitializeResult)', () => {
  const stubClient = new Proxy({}, { get: () => async () => ({ ok: true }) });

  async function connect(options) {
    const { server } = createMotoricalMcpServer({ client: stubClient, ...options });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'wire-probe', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return { client, close: () => client.close() };
  }

  // Raw initialize, bypassing the SDK Client's result parsing -- ImplementationSchema
  // strips unknown keys, so getServerVersion() would hide serverInfo pollution.
  async function rawInitialize(options) {
    const { server } = createMotoricalMcpServer({ client: stubClient, ...options });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const result = await new Promise((resolve, reject) => {
      clientTransport.onmessage = (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result));
      clientTransport.start().then(() => clientTransport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw', version: '0' } },
      })).catch(reject);
    });
    await clientTransport.close();
    return result;
  }

  test('the stdio path (no serverKey) sends the generic instructions to the client', async () => {
    const { client, close } = await connect({});
    assert.equal(client.getInstructions(), instructionsFor(undefined));
    await close();
  });

  test('a scoped server sends its own per-server instructions', async () => {
    for (const key of ['analytics', 'webhooks']) {
      const srv = SERVERS.find((s) => s.key === key);
      const { client, close } = await connect({ serverKey: srv.key, allowedTools: srv.tools });
      assert.equal(client.getInstructions(), instructionsFor(srv.key), `${key}: wrong instructions on the wire`);
      await close();
    }
  });

  test('instructions are a TOP-LEVEL InitializeResult field, and serverInfo is not polluted', async () => {
    const result = await rawInitialize({});
    assert.equal(typeof result.instructions, 'string', 'InitializeResult must carry top-level instructions');
    assert.equal(result.instructions, instructionsFor(undefined));
    // The spec's Implementation type is {name, title?, version} -- a ~660-char
    // blob has no business travelling there on every handshake.
    assert.deepEqual(Object.keys(result.serverInfo).sort(), ['name', 'version']);
  });
});
