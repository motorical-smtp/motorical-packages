import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MotoricalClient } from '../src/client.js';
import { createMotoricalMcpServer } from '../src/server.js';
import { dispatchNative } from '../src/native/dispatch.js';
import { SERVERS } from '../src/servers.js';

// Output-schema hardening gate (2026-09-25). A strict MCP client validates
// structuredContent against the ADVERTISED JSON Schema, not against our zod
// objects (which silently ignore unknown keys). A closed object
// (additionalProperties:false) therefore turns any field the backend adds later
// into "must NOT have additional properties" and makes a SUCCESSFUL call look
// like an error (first real Motor Block create, 2026-09-24) — after which an
// agent may retry and duplicate the action.
//
// This test covers EVERY tool that advertises an outputSchema, on every hosted
// server, so a new tool cannot reintroduce the bug:
//   1. no advertised object schema is closed;
//   2. its recorded real-response sample validates under Ajv (the strict client);
//   3. the same sample with an UNKNOWN field injected into every object level
//      still validates (forward compatibility with backend additions);
//   4. every tool that advertises a schema has a recorded sample.
const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'tool-outputs.json'), 'utf8'));

async function advertisedSchemas() {
  const byName = new Map();
  for (const server of SERVERS) {
    const listed = await dispatchNative(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { server, client: {}, version: 'test' }
    );
    for (const t of listed.result.tools) {
      if (t.outputSchema && !byName.has(t.name)) byName.set(t.name, t.outputSchema);
    }
  }
  return byName;
}

function closedObjectPaths(schema, at = '#') {
  const found = [];
  if (!schema || typeof schema !== 'object') return found;
  if (schema.additionalProperties === false) found.push(at);
  for (const [k, v] of Object.entries(schema.properties ?? {})) found.push(...closedObjectPaths(v, `${at}/properties/${k}`));
  if (schema.items) found.push(...closedObjectPaths(schema.items, `${at}/items`));
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    (schema[key] ?? []).forEach((s, i) => found.push(...closedObjectPaths(s, `${at}/${key}/${i}`)));
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    found.push(...closedObjectPaths(schema.additionalProperties, `${at}/additionalProperties`));
  }
  return found;
}

// Adds an unknown key to every plain object in a value, at every depth. The
// value is a STRING on purpose: it is a legitimate unknown property of a
// declared object AND a legitimate extra entry of a string-valued record map
// (e.g. get_send_status `endpoints`), so a failure can only mean a closed object.
function withUnknownFields(value) {
  if (Array.isArray(value)) return value.map(withUnknownFields);
  if (value && typeof value === 'object') {
    const out = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withUnknownFields(v)]));
    out.__futureBackendField = 'added later';
    return out;
  }
  return value;
}

// The legacy (2025-11-25) path advertises through the SDK's own registerTool, a
// separate code path from the native dispatcher. It must be just as open, and
// must advertise byte-identical output schemas.
test('the legacy SDK path advertises the same OPEN output schemas as the native path', async () => {
  const fake = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com', docsBaseUrl: 'https://docs.motorical.com',
    mkApiKey: 'mk_live_x', akApiKey: 'ak_live_x', bearerToken: '',
    motorBlockId: '39b3f504-7e41-4b3f-871a-75bc77676267', defaultFrom: 'a@example.com',
  });
  const { server } = createMotoricalMcpServer({ client: fake });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const legacy = new Map((await client.listTools()).tools.filter((t) => t.outputSchema).map((t) => [t.name, t.outputSchema]));
  const native = await advertisedSchemas();

  assert.ok(legacy.size >= 14, `legacy path advertised only ${legacy.size} output schemas`);
  for (const [name, schema] of legacy) {
    assert.deepEqual(closedObjectPaths(schema), [], `legacy ${name} advertises a closed object`);
    // $schema/definitions bookkeeping aside, the two paths must agree on the structure.
    const strip = ({ $schema, ...rest }) => rest;
    assert.deepEqual(strip(schema), strip(native.get(name)), `${name}: legacy and native outputSchema differ`);
  }
});

describe('every advertised outputSchema is strict-client safe', async () => {
  const schemas = await advertisedSchemas();
  const ajv = new Ajv({ strict: false, allErrors: true });

  test('at least the known schema-bearing tools are found (the walk is not vacuous)', () => {
    assert.ok(schemas.size >= 14, `expected >=14 tools with an outputSchema, found ${schemas.size}`);
  });

  for (const [name, schema] of schemas) {
    describe(name, () => {
      test('no closed object anywhere in the advertised JSON Schema', () => {
        assert.deepEqual(closedObjectPaths(schema), [], `${name} advertises a closed object`);
      });

      test('has a recorded real-response sample', () => {
        assert.ok(SAMPLES[name], `${name} advertises an outputSchema but has no sample in fixtures/tool-outputs.json`);
      });

      test('its sample validates under the advertised schema (strict client)', () => {
        const validate = ajv.compile(schema);
        assert.equal(validate(SAMPLES[name]), true, JSON.stringify(validate.errors));
      });

      test('the sample plus unknown fields at every level still validates', () => {
        const validate = ajv.compile(schema);
        const grown = withUnknownFields(SAMPLES[name]);
        assert.equal(validate(grown), true, JSON.stringify(validate.errors));
      });
    });
  }
});
