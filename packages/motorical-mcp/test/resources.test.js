import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RESOURCES, RESOURCE_TEMPLATES, resourceByUri, matchResourceTemplate } from '../src/resources.js';

describe('resources registry', () => {
  test('the account-state resource is registered with a real handler', () => {
    const r = resourceByUri('motorical://account/state');
    assert.ok(r, 'motorical://account/state must be registered');
    assert.equal(typeof r.handler, 'function');
    assert.equal(r.mimeType, 'application/json');
  });

  test('the two resource templates are registered', () => {
    assert.equal(RESOURCE_TEMPLATES.length, 2);
    assert.ok(RESOURCE_TEMPLATES.some((t) => t.uriTemplate === 'motorical://domain/{domain}'));
    assert.ok(RESOURCE_TEMPLATES.some((t) => t.uriTemplate === 'motorical://motor-block/{id}'));
  });

  test('matchResourceTemplate extracts the domain variable', () => {
    const match = matchResourceTemplate('motorical://domain/example.com');
    assert.ok(match);
    assert.equal(match.template.uriTemplate, 'motorical://domain/{domain}');
    assert.deepEqual(match.variables, { domain: 'example.com' });
  });

  test('matchResourceTemplate extracts the motor-block id variable', () => {
    const match = matchResourceTemplate('motorical://motor-block/11111111-1111-1111-1111-111111111111');
    assert.ok(match);
    assert.equal(match.template.uriTemplate, 'motorical://motor-block/{id}');
    assert.deepEqual(match.variables, { id: '11111111-1111-1111-1111-111111111111' });
  });

  test('matchResourceTemplate returns null for a URI matching neither template', () => {
    assert.equal(matchResourceTemplate('motorical://something/else'), null);
  });

  test('the account-state resource handler calls client.getAccountState and returns real content', async () => {
    const r = resourceByUri('motorical://account/state');
    const fakeClient = { getAccountState: async () => ({ success: true, data: { stage: 'no_domain' } }) };
    const result = await r.handler(fakeClient)();
    assert.equal(result.contents[0].uri, 'motorical://account/state');
    assert.equal(result.contents[0].mimeType, 'application/json');
    assert.match(result.contents[0].text, /no_domain/);
  });

  test('the domain resource template handler returns the one matching domain entry', async () => {
    const template = RESOURCE_TEMPLATES.find((t) => t.uriTemplate === 'motorical://domain/{domain}');
    const fakeClient = { getAccountState: async () => ({ success: true, data: { domains: [{ domain: 'example.com', sendReady: true }] } }) };
    const result = await template.handler(fakeClient)({ domain: 'example.com' });
    assert.match(result.contents[0].text, /example\.com/);
  });

  test('the domain resource template handler throws a clear error for an unknown domain', async () => {
    const template = RESOURCE_TEMPLATES.find((t) => t.uriTemplate === 'motorical://domain/{domain}');
    const fakeClient = { getAccountState: async () => ({ success: true, data: { domains: [] } }) };
    await assert.rejects(() => template.handler(fakeClient)({ domain: 'nope.com' }), /not found/i);
  });

  test('the motor-block resource template handler returns the one matching block entry', async () => {
    const template = RESOURCE_TEMPLATES.find((t) => t.uriTemplate === 'motorical://motor-block/{id}');
    const fakeClient = { getAccountState: async () => ({ success: true, data: { motorBlocks: [{ id: 'abc', active: true }] } }) };
    const result = await template.handler(fakeClient)({ id: 'abc' });
    assert.match(result.contents[0].text, /abc/);
  });

  test('the hosted motor-block template performs live authorization before account-state lookup', async () => {
    const template = RESOURCE_TEMPLATES.find((t) => t.uriTemplate === 'motorical://motor-block/{id}');
    const events = [];
    const fakeClient = {
      motorBlockIds: ['stale-old-id'],
      authorizeMotorBlock: async (id) => { events.push(`authorize:${id}`); },
      getAccountState: async () => {
        events.push('account-state');
        return { success: true, data: { motorBlocks: [{ id: 'new-id', active: true }] } };
      },
    };
    const result = await template.handler(fakeClient)({ id: 'new-id' });
    assert.match(result.contents[0].text, /new-id/);
    assert.deepEqual(events, ['authorize:new-id', 'account-state']);
  });

  test('the hosted motor-block template returns no account data after a live denial', async () => {
    const template = RESOURCE_TEMPLATES.find((t) => t.uriTemplate === 'motorical://motor-block/{id}');
    let accountStateRead = false;
    const fakeClient = {
      authorizeMotorBlock: async () => { throw new Error('authorization_revoked'); },
      getAccountState: async () => { accountStateRead = true; return { success: true, data: {} }; },
    };
    await assert.rejects(() => template.handler(fakeClient)({ id: 'new-id' }), /authorization_revoked/);
    assert.equal(accountStateRead, false);
  });

  test('the motor-block resource template handler throws a clear error for an unknown id', async () => {
    const template = RESOURCE_TEMPLATES.find((t) => t.uriTemplate === 'motorical://motor-block/{id}');
    const fakeClient = { getAccountState: async () => ({ success: true, data: { motorBlocks: [] } }) };
    await assert.rejects(() => template.handler(fakeClient)({ id: 'nope' }), /not found/i);
  });

  // Whole-branch review finding: `(raw.data.domains || [])` cannot tell "the
  // field was present but empty" (genuine not-found) apart from "the field
  // itself is absent/malformed" (a malformed/incomplete backend response --
  // can't verify one way or the other). Collapsing both into the same
  // `Domain not found: x` throw makes the specific, false claim that the
  // domain definitely does not exist when the real problem is missing data.
  // These pin the honest error for the field-absent case, for both templates.
  test('the domain resource template handler reports missing data, not a false not-found, when domains is absent entirely', async () => {
    const template = RESOURCE_TEMPLATES.find((t) => t.uriTemplate === 'motorical://domain/{domain}');
    const fakeClient = { getAccountState: async () => ({ success: true, data: { /* no domains key at all */ } }) };
    await assert.rejects(
      () => template.handler(fakeClient)({ domain: 'example.com' }),
      /missing domains data/i
    );
  });

  test('the motor-block resource template handler reports missing data, not a false not-found, when motorBlocks is absent entirely', async () => {
    const template = RESOURCE_TEMPLATES.find((t) => t.uriTemplate === 'motorical://motor-block/{id}');
    const fakeClient = { getAccountState: async () => ({ success: true, data: { /* no motorBlocks key at all */ } }) };
    await assert.rejects(
      () => template.handler(fakeClient)({ id: 'abc' }),
      /missing motorBlocks data/i
    );
  });
});
