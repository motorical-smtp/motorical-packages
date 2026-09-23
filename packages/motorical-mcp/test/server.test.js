import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMotoricalMcpServer } from '../src/server.js';
import { MotoricalClient } from '../src/client.js';
import {
  ACCOUNT_SCOPED_TOOLS, TOOL_SCOPES, LOCAL_ONLY_TOOLS, PROMPT_TOOLS, LOCAL_SERVER_TOOL_COUNT, SERVERS,
} from '../src/servers.js';

test('MCP server lists tools and resources', async () => {
  const fake = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: 'mk_live_x',
    akApiKey: 'ak_live_x',
    bearerToken: '',
    motorBlockId: '39b3f504-7e41-4b3f-871a-75bc77676267',
    defaultFrom: 'a@example.com'
  });
  // `success` is the one field motorical_get_send_status's outputSchema
  // requires (it's the field GET /v1/status genuinely always returns).
  fake.getSendApiStatus = async () => ({ success: true, message: 'ok' });
  fake.fetchDocs = async (p) => (p.includes('openapi') ? '{"openapi":"3.1.0"}' : '# llms');

  const { server } = createMotoricalMcpServer({ client: fake });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    'motorical_domain_add',
    'motorical_domain_check_dns',
    'motorical_domain_list',
    'motorical_domain_verify',
    'motorical_get_account_rate_limits',
    'motorical_get_anomalies',
    'motorical_get_config',
    'motorical_get_daily_summary',
    'motorical_get_deliverability',
    'motorical_get_domain_health',
    'motorical_get_error_codes',
    'motorical_get_logs',
    'motorical_get_message',
    'motorical_get_message_by_smtp_id',
    'motorical_get_message_events',
    'motorical_get_metrics',
    'motorical_get_onboarding_state',
    'motorical_get_overview',
    'motorical_get_providers',
    'motorical_get_rate_limits',
    'motorical_get_reputation',
    'motorical_get_send_status',
    'motorical_list_motor_blocks',
    'motorical_mint_public_token',
    'motorical_sandbox_allowlist_confirm',
    'motorical_sandbox_allowlist_request',
    'motorical_sandbox_convert',
    'motorical_sandbox_provision',
    'motorical_sandbox_status',
    'motorical_send_email',
    'motorical_wait_for_outcome',
    'motorical_web_handoff',
    'motorical_webhook_create',
    'motorical_webhook_delete',
    'motorical_webhook_get_deliveries',
    'motorical_webhook_get_stats',
    'motorical_webhook_list',
    'motorical_webhook_test',
    'motorical_webhook_update'
  ]);

  const status = await client.callTool({ name: 'motorical_get_send_status', arguments: {} });
  assert.equal(!!status.isError, false);
  assert.match(status.content[0].text, /ok/);

  const resources = await client.listResources();
  const uris = resources.resources.map((r) => r.uri);
  assert.ok(uris.includes('motorical://docs/llms.txt'));
  assert.ok(uris.includes('motorical://docs/openapi.json'));

  await client.close();
  await server.close();
});

// The tool schema IS public contract (doctrine §10). The domain tools spent
// their whole life advertising a Motor Block requirement that, as of
// 2026-09-02, does not exist: domains are account-wide and the routes are
// mounted { accountScoped: true }. A false contract is worse than a missing
// one — an agent reading this schema would go hunting for a block id it does
// not need, which is exactly what happened live.
//
// Rewritten 2026-09-02 to read the REGISTERED SCHEMAS rather than count
// occurrences in source. The original pinned the raw count at 1, which only
// held while send_email was the sole tool stating the requirement; once a
// shared blockSelector was factored out for the genuinely block-scoped
// analytics tools, the count stopped meaning anything. What matters is which
// TOOL says it, and this is also what a client actually sees.
async function registeredTools() {
  const fake = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: 'mk_live_x', akApiKey: 'ak_live_x', bearerToken: '',
    motorBlockId: '39b3f504-7e41-4b3f-871a-75bc77676267',
    defaultFrom: 'a@example.com'
  });
  const { server } = createMotoricalMcpServer({ client: fake });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'schema-probe', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return (await client.listTools()).tools;
}

