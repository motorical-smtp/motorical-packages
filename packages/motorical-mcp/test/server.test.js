import { test } from 'node:test';
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
    'motorical_get_message',
    'motorical_get_message_events',
    'motorical_get_send_status',
    'motorical_list_motor_blocks',
    'motorical_mint_public_token',
    'motorical_sandbox_convert',
    'motorical_sandbox_provision',
    'motorical_sandbox_status',
    'motorical_send_email'
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
