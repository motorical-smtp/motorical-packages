import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../src/registry.js';

const get = (name) => TOOLS.find((t) => t.name === name);

test('motorical_get_reputation says which score it returns, how it is computed and that it differs from the dashboard Health score', () => {
  const d = get('motorical_get_reputation').description;
  assert.match(d, /delivery reputation score/i);
  assert.match(d, /0.?100|0 to 100/);
  assert.match(d, /delivery outcomes/i);
  assert.match(d, /windowDays/);
  assert.match(d, /dashboard/i);
  assert.match(d, /Health score/);
  assert.match(d, /basis|formula/);
  assert.match(d, /notTheSameAs|differ/i);
});

test('motorical_get_domain_health says it is a set-up status, not a score, so it is not compared with the reputation score', () => {
  const d = get('motorical_get_domain_health').description;
  assert.match(d, /not a (numeric )?score/i);
  assert.match(d, /reputation/i);
});

test('motorical_get_overview says its reputation block is the same delivery reputation score', () => {
  const d = get('motorical_get_overview').description;
  assert.match(d, /reputation/i);
  assert.match(d, /motorical_get_reputation/);
});
