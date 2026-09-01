/**
 * `motorical-mcp login` — interactive OAuth 2.1 authorization.
 * Everything it prints goes to stderr so it never corrupts an stdio MCP stream.
 */

import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  DEFAULT_ISSUER, DEFAULT_RESOURCE,
  discover, generatePkce, buildAuthorizeUrl, startCallbackServer,
  exchangeCode, toStoredCredentials, saveCredentials, clearCredentials, revokeToken,
  credentialsPath, loadCredentials,
} from './oauth.js';

const DEFAULT_SCOPES = ['send:transactional', 'read:analytics', 'manage:domains'];

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
    return true;
  } catch {
    return false;
  }
}

export async function login({
  issuer = process.env.MOTORICAL_ISSUER || DEFAULT_ISSUER,
  resource = process.env.MOTORICAL_RESOURCE || DEFAULT_RESOURCE,
  scopes = DEFAULT_SCOPES,
  open = true,
  log = (m) => console.error(m),
} = {}) {
  const meta = await discover(issuer);
  const { verifier, challenge } = generatePkce();
  const state = crypto.randomBytes(16).toString('base64url');

  const server = await startCallbackServer({ expectedState: state, expectedIssuer: issuer });
  const authorizeUrl = buildAuthorizeUrl(meta, {
    redirectUri: server.redirectUri, challenge, state, scopes, resource,
  });

  log('');
  log('Authorize Motorical in your browser:');
  log(`  ${authorizeUrl}`);
  log('');
  if (open && !openBrowser(authorizeUrl)) {
    log('(could not open a browser automatically — copy the link above)');
  }

  let code;
  try {
    code = await server.waitForCode;
  } catch (err) {
    server.close();
    throw err;
  }

  const tokens = await exchangeCode(meta, {
    code, verifier, redirectUri: server.redirectUri, resource,
  });
  const creds = toStoredCredentials(tokens, { issuer, resource });
  const file = saveCredentials(creds);

  log(`Connected. Credentials stored at ${file} (owner-only).`);
  log(`Scopes granted: ${creds.scope || scopes.join(' ')}`);
  return creds;
}

export async function logout({ log = (m) => console.error(m), revoke = true } = {}) {
  const creds = loadCredentials();
  if (!creds) { log('No stored credentials to remove.'); return false; }

  if (revoke) {
    try {
      const meta = await discover(creds.issuer);
      const ok = await revokeToken(meta, {
        token: creds.refreshToken || creds.accessToken,
        tokenTypeHint: creds.refreshToken ? 'refresh_token' : 'access_token',
      });
      log(ok
        ? 'Revoked the authorization on the server.'
        : 'Could not revoke on the server — revoke it in Settings → API Access.');
    } catch (err) {
      log(`Could not reach the server to revoke (${err.message}).`);
      log('The grant is still live — revoke it in Settings → API Access.');
    }
  }

  const removed = clearCredentials();
  log(removed ? `Removed ${credentialsPath()}.` : 'No local credentials file to remove.');
  return removed;
}

export function status({ log = (m) => console.error(m) } = {}) {
  const creds = loadCredentials();
  if (!creds) { log('Not connected. Run: motorical-mcp login'); return null; }
  log(`Connected to ${creds.issuer}`);
  log(`  resource: ${creds.resource}`);
  log(`  scopes:   ${creds.scope || '(unknown)'}`);
  log(`  expires:  ${new Date(creds.expiresAt).toISOString()}`);
  log(`  file:     ${credentialsPath()}`);
  return creds;
}
