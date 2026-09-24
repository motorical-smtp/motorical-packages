import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../src/registry.js';

// @motorical/cli is retired. A tool description is what an agent reads to decide
// how to act, so none may send it to a tool that no longer exists. Lower-case
// `cli` is a real API enum value (the sandbox `channel` argument) and is kept;
// this checks prose only.
test('no tool description mentions the retired CLI', () => {
  const offenders = TOOLS
    .filter((t) => /\bCLI\b/.test(t.description ?? ''))
    .map((t) => `${t.name}: ${t.description}`);
  assert.deepEqual(offenders, []);
});
