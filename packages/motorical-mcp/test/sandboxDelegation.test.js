import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createDelegatedClient } from '../src/delegatedClient.js';
import { signRequestState } from '../src/native/requestState.js';

// mintDelegation (delegation.js) signs RS256, so the signer needs a real key
// -- not the literal `{}` the task brief's snippet used, which fails with
// "secretOrPrivateKey must have a value" before ever reaching the network.
// Matches the fixture pattern already used in delegatedClient.test.js.
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const signer = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'k1' };

test('sandboxProvision is callable through delegation, not thrown as unavailable', async () => {
  const client = createDelegatedClient({
    claims: { grantId: 'g1', userId: 'u1', motorBlockIds: [], scopes: ['manage:sandbox'] },
    server: { canonicalUri: 'https://mcp.motorical.com/v1/motorical_sandbox/mcp', tools: ['motorical_sandbox_provision'] },
    signer,
    apiBaseUrl: 'https://api.motorical.com',
  });
  let requested = null;
  global.fetch = async (url, opts) => {
    requested = { url, opts };
    return { ok: true, status: 201, text: async () => JSON.stringify({ success: true, data: { motorBlockId: 'mb-1' } }) };
  };
  const result = await client.sandboxProvision({ handle: 'agent-1' });
  assert.equal(result.data.motorBlockId, 'mb-1');
  assert.match(requested.url, /\/api\/public\/v1\/account\/sandbox\/provision$/);
  assert.match(requested.opts.headers.Authorization, /^Delegation /);
});

// Global Constraints §1 argues no new dispatch/MRTR machinery is needed for
// sandbox_convert's subscription gate: the existing, unmodified tools/call
// catch block in native/dispatch.js (the one that turns a thrown
// err.status/err.data/err.message into a well-formed isError result) already
// carries the backend's 403 subscription_required shape through end to end,
// once Task 6 (backend route) and Task 7 (delegatedClient.sandboxConvert)
// exist. This test drives the REAL dispatchNative over a REAL delegated
// client -- only global.fetch is stubbed, at the network boundary -- so it
// fails if any link in that chain (client.js's err.status/err.data
// attachment, delegatedClient's delegation wrapping, or dispatch.js's catch
// block) stops carrying the shape through, not just if the test itself is
// missing.
test('sandbox_convert surfaces subscription_required with err.data intact through native dispatch', async () => {
  const { dispatchNative } = await import('../src/native/dispatch.js');

  const server = {
    key: 'sandbox',
    canonicalUri: 'https://mcp.motorical.com/v1/motorical_sandbox/mcp',
    tools: ['motorical_sandbox_convert'],
  };
  const client = createDelegatedClient({
    claims: { grantId: 'g1', userId: 'u1', motorBlockIds: [], scopes: ['manage:sandbox'] },
    server,
    signer,
    apiBaseUrl: 'https://api.motorical.com',
  });

  // The exact 403 body Task 6's route produces (backend/tests/
  // accountSandboxRoutes.test.js's "propagates a subscription_required 403
  // with upgradeUrl untouched" case) -- reproduced here rather than imported
  // so this test still pins the wire shape if that fixture ever changes.
  const upstreamBody = {
    success: false,
    error: 'Active Motorical subscription required to convert sandbox to production',
    code: 'subscription_required',
    requiresUpgrade: true,
    upgradeUrl: 'https://motorical.com/billing',
  };
  global.fetch = async () => ({
    ok: false,
    status: 403,
    statusText: 'Forbidden',
    text: async () => JSON.stringify(upstreamBody),
  });

  const args = { domainId: '11111111-1111-1111-1111-111111111111' };
  const response = await dispatchNative({
    jsonrpc: '2.0',
    id: 42,
    method: 'tools/call',
    params: {
      name: 'motorical_sandbox_convert',
      arguments: args,
      inputResponses: { confirm: { action: 'accept', content: {} } },
      requestState: signRequestState({ tool: 'motorical_sandbox_convert', args }),
    },
  }, { server, client, version: '1.0.0' });

  assert.equal(response.result.resultType, 'complete');
  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.status, 403);
  assert.match(response.result.structuredContent.error, /subscription required/);
  assert.deepEqual(response.result.structuredContent.details, upstreamBody);
  assert.equal(response.result.structuredContent.details.code, 'subscription_required');
  assert.equal(response.result.structuredContent.details.requiresUpgrade, true);
  assert.equal(response.result.structuredContent.details.upgradeUrl, 'https://motorical.com/billing');
});
