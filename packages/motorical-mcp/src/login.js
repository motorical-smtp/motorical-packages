/**
 * `motorical-mcp login` — interactive OAuth 2.1 authorization.
 * Everything it prints goes to stderr so it never corrupts an stdio MCP stream.
 */

import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  DEFAULT_ISSUER, DEFAULT_RESOURCE,
  discover, generatePkce, buildAuthorizeUrl, startCallbackServer,
  exchangeCode, toStoredCredentials, saveCredentials, clearCredentials,
  credentialsPath, loadCredentials,
} from './oauth.js';

const DEFAULT_SCOPES = ['send:transactional', 'read:analytics'];

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

export function logout({ log = (m) => console.error(m) } = {}) {
  const removed = clearCredentials();
  log(removed
    ? `Removed ${credentialsPath()}. Revoke the grant itself in Settings → API Access.`
    : 'No stored credentials to remove.');
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
