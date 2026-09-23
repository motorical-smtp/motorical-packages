// The registry is about to become the single source that server.js, the
// catalogue emitter, the annotations gate and the native dispatcher all read.
// If it can drift from servers.js's scope table, the whole point is lost.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, toolByName } from '../src/registry.js';
import { TOOL_SCOPES, ALL_TOOLS, LOCAL_ONLY_TOOLS, HOSTED_ONLY_TOOLS, PROMPT_TOOLS } from '../src/servers.js';

describe('registry', () => {
  test('every tool has a name, a description, an inputSchema and a handler factory', () => {
    for (const t of TOOLS) {
      assert.ok(t.name, 'tool with no name');
      assert.ok(t.description && t.description.length > 20, `${t.name}: thin description`);
      assert.equal(typeof t.inputSchema, 'object', `${t.name}: inputSchema must be an object`);
      assert.equal(typeof t.handler, 'function', `${t.name}: handler must be a factory function`);
    }
  });

  test('registry names and servers.js agree in both directions', () => {
    const registryNames = new Set(TOOLS.map((t) => t.name));
    // PROMPT_TOOLS are catalogue entries registered as MCP *prompts*, not
    // tools (see servers.js / server.js's one registerPrompt call) — they
    // never go through registerTool, so the registry correctly excludes them.
    const promptTools = new Set(PROMPT_TOOLS);
    const known = new Set([...ALL_TOOLS.filter((t) => !promptTools.has(t)), ...LOCAL_ONLY_TOOLS, ...HOSTED_ONLY_TOOLS]);
    for (const n of known) assert.ok(registryNames.has(n), `${n} is in servers.js but not the registry`);
    for (const n of registryNames) assert.ok(known.has(n), `${n} is in the registry but unknown to servers.js`);
  });

  test('every registry tool has a scope entry — no tool may silently require nothing', () => {
    for (const t of TOOLS) {
      if (LOCAL_ONLY_TOOLS.includes(t.name) || HOSTED_ONLY_TOOLS.includes(t.name)) continue;
      assert.ok(TOOL_SCOPES[t.name], `${t.name} has no TOOL_SCOPES entry`);
    }
  });

  test('names are unique', () => {
    assert.equal(new Set(TOOLS.map((t) => t.name)).size, TOOLS.length);
  });

  test('toolByName finds a known tool and returns undefined otherwise', () => {
    assert.equal(toolByName('motorical_send_email').name, 'motorical_send_email');
    assert.equal(toolByName('nope_not_a_tool'), undefined);
  });
});

describe('tool annotations', () => {
  const REQUIRED = ['title', 'readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'];

  test('every tool declares all five annotation fields', () => {
    for (const t of TOOLS) {
      assert.ok(t.annotations, `${t.name} has no annotations`);
      for (const k of REQUIRED) {
        assert.notEqual(t.annotations[k], undefined, `${t.name}: annotations.${k} missing`);
      }
    }
  });

  // Presence is not enough: the registry's load-time gate used `=== undefined`,
  // which would have admitted `destructiveHint: null`. A host reading a
  // non-boolean hint has no defined behaviour, which is the exact ambiguity
  // annotations exist to remove.
  test('every annotation field has the right TYPE, not merely a value', () => {
    const TYPES = { title: 'string', readOnlyHint: 'boolean', destructiveHint: 'boolean',
                    idempotentHint: 'boolean', openWorldHint: 'boolean' };
    assert.deepEqual(Object.keys(TYPES).sort(), [...REQUIRED].sort(),
      'the type map must cover exactly the required fields');
    for (const t of TOOLS) {
      for (const [k, expected] of Object.entries(TYPES)) {
        assert.equal(typeof t.annotations[k], expected,
          `${t.name}: annotations.${k} must be a ${expected}`);
      }
      assert.ok(t.annotations.title.length > 0, `${t.name}: annotations.title is empty`);
    }
  });

  test('a read-only tool is never also destructive', () => {
    for (const t of TOOLS) {
      if (t.annotations.readOnlyHint) {
        assert.equal(t.annotations.destructiveHint, false,
          `${t.name}: readOnlyHint and destructiveHint cannot both hold`);
      }
    }
  });

  test('the known destructive writes are marked destructive and not read-only', () => {
    for (const name of ['motorical_webhook_delete', 'motorical_domain_verify']) {
      const t = TOOLS.find((x) => x.name === name);
      assert.ok(t, `${name} not in registry`);
      assert.equal(t.annotations.destructiveHint, true, `${name} must be destructiveHint:true`);
      assert.equal(t.annotations.readOnlyHint, false, `${name} must not be readOnlyHint`);
    }
  });

  test('every get_/list_ tool is read-only and idempotent', () => {
    for (const t of TOOLS) {
      if (!/^motorical_(get|list)_/.test(t.name)) continue;
      assert.equal(t.annotations.readOnlyHint, true, `${t.name} should be readOnlyHint:true`);
      assert.equal(t.annotations.idempotentHint, true, `${t.name} should be idempotentHint:true`);
    }
  });

  test('sending email is not marked idempotent — retrying it delivers again', () => {
    const send = TOOLS.find((t) => t.name === 'motorical_send_email');
    assert.equal(send.annotations.idempotentHint, false);
    assert.equal(send.annotations.readOnlyHint, false);
  });

  test('domain_verify is openWorldHint:true — its dns/email branches both reach beyond Motorical (live DNS lookup, real email send)', () => {
    const verify = TOOLS.find((t) => t.name === 'motorical_domain_verify');
    assert.equal(verify.annotations.openWorldHint, true);
  });

  test('domain_verify is idempotentHint:false — its email branch sends a fresh verification email on every call, with no dedupe', () => {
    const verify = TOOLS.find((t) => t.name === 'motorical_domain_verify');
    assert.equal(verify.annotations.idempotentHint, false);
  });

  test('sandbox_convert is destructiveHint:true — its UPDATE overwrites description/limits and unconditionally resets product_allocation, discarding prior values', () => {
    const convert = TOOLS.find((t) => t.name === 'motorical_sandbox_convert');
    assert.equal(convert.annotations.destructiveHint, true);
  });
});
