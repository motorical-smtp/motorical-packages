// packages/motorical-mcp/test/revision.test.js
//
// Getting this wrong breaks every @motorical/mcp install in the field. The
// asymmetry that decides the default: a NATIVE client mis-routed to legacy
// still works (it degrades); a LEGACY client mis-routed to native breaks.
// Therefore anything ambiguous is legacy.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectRevision } from '../src/native/revision.js';

const CAPS = 'io.modelcontextprotocol/clientCapabilities';

describe('detectRevision', () => {
  test('server/discover is native', () => {
    assert.equal(detectRevision({ method: 'server/discover' }), 'native');
  });

  test('initialize is legacy even if it somehow carries _meta capabilities', () => {
    assert.equal(detectRevision({ method: 'initialize', params: { _meta: { [CAPS]: {} } } }), 'legacy');
  });

  test('a tools/call carrying per-request client capabilities is native', () => {
    assert.equal(detectRevision({ method: 'tools/call', params: { _meta: { [CAPS]: {} } } }), 'native');
  });

  test('a tools/call with no _meta is legacy', () => {
    assert.equal(detectRevision({ method: 'tools/call', params: { name: 'x' } }), 'legacy');
  });

  test('_meta present but without the capabilities key is legacy', () => {
    assert.equal(detectRevision({ method: 'tools/list', params: { _meta: { progressToken: 1 } } }), 'legacy');
  });

  test('garbage inputs are legacy, never a throw', () => {
    for (const bad of [null, undefined, {}, [], 'x', 42, { params: null }, { method: null }]) {
      assert.equal(detectRevision(bad), 'legacy', `${JSON.stringify(bad)} should be legacy`);
    }
  });

  test('a JSON-RPC batch is legacy — the native path takes single requests only', () => {
    assert.equal(detectRevision([{ method: 'server/discover' }]), 'legacy');
  });

  test('throwing method getter does not throw, returns legacy', () => {
    const body = {};
    Object.defineProperty(body, 'method', { get() { throw new Error('boom'); } });
    assert.equal(detectRevision(body), 'legacy');
  });

  test('throwing params getter does not throw, returns legacy', () => {
    const body = { method: 'tools/call' };
    Object.defineProperty(body, 'params', { get() { throw new Error('boom'); } });
    assert.equal(detectRevision(body), 'legacy');
  });

  test('throwing _meta getter does not throw, returns legacy', () => {
    const body = { params: {} };
    Object.defineProperty(body.params, '_meta', { get() { throw new Error('boom'); } });
    assert.equal(detectRevision(body), 'legacy');
  });

  test('capabilities value null returns legacy', () => {
    assert.equal(detectRevision({ params: { _meta: { [CAPS]: null } } }), 'legacy');
  });

  test('capabilities value false returns legacy', () => {
    assert.equal(detectRevision({ params: { _meta: { [CAPS]: false } } }), 'legacy');
  });

  test('capabilities value 0 returns legacy', () => {
    assert.equal(detectRevision({ params: { _meta: { [CAPS]: 0 } } }), 'legacy');
  });

  test('capabilities value empty string returns legacy', () => {
    assert.equal(detectRevision({ params: { _meta: { [CAPS]: '' } } }), 'legacy');
  });

  test('capabilities value as an ARRAY returns legacy, not native', () => {
    // typeof [] === 'object', so a bare object check passed an array by
    // accident -- and native is the breaking direction. No conformant client
    // encodes clientCapabilities as an array; the tie-break must still be
    // legacy when one does.
    assert.equal(detectRevision({ params: { _meta: { [CAPS]: [] } } }), 'legacy');
    assert.equal(detectRevision({ params: { _meta: { [CAPS]: ['tools'] } } }), 'legacy');
  });

  test('capabilities value empty object returns native (spec example)', () => {
    assert.equal(detectRevision({ params: { _meta: { [CAPS]: {} } } }), 'native');
  });

  test('capabilities value non-empty object returns native', () => {
    assert.equal(detectRevision({ params: { _meta: { [CAPS]: { foo: 'bar' } } } }), 'native');
  });
});
