import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const bin = join(root, '..', 'src', 'index.js');

test('motorical help exits 0', () => {
  const r = spawnSync(process.execPath, [bin, 'help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /sandbox provision/);
});
