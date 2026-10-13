'use strict';
// A dependant may resolve this package from the npm registry (the backend does), so a package.json pin that a LOWER
// version satisfies lets a forgotten bump hide behind the in-repo symlink. Fail when any pin's floor is below the local version.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const local = require('../package.json').version;
const parse = (v) => String(v).replace(/^[^\d]*/, '').split('.').map((n) => parseInt(n, 10) || 0);
const lt = (a, b) => { const x = parse(a); const y = parse(b); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] < y[i]; } return false; };

const consumers = ['backend/package.json', 'packages/motorical-mcp/package.json', 'docs-site/package.json'];

// Only meaningful in the monorepo, where the backend resolves this package from the npm registry. The public mirror
// (motorical-packages) carries @motorical/mcp, which is synced AFTER the catalogue is published, so its pin legitimately
// lags during a release; there the guard must not run.
const inMonorepo = fs.existsSync(path.join(root, 'backend/package.json'));

test('no package.json pin of @motorical/scope-catalog admits a version below the local one', { skip: !inMonorepo && 'not the monorepo (public mirror)' }, () => {
  for (const rel of consumers) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const pin = pkg[key] && pkg[key]['@motorical/scope-catalog'];
      if (!pin) continue;
      assert.ok(!lt(pin, local), `${rel} pins @motorical/scope-catalog ${pin}, below the local ${local}: bump the pin`);
    }
  }
});
