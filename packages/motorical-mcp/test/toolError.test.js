import test from 'node:test';
import assert from 'node:assert/strict';
import { toolErrorPayload, plainMessage } from '../src/toolError.js';

test('a 404 drops the raw route and carries NOT_FOUND', () => {
  const err = Object.assign(new Error('GET /api/public/v1/messages/abc → 404: Message not found'), { status: 404 });
  const p = toolErrorPayload(err);
  assert.equal(p.code, 'NOT_FOUND');
  assert.equal(p.error, 'Message not found');
  assert.doesNotMatch(p.error, /\/api\/|GET/);
  assert.equal(p.status, 404);
});

test('statuses map to stable codes', () => {
  for (const [status, code] of [[400, 'VALIDATION_FAILED'], [401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [409, 'CONFLICT'], [429, 'RATE_LIMITED'], [502, 'UPSTREAM_ERROR']]) {
    assert.equal(toolErrorPayload(Object.assign(new Error('x'), { status })).code, code);
  }
});

test('an upstream data.code wins over the status mapping and keeps its spelling', () => {
  const err = Object.assign(new Error('POST /x → 402: nope'), { status: 402, data: { code: 'subscription_required' } });
  assert.equal(toolErrorPayload(err).code, 'subscription_required');
});

test('the several-blocks ambiguity carries candidate ids with names', () => {
  const err = Object.assign(new Error('motorBlockId is required: this authorization covers multiple Motor Blocks. Pass one of: a (A)'), {
    code: 'MOTOR_BLOCK_REQUIRED', candidates: [{ id: 'a', name: 'A' }, { id: 'b', name: null }],
  });
  const p = toolErrorPayload(err);
  assert.equal(p.code, 'MOTOR_BLOCK_REQUIRED');
  assert.deepEqual(p.candidates, [{ id: 'a', name: 'A' }, { id: 'b', name: null }]);
});

test('a message without a route prefix is left as is, an empty one gets a fallback', () => {
  assert.equal(plainMessage('motorBlockId is required'), 'motorBlockId is required');
  assert.equal(plainMessage(''), 'Request failed');
  assert.equal(toolErrorPayload(new Error('boom')).code, 'TOOL_ERROR');
});

test('every code carries a recovery hint; an upstream hint wins', () => {
  for (const status of [400, 401, 402, 403, 404, 409, 429, 502]) {
    assert.ok(toolErrorPayload(Object.assign(new Error('x'), { status })).hint, `status ${status}`);
  }
  assert.ok(toolErrorPayload(new Error('motorBlockId is required: this authorization covers multiple Motor Blocks')).hint);
  assert.ok(toolErrorPayload(new Error('boom')).hint);
  const own = Object.assign(new Error('x'), { status: 404, data: { hint: 'use this id instead' } });
  assert.equal(toolErrorPayload(own).hint, 'use this id instead');
});

test('machine codes keep their exact lowercase spelling and carry their own hint', () => {
  const scope = Object.assign(new Error('Insufficient scope'), { status: 403, code: 'insufficient_scope' });
  const p = toolErrorPayload(scope);
  assert.equal(p.code, 'insufficient_scope');
  assert.match(p.hint, /Settings, API access/);
  const revoked = Object.assign(new Error('x'), { status: 401, data: { code: 'authorization_revoked' } });
  assert.equal(toolErrorPayload(revoked).code, 'authorization_revoked');
  assert.ok(toolErrorPayload(revoked).hint);
});
