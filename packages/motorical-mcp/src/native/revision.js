// packages/motorical-mcp/src/native/revision.js
//
// The ONE place the legacy/native fork is decided.
//
// Tie-break is legacy, always. A native client mis-routed to the legacy path
// still works -- it degrades to 2025-11-25. A legacy client mis-routed to the
// native path breaks outright. That asymmetry, not elegance, sets the default.
export const NATIVE_VERSION = '2026-07-28';

const CLIENT_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';

export function detectRevision(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'legacy';

  // Guard all property reads against throwing getters. Contract: never throw.
  let method;
  try {
    method = body.method;
  } catch {
    return 'legacy';
  }

  // The handshake methods exist only in the pre-2026-07-28 protocol. Their
  // presence is decisive regardless of anything else in the body.
  if (method === 'initialize' || method === 'notifications/initialized') return 'legacy';

  if (method === 'server/discover') return 'native';

  let params;
  try {
    params = body.params;
  } catch {
    return 'legacy';
  }

  let meta = null;
  if (params && typeof params === 'object') {
    try {
      meta = params._meta;
    } catch {
      return 'legacy';
    }
  }

  // Capabilities must be a non-null, non-array object. null, false, 0, '' are
  // falsy and not evidence of a native client; an ARRAY is truthy and passes a
  // bare `typeof === 'object'` by accident, and native is the breaking
  // direction. The spec's own server/discover example sends {}, which must
  // match and return 'native'.
  if (meta && typeof meta === 'object') {
    let capabilities;
    try {
      capabilities = meta[CLIENT_CAPABILITIES];
    } catch {
      return 'legacy';
    }
    if (typeof capabilities === 'object' && capabilities !== null && !Array.isArray(capabilities)) {
      return 'native';
    }
  }

  return 'legacy';
}