test('no account-scoped tool advertises motorBlockId as conditionally required', async () => {
  const tools = await registeredTools();
  for (const name of ACCOUNT_SCOPED_TOOLS) {
    const tool = tools.find((t) => t.name === name);
    if (!tool) continue; // not exposed as a tool (e.g. registered as a prompt)
    const desc = tool.inputSchema?.properties?.motorBlockId?.description || '';
    assert.ok(!/required/i.test(desc),
      `${name} is account-scoped but advertises motorBlockId as required: "${desc}"`);
  }
});

test('block-scoped tools still state the requirement', async () => {
  const tools = await registeredTools();
  for (const name of ['motorical_send_email', 'motorical_get_overview']) {
    const tool = tools.find((t) => t.name === name);
    const desc = tool.inputSchema?.properties?.motorBlockId?.description || '';
    assert.match(desc, /required/i, `${name} must still state the Motor Block requirement`);
  }
});

// Every pre-existing block-scoped tool declares motorBlockId OPTIONAL, so a
// single-block grant resolves automatically (delegatedClient's resolveBlock
// picks the sole covered block; the backend does the same for Bearer tokens).
// The analytics tools shipped it REQUIRED at first, which forced single-block
// users to pass an id they should never need and moved the multi-block refusal
// from resolveBlock — with its actionable message — up into a Zod type error.
// Caught live 2026-09-02 against the hosted server.
test('no block-scoped tool makes motorBlockId a required argument', async () => {
  const tools = await registeredTools();
  const offenders = tools
    .filter((t) => t.inputSchema?.properties?.motorBlockId)
    .filter((t) => (t.inputSchema.required || []).includes('motorBlockId'))
    .map((t) => t.name);
  assert.deepEqual(offenders, [],
    `these tools force a motorBlockId a single-block grant should resolve: ${offenders.join(', ')}`);
});

test('reported server version matches package.json, not a hardcoded literal', async () => {
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

  const fake = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: 'mk_live_x',
    akApiKey: 'ak_live_x',
    bearerToken: '',
    motorBlockId: '39b3f504-7e41-4b3f-871a-75bc77676267',
    defaultFrom: 'a@example.com'
  });

  const { server } = createMotoricalMcpServer({ client: fake });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  assert.equal(client.getServerVersion().version, pkg.version);
});

test('webhook tools declare motorBlockId optional and webhookId where relevant', async () => {
  const tools = await registeredTools();
  const withWebhookId = ['motorical_webhook_update', 'motorical_webhook_delete', 'motorical_webhook_test', 'motorical_webhook_get_deliveries', 'motorical_webhook_get_stats'];
  for (const name of withWebhookId) {
    const tool = tools.find((t) => t.name === name);
    assert.ok(tool, `${name} not registered`);
    assert.ok(tool.inputSchema.properties.webhookId, `${name} must declare webhookId`);
    assert.ok((tool.inputSchema.required || []).includes('webhookId'), `${name} must require webhookId`);
    assert.ok(!(tool.inputSchema.required || []).includes('motorBlockId'), `${name} must not require motorBlockId`);
  }
});

test('legacy path lists the account-state resource and its templates', async () => {
  const fake = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: 'mk_live_x',
    akApiKey: 'ak_live_x',
    bearerToken: '',
    motorBlockId: '39b3f504-7e41-4b3f-871a-75bc77676267',
    defaultFrom: 'a@example.com'
  });
  fake.getAccountState = async () => ({
    success: true,
    data: { stage: 'no_domain', domains: [], motorBlocks: [] }
  });

  const { server } = createMotoricalMcpServer({ client: fake });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'resource-probe', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const resources = await client.listResources();
  const uris = resources.resources.map((r) => r.uri);
  assert.ok(uris.includes('motorical://account/state'));

  const templates = await client.listResourceTemplates();
  const uriTemplates = templates.resourceTemplates.map((t) => t.uriTemplate);
  assert.ok(uriTemplates.includes('motorical://domain/{domain}'));
  assert.ok(uriTemplates.includes('motorical://motor-block/{id}'));

  const read = await client.readResource({ uri: 'motorical://account/state' });
  assert.match(read.contents[0].text, /no_domain/);

  await client.close();
  await server.close();
});

