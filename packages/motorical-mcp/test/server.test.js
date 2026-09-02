import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMotoricalMcpServer } from '../src/server.js';
import { MotoricalClient } from '../src/client.js';

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
  fake.getSendApiStatus = async () => ({ status: 'ok' });
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
    'motorical_get_message',
    'motorical_get_message_events',
    'motorical_get_send_status',
    'motorical_list_motor_blocks',
    'motorical_mint_public_token',
    'motorical_sandbox_allowlist_confirm',
    'motorical_sandbox_allowlist_request',
    'motorical_sandbox_convert',
    'motorical_sandbox_provision',
    'motorical_sandbox_status',
    'motorical_send_email',
    'motorical_web_handoff'
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

// The tool schema IS public contract (doctrine §10). These four tools spent
// their whole life advertising a Motor Block requirement that, as of
// 2026-09-02, does not exist: domains are account-wide and the routes are
// mounted { accountScoped: true }. A false contract is worse than a missing
// one — an agent reading this schema would go hunting for a block id it does
// not need, which is exactly what happened live.
const SERVER_SRC = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');

test('no account-scoped tool advertises motorBlockId as conditionally required', () => {
  // Only motorical_send_email may still say this: sending IS block-scoped.
  const hits = SERVER_SRC.match(/Required when the authorization covers more than one Motor Block/g) || [];
  assert.equal(hits.length, 1, `expected only send_email to claim the requirement, found ${hits.length}`);
});

test('block-scoped sending still states the requirement', () => {
  const sendBlock = SERVER_SRC.slice(SERVER_SRC.indexOf("'motorical_send_email'"));
  assert.match(
    sendBlock.slice(0, 1500),
    /Required when the authorization covers more than one Motor Block/
  );
});
