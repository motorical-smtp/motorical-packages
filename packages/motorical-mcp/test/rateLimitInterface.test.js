import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MotoricalClient } from '../src/client.js';

// Regression context: the original 429 catch RETURNED a plain object instead
// of throwing. motorical_send_email's outputSchema requires success:boolean,
// and dispatch.js's tools/call success path hardcodes isError:false and
// always runs validateOutput() against a returned result -- a returned
// object with no `success` field fails validation and the whole payload
// (reason, retryAfterSeconds) was silently discarded in favor of a generic
// validation error, on BOTH the native and legacy (server.js) protocol
// paths. The fix is to throw instead: dispatch.js's catch path sets
// isError:true and deliberately skips output-schema validation, so
// err.data -- the parsed backend body, which already carries reason and
// retryAfterSeconds -- reaches the caller intact. See test/dispatch.test.js
// for the end-to-end regression test that proves this through the real
// dispatcher, not just the client method in isolation.
describe('sendEmail 429 structured interface', () => {
  test('a 429 response THROWS (not returns), carrying reason/retryAfterSeconds and a nextAction', async () => {
    const client = new MotoricalClient({ apiBaseUrl: 'https://api.test', mkApiKey: 'mk_test' });
    client.request = async () => {
      const err = new Error('POST /v1/send → 429: Rate limit exceeded');
      err.status = 429;
      err.data = { success: false, error: 'rate_limited_account', reason: 'acct_daily', retryAfterSeconds: 3600 };
      throw err;
    };

    await assert.rejects(
      () => client.sendEmail({ from: 'sender@example.com', to: 'a@example.com', subject: 'hi', text: 'hi', dryRun: false, confirmRealSend: true }),
      (err) => {
        assert.equal(err.status, 429);
        assert.equal(err.data.reason, 'acct_daily');
        assert.equal(err.data.retryAfterSeconds, 3600);
        assert.deepEqual(err.data.nextAction, { tool: 'motorical_get_account_rate_limits', args: {} });
        return true;
      }
    );
  });

  test('a non-429 error still throws, unaffected by the 429 handling', async () => {
    const client = new MotoricalClient({ apiBaseUrl: 'https://api.test', mkApiKey: 'mk_test' });
    client.request = async () => {
      const err = new Error('POST /v1/send → 500: internal error');
      err.status = 500;
      throw err;
    };
    await assert.rejects(
      () => client.sendEmail({ from: 'sender@example.com', to: 'a@example.com', subject: 'hi', text: 'hi', dryRun: false, confirmRealSend: true }),
      /500/
    );
  });
});
