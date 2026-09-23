/**
 * Upstream authentication for the MCP server.
 *
 * Spec §C.3 forbids token passthrough: the inbound token is bound to this
 * server's audience, and forwarding it would make the backend accept a token
 * that was never issued for it. Instead the server signs a short-lived
 * assertion with the fleet S2S key. The backend re-checks the grant in the
 * database anyway, so this asserts identity, never authority.
 */

import jwt from 'jsonwebtoken';

export const DELEGATION_AUDIENCE = 'https://api.motorical.com/internal/mcp';
const TTL_SECONDS = 60;

export function mintDelegation({ grantId, userId, motorBlockId, scopes, canonicalUri }, signer) {
  return jwt.sign(
    {
      type: 'mcp_delegation',
      grantId,
      userId,
      motorBlockId,
      scopes,
      resource: canonicalUri,
    },
    signer.key,
    {
      algorithm: 'RS256',
      keyid: signer.kid,
      issuer: 'https://mcp.motorical.com',
      audience: DELEGATION_AUDIENCE,
      subject: String(userId),
      expiresIn: TTL_SECONDS,
    }
  );
}
