#!/usr/bin/env node
/**
 * HTTP entrypoint for the motorical-mcp-server systemd unit.
 * Binds loopback only; Nginx terminates TLS in front.
 */

import fs from 'node:fs';
import { createHttpApp } from './http.js';
import { createVerifier } from './resourceAuth.js';
import { createDelegatedClient, createUnauthenticatedClient } from './delegatedClient.js';
import { mintDelegation } from './delegation.js';

const DEFAULT_PORT = 3012;
const HOST = '127.0.0.1';

function loadSigner(env) {
  const file = env.MCP_JWT_PRIVATE_KEY_FILE || '/etc/motorical/jwt_private.pem';
  if (!fs.existsSync(file)) return null;
  let key;
  try {
    key = fs.readFileSync(file, 'utf8');
  } catch (err) {
    // The file exists but reading it failed — almost always EACCES under the
    // unit's own user on a first deploy. A raw stack trace here just says
    // "EACCES" with no indication *what* needs a permission fix; say it plainly.
    throw new Error(
      `MCP server needs a signing key: ${file} exists but could not be read `
      + `(${err.code || err.message}). Check the file's permissions for the service user.`
    );
  }
  return { key, kid: env.MCP_JWT_KID || 'motorical-key-1' };
}

/** The loopback JWKS document is served by the backend on this same host, so
 * cold-cache token verification never depends on DNS/Cloudflare for a
 * document that lives right next to this process. Overridable for anything
 * that legitimately needs a different authorization server. */
export function defaultJwksUrl(env = process.env) {
  return env.MCP_JWKS_URL || 'http://127.0.0.1:3001/.well-known/jwks.json';
}

export function buildServer(env = process.env, overrides = {}) {
  const signer = overrides.signer !== undefined ? overrides.signer : loadSigner(env);
  if (!signer) {
    // Fail at start-up, loudly. Starting without it produces a server that
    // authenticates clients fine and then cannot make a single upstream call.
    throw new Error('MCP server needs a signing key (/etc/motorical/jwt_private.pem)');
  }

  const apiBaseUrl = env.MOTORICAL_API_BASE_URL || 'http://127.0.0.1:3001';
  const verifier = overrides.verifier || createVerifier({
    jwksUrl: defaultJwksUrl(env),
  });

  // ONE backend call per request answers both questions a tools/list asks about the grant: its CURRENT scopes (is the
  // token narrower than the grant?) and whether the account is past the sandbox phase (should the sandbox tools be
  // listed?). The phase is computed by the backend only while this process has no fresh answer for the grant (it costs
  // a few queries); a warm cache sends the plain scope lookup. Short timeout: it must never make a listing or a
  // refusal slow, and any failure answers null so callers keep today's behaviour.
  const PHASE_TTL_MS = Number(env.MCP_PHASE_CACHE_MS || 60000);
  const phaseCache = new Map();
  // A request's lookups share one in-flight fetch. Keyed by the claims object, and reused only for a moment, so a
  // verifier that hands back the same object across requests can never serve stale scopes.
  const grantFetches = new WeakMap();
  const SHARE_MS = 2000;

  function fetchGrantState({ claims, server }) {
    const shared = grantFetches.get(claims);
    if (shared && Date.now() - shared.at < SHARE_MS) return shared.promise;

    const hit = phaseCache.get(claims.grantId);
    const phaseKnown = !!(hit && hit.until > Date.now());
    const assertion = mintDelegation({
      grantId: claims.grantId, userId: claims.userId, motorBlockId: undefined,
      scopes: claims.scopes, canonicalUri: server.canonicalUri,
    }, signer);
    const promise = (async () => {
      const res = await fetch(`${apiBaseUrl}/api/public/v1/account/grant${phaseKnown ? '' : '?include=phase'}`, {
        headers: { Authorization: `Delegation ${assertion}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return null;
      const body = await res.json();
      const data = body && body.data;
      if (!data) return null;
      let over = phaseKnown ? hit.over : null;
      if (!phaseKnown && typeof data.sandboxOver === 'boolean') {
        over = data.sandboxOver;
        if (phaseCache.size > 5000) phaseCache.clear();
        phaseCache.set(claims.grantId, { over, until: Date.now() + PHASE_TTL_MS });
      }
      return { scopes: data.scopes, sandboxOver: over };
    })();
    grantFetches.set(claims, { promise, at: Date.now() });
    return promise;
  }

  async function grantScopesLookup(args) {
    const state = await fetchGrantState(args);
    return state ? state.scopes : null;
  }

  async function accountPhaseLookup(args) {
    const state = await fetchGrantState(args);
    return state && typeof state.sandboxOver === 'boolean' ? state.sandboxOver : null;
  }

  const app = createHttpApp({
    verifier,
    signer,
    grantScopesLookup,
    accountPhaseLookup,
    // The public `signup` server never verified a bearer (authenticateMcp's
    // own `srv.public` branch), so `claims` is null here -- routing it into
    // createDelegatedClient would crash on `claims.motorBlockIds`. Branch on
    // the same `server.public` flag authenticateMcp already branched on, so
    // the two checks can never drift into disagreeing about which server is
    // the exception.
    clientFactory: ({ claims, server }) => (
      server.public
        ? createUnauthenticatedClient({ apiBaseUrl })
        : createDelegatedClient({ claims, server, signer, apiBaseUrl })
    ),
  });

  return { app, port: Number(env.MCP_PORT || DEFAULT_PORT), host: HOST, signer };
}

const isMain = process.argv[1] && process.argv[1].endsWith('serve.js');
if (isMain) {
  const { app, port, host } = buildServer();
  app.listen(port, host, () => console.error(`[motorical-mcp-server] listening on ${host}:${port}`));
}
