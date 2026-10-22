import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../src/registry.js';

const tool = TOOLS.find((t) => t.name === 'motorical_get_error_codes');

test('the description tells an agent what each row says and how to get from a code to example messages', () => {
  const d = tool.description;
  assert.match(d, /cause/);
  assert.match(d, /retryable/);
  assert.match(d, /suggestedAction/);
  assert.match(d, /lookup/);
  assert.match(d, /motorical_get_logs/);
  assert.match(d, /smtpCode/);
});

test('the description is honest that basic, enhanced and bucket codes all appear', () => {
  assert.match(tool.description, /400|500|bucket/);
  assert.match(tool.description, /enhanced/);
});