// Whole-branch review finding: the native dispatch path (dispatch.js) scopes
// resources/resource-templates to the analytics server only
// (`server.key === 'analytics'`), but this legacy-path registration loop used
// to run unconditionally for EVERY server -- so a legacy-protocol client on
// e.g. the `domains` server could list AND read `motorical://account/state`
// even though the native path on that exact same server correctly refuses it
// (proven live). This test builds the legacy server for a NON-analytics
// server context and confirms it now agrees with the native path's own
// scoping, mirroring resourcesDispatch.test.js's
// 'resources/list returns nothing on a server this resource is not scoped to'.
test('legacy path does not list or serve the account-state resource for a non-analytics server', async () => {
  const domainsServer = SERVERS.find((s) => s.key === 'domains');
  const fake = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com',
    docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: 'mk_live_x',
    akApiKey: 'ak_live_x',
    bearerToken: '',
    motorBlockId: '39b3f504-7e41-4b3f-871a-75bc77676267',
    defaultFrom: 'a@example.com'
  });
  fake.getAccountState = async () => ({
    success: true,
    data: { stage: 'no_domain', domains: [], motorBlocks: [] }
  });

  const { server } = createMotoricalMcpServer({
    client: fake,
    allowedTools: domainsServer.tools,
    serverKey: domainsServer.key,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'domains-resource-probe', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const resources = await client.listResources();
  const uris = resources.resources.map((r) => r.uri);
  assert.ok(!uris.includes('motorical://account/state'),
    'domains server must not list motorical://account/state -- it is analytics-only');

  const templates = await client.listResourceTemplates();
  assert.deepEqual(templates.resourceTemplates, [],
    'domains server must not list any account-state resource templates');

  await assert.rejects(
    () => client.readResource({ uri: 'motorical://account/state' }),
    /Resource .* not found|not found/i,
    'domains server must refuse to read motorical://account/state'
  );

  await client.close();
  await server.close();
});

// The docs pages state how many tools the local server registers, and the
// docs gate checks that number against LOCAL_SERVER_TOOL_COUNT rather than
// against a hand-typed literal. That only works while the declaration in
// servers.js still matches what the server actually registers — which is what
// this test pins. Without it, the declaration is just a second place to be
// wrong. (The published count went stale at 30 while the real figure was 37;
// nothing caught it, because nothing was comparing them.)
test('the declared local-server tool count matches what the server registers', async () => {
  const tools = await registeredTools();
  const registered = tools.map((t) => t.name).sort();
  const catalogue = Object.keys(TOOL_SCOPES).sort();

  assert.equal(registered.length, LOCAL_SERVER_TOOL_COUNT,
    `LOCAL_SERVER_TOOL_COUNT says ${LOCAL_SERVER_TOOL_COUNT} but the server registers ${registered.length}`);

  // The two declared deltas must be exactly the difference between the
  // published catalogue and the registered tool set — no more, no less.
  assert.deepEqual(registered.filter((t) => !catalogue.includes(t)).sort(), [...LOCAL_ONLY_TOOLS].sort(),
    'LOCAL_ONLY_TOOLS does not match the tools registered outside the catalogue');
  assert.deepEqual(catalogue.filter((t) => !registered.includes(t)).sort(), [...PROMPT_TOOLS].sort(),
    'PROMPT_TOOLS does not match the catalogue entries that are not registered as tools');
});
