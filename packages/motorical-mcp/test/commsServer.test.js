// The `communications` hosted server (Comms MCP M2c): its row, its two proof tools, and that it stays out of the local server.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SERVERS, byPath, TOOL_ROUTES, HOSTED_ONLY_TOOLS, ALL_TOOLS, LOCAL_SERVER_TOOL_COUNT } from '../src/servers.js';
import { TOOLS } from '../src/registry.js';
import { instructionsFor } from '../src/instructions.js';
import { createMotoricalMcpServer } from '../src/server.js';
import { COMMS_CANONICAL_URI, TOOL_SCOPES } from '@motorical/scope-catalog';

const srv = SERVERS.find((s) => s.key === 'communications');

describe('the server row', () => {
  test('exists, with its own path, canonical URI and tools', () => {
    assert.ok(srv);
    assert.equal(srv.slug, 'motorical_communications');
    assert.equal(srv.path, '/v1/motorical_communications/mcp');
    assert.equal(srv.canonicalUri, COMMS_CANONICAL_URI);
    assert.equal(srv.tools.length, 65, '2 proof + 17 read + 8 write + 16 contact (7 + 9 list manipulation) + 5 campaign + 2 send (M3-5) + 5 report (M3-6) + 9 manage (M3-7) + whoami');
    for (const t of ['comms_get_readiness', 'comms_get_map', 'motorical_whoami']) assert.ok(srv.tools.includes(t), t);
    assert.deepEqual([...srv.scopes].sort(), ['manage:comms.audience', 'manage:comms.webhooks', 'manage:comms.workspace', 'read:comms', 'send:comms.campaign', 'write:comms.audience', 'write:comms.content']);
    assert.equal(byPath(srv.path).key, 'communications');
  });
  test('is authenticated (not the public signup server)', () => assert.ok(!srv.public));
  test('a token for another server fails its audience, because the canonical URI is unique', () => {
    assert.equal(SERVERS.filter((s) => s.canonicalUri === srv.canonicalUri).length, 1);
  });
});

describe('the tools', () => {
  const byName = (n) => TOOLS.find((t) => t.name === n);
  for (const name of ['comms_get_readiness', 'comms_get_map']) {
    test(`${name} is registered, read-only and documented`, () => {
      const t = byName(name);
      assert.ok(t, 'in the registry');
      assert.equal(t.annotations.readOnlyHint, true);
      assert.equal(t.annotations.destructiveHint, false);
      assert.ok(t.description.length > 80);
      assert.ok(t.inputSchema.workspaceId, 'takes an optional workspaceId');
      assert.deepEqual(TOOL_SCOPES[name], ['read:comms']);
      assert.ok(TOOL_ROUTES[name] && TOOL_ROUTES[name].method === 'GET' && TOOL_ROUTES[name].path.startsWith('/comm-api/api/'), 'wraps a documented Comms route');
    });
    test(`${name} calls the client method of the same name`, async () => {
      const calls = [];
      const out = await byName(name).handler({ commsGetReadiness: async (a) => { calls.push(['r', a]); return { ok: 'r' }; }, commsGetMap: async (a) => { calls.push(['m', a]); return { ok: 'm' }; } })({ workspaceId: 'w' });
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0][1], { workspaceId: 'w' });
      assert.ok(out.ok);
    });
  }
});

describe('the local (npm) server never registers them', () => {
  test('they are hosted-only, not in the main tool list, and absent from a local server', () => {
    for (const n of ['comms_get_readiness', 'comms_get_map']) {
      assert.ok(HOSTED_ONLY_TOOLS.includes(n), n);
      assert.ok(!ALL_TOOLS.includes(n), n);
    }
    const { server } = createMotoricalMcpServer({ client: new Proxy({}, { get: () => async () => ({}) }) });
    const names = Object.keys(server._registeredTools || {});
    assert.ok(names.length > 0, 'the local server registers tools');
    assert.equal(names.length, LOCAL_SERVER_TOOL_COUNT, 'the count is unchanged by hosted-only tools');
    assert.ok(!names.includes('comms_get_readiness') && !names.includes('comms_get_map'));
  });
});

describe('instructions', () => {
  test('the server has its own orientation line, not just the generic text', () => {
    const text = instructionsFor('communications');
    assert.match(text, /marketing|campaign|Communications/i);
    assert.notEqual(text, instructionsFor('nonexistent-server'));
  });
});
