// Redaction for the Communications contact tools (Comms MCP M3-3): an agent works with ids, counts and masked addresses; a real address
// never reaches the chat. The helpers are pure; the tools run every output and every error through them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail, maskName, scrubText, scrubDeep, FULL_EMAIL } from '../src/commsMask.js';

describe('maskEmail', () => {
  test('keeps the first character of the local part and the whole domain', () => {
    assert.equal(maskEmail('jane.doe@example.com'), 'j***@example.com');
    assert.equal(maskEmail('Jane@Example.com'), 'J***@Example.com');
    assert.equal(maskEmail('a@b.co'), 'a***@b.co');
  });
  test('anything that is not an address becomes ***, and null stays null', () => {
    assert.equal(maskEmail('nope'), '***');
    assert.equal(maskEmail(''), '***');
    assert.equal(maskEmail(null), null);
    assert.equal(maskEmail(undefined), null);
  });
  test('surrounding whitespace does not leak the address', () => assert.equal(maskEmail('  jane@example.com '), 'j***@example.com'));
});

describe('maskName', () => {
  test('initials only', () => {
    assert.equal(maskName('Jane Doe'), 'J. D.');
    assert.equal(maskName('Cher'), 'C.');
    assert.equal(maskName('  mary   ann  smith '), 'M. A. S.');
  });
  test('blank or missing is null', () => { assert.equal(maskName(''), null); assert.equal(maskName(null), null); assert.equal(maskName('   '), null); });
});

describe('scrubText and scrubDeep', () => {
  test('every address inside free text is masked', () => {
    assert.equal(scrubText('row 3: jane@example.com is a duplicate of john.smith@acme.org'), 'row 3: j***@example.com is a duplicate of j***@acme.org');
  });
  test('text without an address is untouched', () => assert.equal(scrubText('no addresses here, 12 rows'), 'no addresses here, 12 rows'));
  test('walks objects and arrays, leaves numbers, booleans, ids and null alone', () => {
    const id = '55555555-5555-4555-8555-555555555555';
    const out = scrubDeep({ id, n: 3, ok: true, none: null, deep: [{ email: 'jane@example.com', note: 'sent to bob@x.io' }] });
    assert.deepEqual(out, { id, n: 3, ok: true, none: null, deep: [{ email: 'j***@example.com', note: 'sent to b***@x.io' }] });
  });
  test('property: no full address survives, wherever it hides', () => {
    const nasty = { a: 'x jane.doe@example.com y', b: ['mixed.Case+tag@Sub.Example.co.uk'], c: { d: { e: 'bob@x.io, amy@y.io;carl@z.io' } }, f: 'weird..dots@example.com' };
    assert.doesNotMatch(JSON.stringify(scrubDeep(nasty)), FULL_EMAIL);
  });
  test('does not mutate its input', () => {
    const input = { email: 'jane@example.com' };
    scrubDeep(input);
    assert.equal(input.email, 'jane@example.com');
  });
});
