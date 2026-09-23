// A registry-wide refactor can change the advertised wire surface without
// breaking a single existing test, because nothing else asserts descriptions or
// input schema keys. This freezes them. It is characterisation, not TDD: it
// passes on first run, and its job is to KEEP passing across the registry lift.
// (No tool count is written here on purpose: the fixture carries the real
// number and the tests derive from it. An earlier version of this comment said
// "39", which was never right -- the true figure is the fixture's, per Ruling
// Q5 -- and a hand-typed count is exactly the trap that produced it.)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMotoricalMcpServer } from '../src/server.js';
import { toolSurface } from './helpers/toolSurface.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(here, 'fixtures', 'tool-surface.json');

const stubClient = new Proxy({}, { get: () => async () => ({}) });

describe('tool surface', () => {
  test('matches the recorded fixture exactly', () => {
    const { server } = createMotoricalMcpServer({ client: stubClient });
    const actual = toolSurface(server);
    const expected = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    assert.deepEqual(actual, expected);
  });

  test('the fixture is not empty and covers every catalogue tool', async () => {
    const expected = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    assert.ok(expected.length >= 30, `fixture has only ${expected.length} tools`);
    const { ALL_TOOLS, PROMPT_TOOLS } = await import('../src/servers.js');
    // PROMPT_TOOLS are catalogue entries registered as MCP *prompts*, not
    // tools (see servers.js) — they never appear in server._registeredTools,
    // so toolSurface() correctly omits them from the fixture.
    const promptTools = new Set(PROMPT_TOOLS);
    const names = new Set(expected.map((t) => t.name));
    for (const t of ALL_TOOLS) {
      if (promptTools.has(t)) continue;
      assert.ok(names.has(t), `catalogue tool ${t} missing from the fixture`);
    }
  });
});
