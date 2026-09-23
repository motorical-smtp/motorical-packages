// packages/motorical-mcp/test/outputSchema.test.js
//
// A declared outputSchema that does not match reality is worse than none: a
// conforming client rejects a payload the server considers correct. So every
// schema here is proven against a recorded sample of the real response.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { TOOLS } from '../src/registry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'tool-outputs.json'), 'utf8'));

const MUST_DECLARE = [
  'motorical_send_email',
  'motorical_get_send_status',
  'motorical_get_message',
  'motorical_get_message_events',
];

describe('output schemas', () => {
  test('the four tools P2 depends on declare an outputSchema', () => {
    for (const name of MUST_DECLARE) {
      const t = TOOLS.find((x) => x.name === name);
      assert.ok(t, `${name} not in registry`);
      assert.ok(t.outputSchema, `${name} must declare an outputSchema`);
    }
  });

  test('each declared schema accepts its recorded real-response sample', () => {
    for (const t of TOOLS) {
      if (!t.outputSchema) continue;
      const sample = SAMPLES[t.name];
      assert.ok(sample, `${t.name} declares an outputSchema but has no recorded sample`);
      const result = z.object(t.outputSchema).safeParse(sample);
      assert.ok(result.success,
        `${t.name}: recorded sample fails its own schema — ${JSON.stringify(result.error?.issues)}`);
    }
  });

  test('a schema actually constrains — it rejects an empty object', () => {
    for (const t of TOOLS) {
      if (!t.outputSchema) continue;
      const empty = z.object(t.outputSchema).safeParse({});
      assert.equal(empty.success, false, `${t.name}: schema accepts {} and constrains nothing`);
    }
  });
});
