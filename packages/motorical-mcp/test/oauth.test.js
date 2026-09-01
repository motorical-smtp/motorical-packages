import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  generatePkce, validateCallback, isExpired, toStoredCredentials,
  buildAuthorizeUrl, discover, saveCredentials, loadCredentials, CLIENT_ID,
} from '../src/oauth.js';
import { MotoricalClient } from '../src/client.js';

const ISSUER = 'https://motorical.com';
const RESOURCE = 'https://api.motorical.com';

const META = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/api/oauth2/authorize`,
  token_endpoint: `${ISSUER}/api/oauth2/token`,
  code_challenge_methods_supported: ['S256'],
};

test('PKCE verifier and challenge are a valid S256 pair', () => {
  const { verifier, challenge } = generatePkce();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
  assert.equal(challenge, expected);
});

test('two logins never reuse a verifier', () => {
  assert.notEqual(generatePkce().verifier, generatePkce().verifier);
});

test('authorize URL carries every parameter the AS requires', () => {
  const url = new URL(buildAuthorizeUrl(META, {
    redirectUri: 'http://127.0.0.1:5555/callback',
    challenge: 'chal', state: 'st',
    scopes: ['send:transactional'], resource: RESOURCE,
  }));
  assert.equal(url.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('resource'), RESOURCE);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), 'st');
});

test('discovery refuses an AS that does not advertise PKCE S256', async () => {
  const fetchImpl = async () => ({
    ok: true, status: 200,
    json: async () => ({ ...META, code_challenge_methods_supported: ['plain'] }),
  });
  await assert.rejects(() => discover(ISSUER, fetchImpl), /PKCE S256/);
});

test('discovery refuses an issuer that does not match the document', async () => {
  const fetchImpl = async () => ({
    ok: true, status: 200, json: async () => ({ ...META, issuer: 'https://evil.example' }),
  });
  await assert.rejects(() => discover(ISSUER, fetchImpl), /Issuer mismatch/);
});

test('callback with a mismatched state is discarded (CSRF)', () => {
  const params = new URLSearchParams({ code: 'c', state: 'WRONG', iss: ISSUER });
  assert.throws(
    () => validateCallback({ params, expectedState: 'st', expectedIssuer: ISSUER }),
    /State mismatch/
  );
});

test('callback from a different issuer is discarded (RFC 9207 mix-up)', () => {
  const params = new URLSearchParams({ code: 'c', state: 'st', iss: 'https://evil.example' });
  assert.throws(
    () => validateCallback({ params, expectedState: 'st', expectedIssuer: ISSUER }),
    /Issuer mismatch/
  );
});

test('callback carrying an error surfaces it rather than proceeding', () => {
  const params = new URLSearchParams({ error: 'access_denied', error_description: 'User denied', state: 'st' });
  assert.throws(
    () => validateCallback({ params, expectedState: 'st', expectedIssuer: ISSUER }),
    /User denied/
  );
});

test('a good callback yields the code', () => {
  const params = new URLSearchParams({ code: 'the-code', state: 'st', iss: ISSUER });
  assert.equal(validateCallback({ params, expectedState: 'st', expectedIssuer: ISSUER }), 'the-code');
});

test('a token is treated as expired slightly before it actually expires', () => {
  const now = Date.now();
  assert.equal(isExpired({ expiresAt: now + 3_600_000 }, now), false);
  assert.equal(isExpired({ expiresAt: now + 30_000 }, now), true);  // inside the 60s skew
  assert.equal(isExpired({}, now), true);
});

test('stored credentials are owner-only on disk', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-cred-')), 'creds.json');
  saveCredentials(toStoredCredentials(
    { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: 'send:transactional' },
    { issuer: ISSUER, resource: RESOURCE }
  ), file);
  const mode = fs.statSync(file).mode & 0o777;
  assert.equal(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
  assert.equal(loadCredentials(file).accessToken, 'a');
});

test('an OAuth session sends with Bearer instead of demanding an mk_live_ key', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: 'https://api.motorical.com', docsBaseUrl: '', mkApiKey: '', akApiKey: '',
    bearerToken: '', motorBlockId: '', defaultFrom: 'noreply@example.com',
    oauthCredentials: {
      issuer: ISSUER, resource: RESOURCE, accessToken: 'mcp-access-token',
      refreshToken: 'r', scope: 'send:transactional', expiresAt: Date.now() + 3_600_000,
    },
  });

  let seen;
  client.request = async (method, p, opts) => { seen = { method, p, opts }; return { success: true }; };

  await client.sendEmail({ to: 'a@example.com', subject: 's', text: 't', dryRun: true });

  assert.equal(seen.p, '/v1/send');
  assert.equal(seen.opts.bearer, 'mcp-access-token');
  assert.equal(seen.opts.apiKey, undefined);
});

test('without an OAuth session, sending still asks for an mk key', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: '', docsBaseUrl: '', mkApiKey: '', akApiKey: '', bearerToken: '',
    motorBlockId: '', defaultFrom: 'noreply@example.com', oauthCredentials: null,
  });
  await assert.rejects(
    () => client.sendEmail({ to: 'a@example.com', subject: 's', text: 't' }),
    /motorical-mcp login/
  );
});

test('an OAuth session supersedes ak_live_ token minting for reads', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: '', docsBaseUrl: '', mkApiKey: '', akApiKey: 'ak_live_should_not_be_used',
    bearerToken: '', motorBlockId: 'mb-1', defaultFrom: '',
    oauthCredentials: {
      issuer: ISSUER, resource: RESOURCE, accessToken: 'mcp-access-token',
      refreshToken: 'r', scope: 'read:analytics', expiresAt: Date.now() + 3_600_000,
    },
  });
  client.request = async () => { throw new Error('must not mint a public token'); };
  assert.equal(await client.getBearer(), 'mcp-access-token');
});

test('an expired session with no refresh token tells the user to log in again', async () => {
  const client = new MotoricalClient({
    apiBaseUrl: '', docsBaseUrl: '', mkApiKey: '', akApiKey: '', bearerToken: '',
    motorBlockId: '', defaultFrom: '',
    oauthCredentials: {
      issuer: ISSUER, resource: RESOURCE, accessToken: 'stale',
      refreshToken: null, expiresAt: Date.now() - 1000,
    },
  });
  await assert.rejects(() => client.oauthAccessToken(), /motorical-mcp login/);
});
