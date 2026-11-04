import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSION_NEEDED_SENTENCE, CONNECT_PAGE_URL } from '../src/permissionNeeded.js';
import { assertToolAllowed } from '../src/resourceAuth.js';
import { SERVERS } from '../src/servers.js';
import { instructionsFor } from '../src/instructions.js';

test('the permission-needed sentence names the one reliable step and no client', () => {
  assert.match(PERMISSION_NEEDED_SENTENCE, /start a new chat or reconnect the connector/);
  assert.doesNotMatch(PERMISSION_NEEDED_SENTENCE, /Claude|ChatGPT|Cursor|Copilot/);
});

test('insufficient_scope ends with the shared sentence', () => {
  const srv = SERVERS.find((s) => s.key === 'webhooks');
  const tool = srv.tools.find((t) => /create|update|delete/.test(t));
  assert.throws(
    () => assertToolAllowed(srv, tool, ['read:webhooks']),
    (err) => err.code === 'insufficient_scope' && err.message.includes('Missing scope: ') && err.message.endsWith(PERMISSION_NEEDED_SENTENCE),
  );
});

test('every server handshake points at the connect page and carries the sentence', () => {
  for (const srv of SERVERS) {
    const text = instructionsFor(srv.key);
    assert.ok(text.includes(CONNECT_PAGE_URL), `${srv.key} lacks the connect page link`);
    assert.ok(text.includes(PERMISSION_NEEDED_SENTENCE), `${srv.key} lacks the sentence`);
  }
});
