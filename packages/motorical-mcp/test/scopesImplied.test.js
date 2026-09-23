import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assertToolAllowed } from '../src/resourceAuth.js';
import { SERVERS } from '../src/servers.js';

const main = SERVERS.find((s) => s.key === 'main');

describe('MCP-layer implied read scopes', () => {
  test('a grant holding only manage:webhooks passes a tool requiring read:webhooks', () => {
    assert.doesNotThrow(() => assertToolAllowed(main, 'motorical_webhook_list', ['manage:webhooks']));
  });

  test('a grant holding only manage:domains passes a tool requiring read:domains', () => {
    assert.doesNotThrow(() => assertToolAllowed(main, 'motorical_domain_list', ['manage:domains']));
  });

  test('a grant holding only read:webhooks still cannot call the write tool', () => {
    assert.throws(() => assertToolAllowed(main, 'motorical_webhook_delete', ['read:webhooks']));
  });

  test('a grant holding only read:webhooks passes the read-only tool', () => {
    assert.doesNotThrow(() => assertToolAllowed(main, 'motorical_webhook_list', ['read:webhooks']));
  });
});
