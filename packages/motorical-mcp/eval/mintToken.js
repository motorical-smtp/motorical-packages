// packages/motorical-mcp/eval/mintToken.js
//
// The hosted MCP server is OAuth-only and the AS supports authorization_code +
// refresh_token ONLY (no client_credentials -- see backend/src/routes/oauth.js
// grant_types_supported, confirmed live via GET /.well-known/oauth-authorization-server).
// A repeatable eval harness therefore has to drive the interactive flow head-lessly.
//
// TEST ACCOUNTS ONLY. This scripts a user consent flow; pointing it at a real
// customer account would be manufacturing consent on their behalf.
//
// Endpoint note (verified live 2026-09-03 against motorical.com, see
// task-5-report.md): the consent step is NOT `POST /api/oauth2/authorize`.
// That path is a GET-only browser redirect into the frontend consent UI. The
// programmatic equivalent is `POST /api/oauth2/authorize/decision`, which is
// `authenticateToken`-protected (reads identity from the Bearer dashboard JWT,
// never from the request body) and returns a JSON envelope
// `{ success, data: { redirectTo } }` -- there is no redirect Location header
// to read, the authorization code is embedded in `data.redirectTo` instead.
import crypto from 'node:crypto';

const AS = 'https://motorical.com';
const CLIENT_ID = process.env.MCP_EVAL_CLIENT_ID;
const REDIRECT_URI = 'http://127.0.0.1/callback'; // verbatim from the CIMD document; no port (OAuth 2.1 §7.5.1 loopback comparison ignores it)

const b64url = (b) => b.toString('base64url');

export async function mintToken({ email, password, audience, scopes }) {
  if (!CLIENT_ID) throw new Error('MCP_EVAL_CLIENT_ID must be set');

  // 1. Dashboard session for the eval account.
  const login = await fetch(`${AS}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const loginBody = await login.json();
  const jwt = loginBody?.token;
  // A 200 with no `token` is the MFA case: /api/auth/login answers a
  // second-factor challenge (requiresMfa / mfaRequired / a challenge id)
  // instead of a session JWT. Without this guard the flow carried on and sent
  // `Authorization: Bearer undefined` to authorize/decision, surfacing three
  // steps later as an opaque 401 with nothing pointing at the real cause.
  // This harness cannot complete a second factor -- the eval account must
  // have MFA disabled.
  if (typeof jwt !== 'string' || jwt.length === 0) {
    throw new Error(
      'login succeeded but returned no session token. The most likely cause is MFA/2FA '
      + 'enabled on the eval account -- this head-less flow cannot complete a second '
      + `factor, so MFA must be disabled on EVAL_EMAIL. Response keys: ${
        Object.keys(loginBody ?? {}).join(', ') || '(none)'}`
    );
  }

  // 2. PKCE.
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  // 3. Consent decision. `resource` is the RFC 8707 audience binding -- without
  //    it the token is rejected by every scoped server, which is the whole
  //    point of the audience split. The decision endpoint trusts the Bearer
  //    dashboard JWT for identity, not any body field.
  const decisionRes = await fetch(`${AS}/api/oauth2/authorize/decision`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      resource: audience,
      scope: scopes.join(' '),
      state,
      action: 'approve',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }),
  });
  if (!decisionRes.ok) {
    throw new Error(`authorize/decision failed: ${decisionRes.status} ${await decisionRes.text()}`);
  }
  const decisionBody = await decisionRes.json();
  const redirectTo = decisionBody?.data?.redirectTo;
  if (!redirectTo) throw new Error(`authorize/decision returned no redirectTo: ${JSON.stringify(decisionBody)}`);
  const code = new URL(redirectTo).searchParams.get('code');
  if (!code) throw new Error(`no code in redirectTo: ${redirectTo}`);

  // 4. Exchange.
  const tokenRes = await fetch(`${AS}/api/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      resource: audience,
    }),
  });
  if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  const tokenBody = await tokenRes.json();
  const { access_token: accessToken } = tokenBody ?? {};
  // Same failure mode one step later: a 200 whose body carries an `error`
  // rather than an `access_token`. Returning undefined here writes
  // `Authorization: Bearer undefined` into the child's mcp.json and the
  // scenario dies against the MCP server with an unexplained 401.
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error(
      `token exchange returned 200 with no access_token: ${JSON.stringify(tokenBody)}`
    );
  }
  return accessToken;
}
