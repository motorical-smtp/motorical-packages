// packages/motorical-mcp/src/resourceAuth.js
/**
 * Inbound token verification for the MCP resource server.
 *
 * The audience check is the whole point of the scoped-server split: each path
 * is its own canonical URI, so a token for one server is worthless at another.
 * Without this, the split would only shorten tool lists (see spec §B3.2).
 */

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { TOOL_SCOPES } from './servers.js';
import { expandMcpImplied } from '@motorical/scope-catalog';

const ISSUER = 'https://motorical.com';
const JWKS_TTL_MS = 10 * 60 * 1000;

export class McpAuthError extends Error {
  constructor(status, code, message, challenge) {
    super(message);
    this.status = status;
    this.code = code;
    this.challenge = challenge;
  }
}

/** RFC 9728: for a resource with a path, the well-known segment is inserted after the host. */
export function resourceMetadataUrl(canonicalUri) {
  const u = new URL(canonicalUri);
  return `${u.origin}/.well-known/oauth-protected-resource${u.pathname}`;
}

function bearerChallenge(canonicalUri, extra = {}) {
  const parts = [
    `resource_metadata="${resourceMetadataUrl(canonicalUri)}"`,
    ...Object.entries(extra).map(([k, v]) => `${k}="${v}"`),
  ];
  return `Bearer ${parts.join(', ')}`;
}

export function createVerifier({ jwksUrl, fetchImpl = fetch }) {
  let cache = null;
  let cachedAt = 0;

  async function keys() {
    if (cache && Date.now() - cachedAt < JWKS_TTL_MS) return cache;
    const res = await fetchImpl(jwksUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new McpAuthError(503, 'server_error', 'Cannot reach the authorization server');
    const doc = await res.json();
    cache = doc.keys || [];
    cachedAt = Date.now();
    return cache;
  }

  async function verify(token, canonicalUri) {
    if (!token) {
      throw new McpAuthError(401, 'unauthorized', 'Authorization required',
        bearerChallenge(canonicalUri));
    }

    const decoded = jwt.decode(token, { complete: true });
    const kid = decoded?.header?.kid;
    if (!kid) {
      throw new McpAuthError(401, 'invalid_token', 'Token has no key id',
        bearerChallenge(canonicalUri, { error: 'invalid_token' }));
    }

    const jwk = (await keys()).find((k) => k.kid === kid);
    if (!jwk) {
      throw new McpAuthError(401, 'invalid_token', 'Unknown signing key',
        bearerChallenge(canonicalUri, { error: 'invalid_token' }));
    }
    const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });

    let claims;
    try {
      // algorithms is pinned: without it a token signed with the public key as
      // an HMAC secret would verify. audience is the scoped-server URI.
      claims = jwt.verify(token, pub, {
        algorithms: ['RS256'],
        issuer: ISSUER,
        audience: canonicalUri,
      });
    } catch (_) {
      throw new McpAuthError(401, 'invalid_token', 'Token is not valid for this server',
        bearerChallenge(canonicalUri, { error: 'invalid_token' }));
    }

    if (claims.type !== 'access_token') {
      throw new McpAuthError(401, 'invalid_token', 'Wrong token type',
        bearerChallenge(canonicalUri, { error: 'invalid_token' }));
    }

    return {
      userId: claims.userId,
      grantId: claims.grantId,
      clientId: claims.clientId,
      scopes: Array.isArray(claims.scopes) ? claims.scopes : [],
      motorBlockIds: Array.isArray(claims.motorBlockIds) ? claims.motorBlockIds : [],
    };
  }

  return { verify };
}

/**
 * Which scopes a tool needs.
 *
 * A required scope is a property of the TOOL, not of the server the client
 * happens to be connected to — servers.js's TOOL_SCOPES is the single source
 * of truth (each server's advertised `scopes` is itself derived from that
 * same map, as the union of its tools' requirements). Deriving from the
 * connected server instead would make the main server (whose scope list is
 * that union) demand every scope for every tool, so a main-server grant
 * carrying only send:transactional could not send. The convenience path must
 * not be the strictest one.
 */
function scopesForTool(toolName) {
  return TOOL_SCOPES[toolName] || [];
}

export function assertToolAllowed(server, toolName, grantedScopes) {
  if (!server.tools.includes(toolName)) {
    throw new McpAuthError(403, 'tool_not_available',
      `${toolName} is not available on this server`,
      bearerChallenge(server.canonicalUri, { error: 'tool_not_available' }));
  }
  const required = scopesForTool(toolName);
  const expandedGrantedScopes = expandMcpImplied(grantedScopes);
  const missing = required.filter((s) => !expandedGrantedScopes.includes(s));
  if (missing.length > 0) {
    // One challenge carrying every missing scope — the client must not have to
    // discover them one failed call at a time.
    throw new McpAuthError(403, 'insufficient_scope',
      `Missing scope: ${missing.join(' ')}`,
      bearerChallenge(server.canonicalUri, {
        error: 'insufficient_scope',
        scope: missing.join(' '),
      }));
  }
}
