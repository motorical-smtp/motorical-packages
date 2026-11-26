// Phase 1 of the tool-surface proposal (motorical-docs plans/2026-11-26-mcp-tool-surface-proposal.md): twin tools name each other, the local
// server hides the dashboard-only sandbox pair unless MOTORICAL_JWT is set, and a wrong-id call to a domain-health twin says which tool to use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMotoricalMcpServer } from '../src/server.js';
import { MotoricalClient } from '../src/client.js';
import { toolErrorPayload } from '../src/toolError.js';
import { TOOLS } from '../src/registry.js';
import { LOCAL_SERVER_TOOL_COUNT } from '../src/servers.js';

const desc = (n) => TOOLS.find((t) => t.name === n).description;

const TWINS = [
  ['motorical_list_motor_blocks', 'motorical_motor_block_list'],
  ['motorical_domain_health', 'motorical_get_domain_health'],
  ['motorical_get_rate_limits', 'motorical_get_account_rate_limits'],
];

test('every twin pair names its sibling in both descriptions', () => {
  for (const [a, b] of TWINS) {
    assert.ok(desc(a).includes(b), `${a} does not mention ${b}`);
    assert.ok(desc(b).includes(a), `${b} does not mention ${a}`);
  }
  assert.ok(desc('motorical_get_metrics').includes('motorical_get_daily_summary') && desc('motorical_get_metrics').includes('motorical_get_overview'));
});

test('the first sentence of each domain-health twin says which id it takes', () => {
  const first = (n) => desc(n).split(/(?<=\.)\s/)[0];
  assert.match(first('motorical_domain_health'), /DOMAIN id/);
  assert.match(first('motorical_get_domain_health'), /MOTOR BLOCK/);
  const dh = TOOLS.find((t) => t.name === 'motorical_domain_health').inputSchema.domainId.description;
  assert.match(dh, /never a Motor Block id/);
});

const serverNames = (config) => {
  const client = new Proxy({}, { get: (_t, k) => (k === 'config' ? config : async () => ({})) });
  return Object.keys(createMotoricalMcpServer({ client }).server._registeredTools);
};
const PAIR = ['motorical_sandbox_allowlist_request', 'motorical_sandbox_allowlist_confirm'];

test('local server: the sandbox allowlist pair is hidden without MOTORICAL_JWT and shown with it', () => {
  const without = serverNames({});
  const withJwt = serverNames({ dashboardJwt: 'jwt' });
  for (const n of PAIR) { assert.ok(!without.includes(n), n); assert.ok(withJwt.includes(n), n); }
  assert.equal(withJwt.length, LOCAL_SERVER_TOOL_COUNT);
  assert.equal(without.length, LOCAL_SERVER_TOOL_COUNT - PAIR.length);
  assert.ok(without.includes('motorical_free_recipient_add'), 'the tool that works without a JWT stays');
});

const client = () => {
  const c = new MotoricalClient({ apiBaseUrl: 'https://api.motorical.com', docsBaseUrl: 'https://docs.motorical.com', mkApiKey: '', akApiKey: '', bearerToken: '', motorBlockId: '', defaultFrom: 'a@example.com' });
  c.getBearer = async () => 'b';
  return c;
};
const fail = (status, error) => async () => { const e = new Error(`GET /x → ${status}: ${error}`); e.status = status; e.data = { success: false, error }; throw e; };
const DOM = '9c2e5d71-0b4a-4f38-8e6d-1a7b3c5f9e02';

test('domain_health with a Motor Block id (404 domain_not_found) hints at get_domain_health', async () => {
  const c = client(); c.request = fail(404, 'domain_not_found');
  await assert.rejects(() => c.domainHealthById({ domainId: DOM }), (err) => {
    const p = toolErrorPayload(err);
    assert.match(p.hint, /motorical_get_domain_health/);
    assert.equal(p.code, 'NOT_FOUND');
    return true;
  });
});

test('get_domain_health with a domain id (403 not bound, or 404) hints at domain_health', async () => {
  for (const [status, msg] of [[403, 'Token not bound to this motor block'], [404, 'No domain attached to this motor block']]) {
    const c = client(); c.request = fail(status, msg);
    await assert.rejects(() => c.getDomainHealth({ motorBlockId: DOM }), (err) => /motorical_domain_health/.test(toolErrorPayload(err).hint));
  }
});

test('the hint never replaces a scope hint, an upstream hint, or an unrelated 404', async () => {
  const c = client();
  c.request = fail(403, 'insufficient_scope');
  await assert.rejects(() => c.getDomainHealth({ motorBlockId: DOM }), (err) => /motorical_whoami/.test(toolErrorPayload(err).hint));
  c.request = async () => { const e = new Error('GET /x → 404: domain_not_found'); e.status = 404; e.data = { hint: 'upstream says X' }; throw e; };
  await assert.rejects(() => c.domainHealthById({ domainId: DOM }), (err) => toolErrorPayload(err).hint === 'upstream says X');
  c.request = fail(404, 'something_else');
  await assert.rejects(() => c.domainHealthById({ domainId: DOM }), (err) => !/motorical_get_domain_health/.test(toolErrorPayload(err).hint));
});
