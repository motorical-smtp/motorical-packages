/**
 * OAuth 2.1 + PKCE login for the Motorical MCP server.
 *
 * Replaces pasted mk_live_/ak_live_ keys: the user authorizes once in a
 * browser and the resulting grant is stored locally and refreshed silently.
 * The client is public (no secret), so PKCE S256 and refresh rotation are
 * mandatory rather than optional.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const DEFAULT_ISSUER = 'https://motorical.com';
export const DEFAULT_RESOURCE = 'https://api.motorical.com';
export const CLIENT_ID = 'https://motorical.com/.well-known/motorical-mcp-client.json';

const CREDENTIALS_DIR = path.join(os.homedir(), '.motorical');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'mcp-credentials.json');

/** Tokens are user credentials: owner-only, never world-readable. */
export function saveCredentials(creds, file = CREDENTIALS_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(creds, null, 2), { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* best effort on odd filesystems */ }
  return file;
}

export function loadCredentials(file = CREDENTIALS_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function clearCredentials(file = CREDENTIALS_FILE) {
  try { fs.unlinkSync(file); return true; } catch { return false; }
}

export function credentialsPath() { return CREDENTIALS_FILE; }

export function generatePkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/** RFC 8414 discovery, so endpoints are never hardcoded past the issuer. */
export async function discover(issuer = DEFAULT_ISSUER, fetchImpl = fetch) {
  const res = await fetchImpl(`${issuer}/.well-known/oauth-authorization-server`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Discovery failed: HTTP ${res.status}`);
  const meta = await res.json();
  if (meta.issuer !== issuer) {
    throw new Error(`Issuer mismatch: document says ${meta.issuer}, expected ${issuer}`);
  }
  // A client MUST refuse to continue without PKCE S256 support.
  if (!Array.isArray(meta.code_challenge_methods_supported)
      || !meta.code_challenge_methods_supported.includes('S256')) {
    throw new Error('Authorization server does not advertise PKCE S256 — refusing to continue');
  }
  return meta;
}

export function buildAuthorizeUrl(meta, { redirectUri, challenge, state, scopes, resource }) {
  const u = new URL(meta.authorization_endpoint);
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', scopes.join(' '));
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('resource', resource);
  return u.toString();
}

/**
 * RFC 9207: the callback carries `iss`. Comparing it to the issuer we
 * discovered is what stops a mix-up attack, where a malicious AS relays the
 * user to a different one and harvests the code.
 */
export function validateCallback({ params, expectedState, expectedIssuer }) {
  if (params.get('error')) {
    throw new Error(params.get('error_description') || params.get('error'));
  }
  if (params.get('state') !== expectedState) {
    throw new Error('State mismatch — discarding this callback');
  }
  const iss = params.get('iss');
  if (iss && iss !== expectedIssuer) {
    throw new Error(`Issuer mismatch in callback: ${iss}`);
  }
  const code = params.get('code');
  if (!code) throw new Error('Authorization callback carried no code');
  return code;
}

export async function exchangeCode(meta, { code, verifier, redirectUri, resource }, fetchImpl = fetch) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    resource,
  });
  const res = await fetchImpl(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Token exchange failed: HTTP ${res.status}`);
  return data;
}

export async function refreshTokens(meta, { refreshToken }, fetchImpl = fetch) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
  const res = await fetchImpl(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Refresh failed: HTTP ${res.status}`);
  return data;
}

/** Shape stored on disk; `expiresAt` is absolute so a stale clock is obvious. */
export function toStoredCredentials(tokenResponse, { issuer, resource }) {
  return {
    version: 1,
    issuer,
    resource,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token || null,
    scope: tokenResponse.scope || '',
    expiresAt: Date.now() + (Number(tokenResponse.expires_in || 3600) * 1000),
    obtainedAt: Date.now(),
  };
}

/** 60s skew so a token is never used in the instant before it expires. */
export function isExpired(creds, now = Date.now()) {
  if (!creds?.expiresAt) return true;
  return now >= (creds.expiresAt - 60_000);
}

/**
 * Starts the loopback listener and returns the chosen port immediately, since
 * the port has to go into the authorize URL before any code can arrive.
 */
export function startCallbackServer({ expectedState, expectedIssuer, timeoutMs = 300_000 }) {
  return new Promise((resolveStart, rejectStart) => {
    let settle;
    const waitForCode = new Promise((resolve, reject) => { settle = { resolve, reject }; });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') { res.writeHead(404).end('Not found'); return; }
      try {
        const code = validateCallback({ params: url.searchParams, expectedState, expectedIssuer });
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(page(
          'Motorical is connected',
          'You can close this tab and return to your terminal.'
        ));
        finish(); settle.resolve(code);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(page(
          'Authorization failed', escapeHtml(err.message)
        ));
        finish(); settle.reject(err);
      }
    });

    const timer = setTimeout(() => {
      finish();
      settle.reject(new Error('Timed out waiting for the browser callback'));
    }, timeoutMs);

    function finish() {
      clearTimeout(timer);
      setImmediate(() => server.close(() => {}));
    }

    server.on('error', (err) => { clearTimeout(timer); rejectStart(err); });
    // Port 0 = whatever the OS gives us; the AS matches loopback ignoring port.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveStart({
        port,
        redirectUri: `http://127.0.0.1:${port}/callback`,
        waitForCode,
        close: finish,
      });
    });
  });
}

function page(title, body) {
  return `<html><body style="font-family:system-ui;padding:3rem;text-align:center"><h2>${title}</h2><p>${body}</p></body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
