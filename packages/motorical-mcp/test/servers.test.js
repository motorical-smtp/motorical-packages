import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVERS, TOOL_SCOPES, ACCOUNT_SCOPED_TOOLS, TOOL_ROUTES, HOSTED_ONLY_TOOLS, byPath, canonicalUriFor, MCP_HOST } from '../src/servers.js';

test('every server has a distinct canonical URI', () => {
  const uris = SERVERS.map((s) => s.canonicalUri);
  assert.equal(new Set(uris).size, uris.length);
});

test('canonical URIs are exact, with no trailing slash and no port', () => {
  for (const s of SERVERS) {
    assert.equal(s.canonicalUri, `${MCP_HOST}${s.path}`);
    assert.ok(!s.canonicalUri.endsWith('/'), `${s.key} ends with /`);
    assert.match(s.canonicalUri, /^https:\/\/mcp\.motorical\.com\/v1\/[a-z_]+\/mcp$/);
  }
});

test('the main server is a superset of every scoped server', () => {
  const main = SERVERS.find((s) => s.key === 'main');
  // signup is deliberately excluded: its tool is HOSTED_ONLY (this narrow,
  // unauthenticated audience is the ONLY place it exists), so it is not part
  // of ALL_TOOLS/main by design -- exactly like LOCAL_ONLY_TOOLS is never
  // part of any hosted server's tool list, just mirrored the other way.
  for (const s of SERVERS.filter((x) => x.key !== 'main' && x.key !== 'signup')) {
    for (const t of s.tools) {
      assert.ok(main.tools.includes(t), `main is missing ${t} from ${s.key}`);
    }
    for (const sc of s.scopes) {
      assert.ok(main.scopes.includes(sc), `main is missing scope ${sc} from ${s.key}`);
    }
  }
});

test('no server grants logs.pii', () => {
  for (const s of SERVERS) assert.ok(!s.scopes.includes('logs.pii'), `${s.key} grants logs.pii`);
});

test('every tool listed on every server has a TOOL_SCOPES entry, except an explicitly hosted-only one', () => {
  for (const s of SERVERS) {
    for (const t of s.tools) {
      if (HOSTED_ONLY_TOOLS.includes(t)) continue; // explicitly "none" -- see servers.js
      assert.ok(TOOL_SCOPES[t], `${t} (on ${s.key}) has no TOOL_SCOPES entry`);
    }
  }
});

test("each server's scopes equal the union of its tools' scopes", () => {
  for (const s of SERVERS) {
    // Matches scopesForTools' own `|| []` fallback: a HOSTED_ONLY_TOOLS tool
    // has no TOOL_SCOPES entry by design and contributes no scopes, rather
    // than the bare `TOOL_SCOPES[t]` this test used before signup existed.
    const union = [...new Set(s.tools.flatMap((t) => TOOL_SCOPES[t] || []))];
    assert.deepEqual([...s.scopes].sort(), union.sort(),
      `${s.key}'s scopes are not the union of its tools' TOOL_SCOPES`);
  }
});

test('byPath resolves exactly, and rejects near-misses', () => {
  assert.equal(byPath('/v1/motorical_transactional/mcp').key, 'transactional');
  assert.equal(byPath('/v1/motorical_transactional/mcp/'), null);
  assert.equal(byPath('/v1/motorical_transactional'), null);
  assert.equal(byPath('/v1/nope/mcp'), null);
});

test('canonicalUriFor returns the audience string used for token binding', () => {
  assert.equal(canonicalUriFor('transactional'), `${MCP_HOST}/v1/motorical_transactional/mcp`);
});

test('every account-scoped tool is a real tool', () => {
  for (const t of ACCOUNT_SCOPED_TOOLS) {
    assert.ok(TOOL_SCOPES[t], `${t} is not a known tool`);
  }
});

test('the account-scoped set is exactly the account-wide operations', () => {
  assert.deepEqual([...ACCOUNT_SCOPED_TOOLS].sort(), [
    'motorical_domain_add',
    'motorical_domain_check_dns',
    'motorical_domain_list',
    'motorical_domain_verify',
    'motorical_get_account_rate_limits',
    'motorical_get_onboarding_state',
    'motorical_list_motor_blocks',
    'motorical_motor_block_create',
    'motorical_motor_block_delete_status',
    'motorical_motor_block_list',
    'motorical_sandbox_convert',
    'motorical_sandbox_provision',
    'motorical_sandbox_status',
  ]);
});

// get_config and get_domain_health need config.read, and manage:domains is the
// only MCP scope that grants it. They live on the DOMAINS server rather than
// analytics for exactly that reason: a server advertises the union of its
// tools' scopes, so putting them on analytics would have made connecting to an
// analytics client request domain writes. Decided 2026-09-02.
test('the analytics server never requests domain-write authority', () => {
  const analytics = SERVERS.find((s) => s.key === 'analytics');
  assert.deepEqual(analytics.scopes, ['read:analytics']);
});

test('the config and domain-health tools live on the domains server', () => {
  const domains = SERVERS.find((s) => s.key === 'domains');
  assert.ok(domains.tools.includes('motorical_get_config'));
  assert.ok(domains.tools.includes('motorical_get_domain_health'));
  assert.deepEqual(domains.scopes, ['read:domains', 'manage:domains']);
});

// The tool→route map is the keystone of docs symmetry: without it nothing can
// check that a shipped tool wraps a documented endpoint. Every tool must have
// an entry, and a deliberate "no route" must be an explicit null rather than
// an omission — omissions are how tools get shipped undocumented.
test('every catalogue tool has an explicit TOOL_ROUTES entry', () => {
  const missing = Object.keys(TOOL_SCOPES).filter((t) => !(t in TOOL_ROUTES));
  assert.deepEqual(missing, [], `tools with no route mapping: ${missing.join(', ')}`);
});

test('TOOL_ROUTES names no tool that is not in the catalogue', () => {
  const stray = Object.keys(TOOL_ROUTES).filter((t) => !TOOL_SCOPES[t]);
  assert.deepEqual(stray, [], `route mappings for unknown tools: ${stray.join(', ')}`);
});

test('every mapped route is a plausible API path', () => {
  for (const [tool, r] of Object.entries(TOOL_ROUTES)) {
    if (r === null) continue;
    assert.match(r.method, /^(GET|POST|PUT|DELETE|PATCH)$/, `${tool} has method ${r.method}`);
    assert.match(r.path, /^\/(api|v1)\//, `${tool} has path ${r.path}`);
  }
});

test('the webhook tools live on their own server, not analytics or domains', () => {
  const webhooks = SERVERS.find((s) => s.key === 'webhooks');
  assert.ok(webhooks, 'webhooks server must exist in SERVERS');
  assert.deepEqual(webhooks.scopes, ['read:webhooks', 'manage:webhooks']);
  const expected = [
    'motorical_webhook_list',
    'motorical_webhook_create',
    'motorical_webhook_update',
    'motorical_webhook_delete',
    'motorical_webhook_test',
    'motorical_webhook_get_deliveries',
    'motorical_webhook_get_stats',
  ];
  for (const t of expected) assert.ok(webhooks.tools.includes(t), `${t} missing from webhooks server`);
  const analytics = SERVERS.find((s) => s.key === 'analytics');
  const domains = SERVERS.find((s) => s.key === 'domains');
  for (const t of expected) {
    assert.ok(!analytics.tools.includes(t), `${t} must not be on analytics`);
    assert.ok(!domains.tools.includes(t), `${t} must not be on domains`);
  }
});
