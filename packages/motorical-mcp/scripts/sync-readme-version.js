#!/usr/bin/env node
/**
 * Syncs README.md's "## Tools (vX)" heading to the real package version
 * before publish. Runs as `prepack`, so the published README is correct at
 * publish time (design §5.2/§7 — the npm README is one of the four render
 * targets, and this closes the specific gap the design's evidence base
 * found: the table was headed "Tools (v1)" regardless of the real version).
 *
 * Mirrors docs-site/scripts/snapshot-api-docs.js's syncLocalMcpPage()
 * pattern for the same reason: an unchanged input produces an unchanged
 * file, so running this on every prepack is a safe no-op most of the time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const readmePath = path.resolve(here, '../README.md');
const { version } = JSON.parse(fs.readFileSync(path.resolve(here, '../package.json'), 'utf8'));

const before = fs.readFileSync(readmePath, 'utf8');
const after = before.replace(/^## Tools \(v[^)]*\)$/m, `## Tools (v${version})`);

if (after !== before) {
  fs.writeFileSync(readmePath, after);
  console.log(`sync-readme-version: README.md → v${version}`);
} else {
  console.log(`sync-readme-version: README.md already at v${version}`);
}
