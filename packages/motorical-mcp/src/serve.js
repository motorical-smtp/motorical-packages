#!/usr/bin/env node
/**
 * HTTP entrypoint for the motorical-mcp-server systemd unit.
 * Binds loopback only; Nginx terminates TLS in front.
 */

import fs from 'node:fs';
import { createHttpApp } from './http.js';
import { createVerifier } from './resourceAuth.js';
import { createDelegatedClient, createUnauthenticatedClient } from './delegatedClient.js';

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

  const app = createHttpApp({
    verifier,
    signer,
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
