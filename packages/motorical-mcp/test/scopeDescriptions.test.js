import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, toolByName } from '../src/registry.js';
import { TOOL_SCOPES, SCOPES } from '@motorical/scope-catalog';

test('every tool with a TOOL_SCOPES entry states its required scope in its description', () => {
  for (const tool of TOOLS) {
    const scopes = TOOL_SCOPES[tool.name];
    if (!scopes || scopes.length === 0) continue;
    for (const s of scopes) {
      assert.ok(
        tool.description.includes(s),
        `${tool.name}'s description doesn't mention required scope "${s}"`,
      );
    }
  }
});

test('sandbox allowlist tools additionally state they need a dashboard session, not just the scope', () => {
  for (const name of ['motorical_sandbox_allowlist_request', 'motorical_sandbox_allowlist_confirm']) {
    const tool = toolByName(name);
    assert.match(tool.description, /dashboard session/i);
  }
});

test('sandbox status/provision/convert do NOT get the dashboard-session-only caveat — they work over OAuth', () => {
  for (const name of ['motorical_sandbox_status', 'motorical_sandbox_provision', 'motorical_sandbox_convert']) {
    const tool = toolByName(name);
    assert.doesNotMatch(tool.description, /dashboard session, not OAuth/i);
  }
});
