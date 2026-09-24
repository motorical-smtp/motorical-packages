import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { dispatchNative } from '../src/native/dispatch.js';
import { SERVERS } from '../src/servers.js';

// Field report 2026-09-24 (first real create through a strict client): a
// successful motorical_motor_block_create came back to the client as
// "Structured content does not match the tool's output schema: data must NOT
// have additional properties" x3 — the block WAS created, the client rejected
// the success. The server validates with zod, which ignores unknown keys; the
// client validates the ADVERTISED JSON Schema, which forbade them. So this test
// validates realistic backend response bodies against the schema exactly as
// tools/list advertises it, the way a strict client does.
//
// Bodies are the real shapes: rename/list were observed live on 2026-09-24; the
// rest are the return values of backend/src/services/motorBlockManagement.js and
// the routes in backend/src/routes/public/accountMotorBlocks.js.
const motorBlocks = SERVERS.find((s) => s.key === 'motorBlocks');
const ID = '9cd108d3-5bdb-452b-a137-b269f1236cd1';
const DOMAIN = { id: '755b43f0-24d3-4b93-8989-df2b7eceb961', name: 'hatfree.site', verified: true, sendReady: true };

const BODIES = {
  motorical_motor_block_list: { success: true, data: [{
    id: ID, name: 'p8-live-test-1', type: 'transactional', active: true, domain: DOMAIN,
    activeAuthMethod: 'Password', credentialsAvailable: false, credentialsLocation: 'https://motorical.com/motor-blocks',
  }] },
  motorical_motor_block_create: { success: true, data: {
    motorBlockId: ID, name: 'p8-live-test-1', type: 'transactional', domain: DOMAIN,
    smtpUsername: 'p8livetest1_6cdd57ad', limits: { dailyVolume: 900, hourlyRate: 90 }, active: true,
    activeAuthMethod: 'Password', createdAt: '2026-09-24T17:48:00.000Z', credentialsAvailable: false,
    credentialsLocation: 'https://motorical.com/motor-blocks',
    credentialsNote: 'View or regenerate Motor Block credentials in the dashboard (login required).',
    authorizationUpdated: true,
    nextAction: { tool: 'motorical_send_email', args: { motorBlockId: ID, dryRun: true } },
  } },
  motorical_motor_block_rename: { success: true, data: {
    motorBlockId: ID, previousName: 'p8-live-test-1', name: 'p8-live-test-renamed',
    smtpUsername: 'p8livetest1_6cdd57ad', smtpUsernameChanged: false, changed: true, updatedAt: '2026-09-24T17:49:28.966Z',
  } },
  motorical_motor_block_change_type: { success: true, data: {
    motorBlockId: ID, previousType: 'transactional', type: 'general_purpose', changed: true, updatedAt: '2026-09-24T17:50:00.000Z',
  } },
  motorical_motor_block_assign_domain: { success: true, data: {
    motorBlockId: ID, previousDomain: { id: 'd-old', name: 'old.example' }, domain: { id: DOMAIN.id, name: DOMAIN.name, verified: true },
    active: true, changed: true, sendReady: true, updatedAt: '2026-09-24T17:51:00.000Z',
  } },
  motorical_motor_block_deactivate: { success: true, data: {
    motorBlockId: ID, active: false, changed: true, updatedAt: '2026-09-24T17:52:00.000Z',
    deletionMode: 'deactivated', recoverable: true,
    nextAction: { tool: 'motorical_motor_block_reactivate', args: { motorBlockId: ID } },
  } },
  motorical_motor_block_reactivate: { success: true, data: {
    motorBlockId: ID, active: true, changed: true, updatedAt: '2026-09-24T17:53:00.000Z',
  } },
  motorical_motor_block_delete: { success: true, data: {
    jobId: '5f1c2a3e-8b7d-4c6e-9a1b-0d2e3f4a5b6c', status: 'queued', motorBlockName: 'p8-live-test-renamed',
    createdAt: '2026-09-24T17:54:00.000Z',
    nextAction: { tool: 'motorical_motor_block_delete_status', args: { jobId: '5f1c2a3e-8b7d-4c6e-9a1b-0d2e3f4a5b6c' } },
  } },
  motorical_motor_block_delete_status: { success: true, data: {
    id: '5f1c2a3e-8b7d-4c6e-9a1b-0d2e3f4a5b6c', motorBlockId: ID, motorBlockName: 'p8-live-test-renamed',
    deleteHistory: false, status: 'done', report: { steps: ['purge_marker'] }, errorMessage: null,
    createdAt: '2026-09-24T17:54:00.000Z', updatedAt: '2026-09-24T17:54:05.000Z', completedAt: '2026-09-24T17:54:05.000Z',
  } },
};

describe('every Motor Block tool accepts its real backend response under the ADVERTISED schema', async () => {
  const listed = await dispatchNative(
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    { server: motorBlocks, client: {}, version: 'test' }
  );
  const schemas = Object.fromEntries(listed.result.tools.map((t) => [t.name, t.outputSchema]));
  const ajv = new Ajv({ strict: false, allErrors: true });

  for (const [name, body] of Object.entries(BODIES)) {
    test(name, () => {
      assert.ok(schemas[name], `${name} advertises an outputSchema`);
      const validate = ajv.compile(schemas[name]);
      const ok = validate(body);
      assert.equal(ok, true, `${name}: ${JSON.stringify(validate.errors)}`);
    });
  }

  test('every Motor Block tool is covered by a body above (a new tool must add one)', () => {
    assert.deepEqual(Object.keys(BODIES).sort(), motorBlocks.tools.slice().sort());
  });
});
