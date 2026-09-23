import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscoverResult } from '../src/native/discover.js';
import { dispatchNative } from '../src/native/dispatch.js';
import { SERVERS } from '../src/servers.js';

const analytics = SERVERS.find((s) => s.key === 'analytics');

describe('server/discover result', () => {
  test('carries the fields the 2026-07-28 spec requires', () => {
    const r = buildDiscoverResult({ server: analytics, version: '1.5.0' });
    assert.equal(r.resultType, 'complete');
    assert.deepEqual(r.supportedVersions, ['2026-07-28']);
    assert.equal(typeof r.capabilities, 'object');
    assert.ok(r.instructions.length > 80);
    assert.equal(typeof r.ttlMs, 'number');
    assert.ok(r.ttlMs >= 0, 'ttlMs must be >= 0');
    assert.ok(['public', 'private'].includes(r.cacheScope));
  });

  test('serverInfo travels under its _meta key, not at the top level', () => {
    const r = buildDiscoverResult({ server: analytics, version: '1.5.0' });
    assert.equal(r._meta['io.modelcontextprotocol/serverInfo'].version, '1.5.0');
    assert.equal(r.serverInfo, undefined);
  });

  test('cacheScope is public because the tool list is identical for every caller on this path', () => {
    // allowedTools is per PATH, not per user, so nothing user-specific is here.
    // If that ever stops being true this MUST become "private": the spec permits
    // a public response to be shared across access tokens.
    const r = buildDiscoverResult({ server: analytics, version: '1.5.0' });
    assert.equal(r.cacheScope, 'public');
  });

  // This is NOT the P1-era "not implemented yet" marker this test replaced.
  // The Tasks extension IS implemented here -- dispatch.js answers tasks/get
  // and tasks/list, and tasksDispatch.test.js exercises both -- but it is
  // deliberately, temporarily NOT ADVERTISED, per the final-review scope
  // ruling, because two conformance gaps remain: tasks/get's response is this
  // package's own resolver shape rather than the spec's `Task` object, and the
  // capability object is shared by all six server paths including ones that
  // expose no tool able to create a task. Advertising a capability no client
  // could use correctly is worse than withholding one that works.
  //
  // When that conformance work lands, this assertion flips back and
  // discover.js's `capabilities` regains its `extensions` key in the SAME
  // change -- not before.
  test('tasks is implemented but NOT advertised, pending spec-conformance work', () => {
    const r = buildDiscoverResult({ server: analytics, version: '1.5.0' });
    assert.ok(r.capabilities.tools, 'tools must stay advertised');
    assert.equal(r.capabilities.extensions, undefined,
      'no extensions may be advertised while the Tasks response shape is not spec-conformant');
    assert.equal(r.capabilities.tasks, undefined,
      'and never as a bare top-level key either, which was never the right shape');
  });
});

// server/discover advertised `capabilities: { tools: {}, resources: {},
// prompts: {} }` while dispatchNative handles only server/discover, tools/list
// and tools/call. Measured on the unfixed branch against the main server:
// resources/list, resources/read, prompts/list, prompts/get and ping all
// returned -32601 Method not found. Legacy clients get all of them, and
// motorical_integrate_send is a real prompt on main and transactional -- so the
// native front door promised a surface the native dispatcher does not serve.
//
// This is the branch's own rule ("the advertisement must match what is
// callable"), rigorously enforced for TOOLS and not applied to CAPABILITIES.
// The fix is to fail closed: declare only what is dispatched today.
//
// The check below is DERIVED, per Ruling Q13 -- it reads the capability keys
// the server actually advertises and probes the dispatcher for each, rather
// than comparing against a hardcoded list. Re-adding `resources: {}` makes it
// probe resources/list, get -32601, and fail, with no test edit needed.
//
// Today `tools` is the ONLY advertised key (Tasks is implemented but
// deliberately unadvertised -- see the test above), so today this probes
// exactly tools/list. The `extensions` branch below is not dead weight: it is
// what makes this test start probing tasks/list automatically, again with no
// test edit, the moment discover.js re-adds the extension.
describe('advertised capabilities match what the native dispatcher answers', () => {
  const stubClient = new Proxy({}, { get: () => async () => ({ ok: true }) });

  test('every advertised capability has a working list method on the native path', async () => {
    for (const server of SERVERS) {
      const { capabilities } = buildDiscoverResult({ server, version: '1.5.0' });
      const keys = Object.keys(capabilities);
      assert.ok(keys.length > 0, `${server.key}: advertised no capabilities at all`);

      // Core Features (tools, resources, prompts, ...) sit directly on
      // `capabilities` and name their probe method `<key>/list`. Extensions
      // (Tasks today) sit one level down under `capabilities.extensions`,
      // keyed by their full namespaced id (io.modelcontextprotocol/tasks) --
      // but the JSON-RPC method that id actually serves is the SHORT name
      // after the last "/" (tasks/get, tasks/list), per the verified spec
      // (https://modelcontextprotocol.io/extensions/tasks/overview). Collect
      // a probe for every core key AND every nested extension key so this
      // stays a real "advertised but not wired up" guard for both shapes,
      // not just the core one.
      const probes = [];
      for (const key of keys) {
        if (key === 'extensions') {
          const extensionKeys = Object.keys(capabilities.extensions ?? {});
          assert.ok(extensionKeys.length > 0, `${server.key}: advertised an empty extensions object`);
          for (const extKey of extensionKeys) {
            const shortName = extKey.split('/').pop();
            probes.push({ label: extKey, method: `${shortName}/list` });
          }
        } else {
          probes.push({ label: key, method: `${key}/list` });
        }
      }

      for (const { label, method } of probes) {
        // Task 9 gates tasks/list on a declared io.modelcontextprotocol/tasks
        // extension capability (a client that never declares it must see
        // -32601, indistinguishable from the method not existing at all --
        // see tasksDispatch.test.js). This probe is meant to check "is this
        // advertised capability actually served," not "does an undeclaring
        // caller get refused," so it declares every extension capability
        // generically here, in the verified nested shape -- harmless for
        // capabilities that don't check it (tools), and necessary for tasks
        // to reach its real answer instead of the same refusal an
        // undeclared caller would correctly get.
        const res = await dispatchNative(
          {
            jsonrpc: '2.0', id: 1, method,
            params: {
              _meta: {
                'io.modelcontextprotocol/clientCapabilities': {
                  extensions: { 'io.modelcontextprotocol/tasks': {} },
                },
              },
            },
          },
          { server, client: stubClient, version: '1.5.0' }
        );
        assert.notEqual(
          res.error?.code,
          -32601,
          `${server.key}: capabilities advertise "${label}" but dispatchNative answers ${method} with -32601 Method not found`
        );
      }
    }
  });

  test('tools is advertised, because tools/list and tools/call really are served', async () => {
    // The positive half: failing closed must not mean advertising nothing.
    const r = buildDiscoverResult({ server: analytics, version: '1.5.0' });
    assert.ok(r.capabilities.tools, 'tools must stay advertised');
  });
});

test('analytics server advertises resources; a server this resource is not scoped to does not', () => {
  const analyticsResult = buildDiscoverResult({ server: analytics, version: '1.5.0' });
  assert.ok(analyticsResult.capabilities.resources, 'analytics must advertise resources');

  const domains = SERVERS.find((s) => s.key === 'domains');
  const domainsResult = buildDiscoverResult({ server: domains, version: '1.5.0' });
  assert.equal(domainsResult.capabilities.resources, undefined);
});
