// One error envelope for every tool failure, on both the legacy and the native path.
//
// Before: { error: "GET /api/public/v1/messages/abc -> 404: Not found", status, details }. The raw route leaked, there was
// no stable code to branch on, and an ambiguity listed nothing to choose from. Communications errors already carried a
// code; this gives the Motorical tools the same shape. Backward compatible: `error`, `status` and `details` stay.

const ROUTE_PREFIX = /^(?:GET|POST|PUT|PATCH|DELETE)\s+\S+\s+(?:→|->)\s+\d{3}:\s*/;

// The codes this layer assigns or hints, as one table. `status` marks the code a bare HTTP status maps to; a code without
// one is assigned from the message or passed through from upstream. Each carries a recovery hint: agents cannot read backend
// logs, so every failure names the next move (machine-readable-docs.md, "Agent-reachable errors"). An upstream `hint` wins.
// Written as `{ code: 'X' }` literals on purpose: the docs truth gate counts a documented code as real only in that form.
const CODES = [
  { code: 'MOTOR_BLOCK_REQUIRED', hint: 'Call again with motorBlockId set to one of the candidates.' },
  { code: 'NO_MOTOR_BLOCKS', hint: 'Ask the person to reconnect the connector and approve access to their Motor Blocks.' },
  { code: 'NOT_AVAILABLE_OVER_OAUTH', hint: 'This action is only available in the Motorical dashboard; ask the person to do it there.' },
  { code: 'VALIDATION_FAILED', status: 400, hint: 'Fix the field named in the message or details and call again.' },
  { code: 'UNAUTHENTICATED', status: 401, hint: 'The connection is no longer signed in; ask the person to reconnect the connector.' },
  { code: 'PLAN_REQUIRED', status: 402, hint: 'Only the person can change plan; read the live plans from GET https://motorical.com/api/billing/plans.' },
  { code: 'FORBIDDEN', status: 403, hint: 'Call motorical_whoami to see the permissions this connection holds; the person can add the missing one in the Motorical dashboard under Settings, API access.' },
  { code: 'NOT_FOUND', status: 404, hint: 'Check the id with a list tool (it may belong to another Motor Block or account) and try again.' },
  { code: 'CONFLICT', status: 409, hint: 'Re-read the current state with a get or list tool before retrying.' },
  { code: 'RATE_LIMITED', status: 429, hint: 'Wait for retryAfterSeconds if given, or call motorical_get_account_rate_limits, then retry.' },
  { code: 'UPSTREAM_ERROR', hint: 'Retry once after a short wait; if it keeps failing, tell the person Motorical is having trouble.' },
  { code: 'TOOL_ERROR', hint: 'Read the message, correct the call if it names a problem, otherwise tell the person.' },
  // Codes assigned by the authentication layer keep their exact lowercase spelling; only their hints live here.
  { code: 'insufficient_scope', hint: 'Call motorical_whoami to see what this connection holds; the person can add the missing permission in the Motorical dashboard under Settings, API access, then start a new chat or reconnect the connector.' },
  { code: 'missing_scope', hint: 'Call motorical_whoami to see what this connection holds; the person can add the missing permission in the Motorical dashboard under Settings, API access, then start a new chat or reconnect the connector.' },
  { code: 'authorization_revoked', hint: 'The person revoked this connection; ask them to reconnect the connector.' },
];

const BY_STATUS = Object.fromEntries(CODES.filter((c) => c.status).map((c) => [c.status, c.code]));
// 422 is a validation failure too.
BY_STATUS[422] = 'VALIDATION_FAILED';
const HINTS = Object.fromEntries(CODES.map((c) => [c.code, c.hint]));

/** Strip "METHOD /route → 404:" so the model reads the reason, not our URL layout. */
export function plainMessage(message) {
  return String(message ?? '').replace(ROUTE_PREFIX, '').trim() || 'Request failed';
}

export function errorCodeFor(err) {
  // A code that something upstream already assigned keeps its exact spelling: the documented machine codes are lowercase
  // (insufficient_scope, authorization_revoked, subscription_required) and an agent branches on string equality.
  if (err && typeof err.code === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(err.code)) return err.code;
  const upstream = err && err.data && err.data.code;
  if (typeof upstream === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(upstream)) return upstream;
  if (/motorBlockId is required/i.test(err?.message || '')) return 'MOTOR_BLOCK_REQUIRED';
  if (/covers no Motor Blocks/i.test(err?.message || '')) return 'NO_MOTOR_BLOCKS';
  if (/not available over an OAuth/i.test(err?.message || '')) return 'NOT_AVAILABLE_OVER_OAUTH';
  const status = err && err.status;
  if (BY_STATUS[status]) return BY_STATUS[status];
  if (status >= 500) return 'UPSTREAM_ERROR';
  return 'TOOL_ERROR';
}

export function toolErrorPayload(err) {
  const payload = {
    code: errorCodeFor(err),
    error: plainMessage(err && err.message),
    status: (err && err.status) || null,
    details: (err && err.data) || null,
  };
  const hint = (err && err.data && typeof err.data.hint === 'string' && err.data.hint) || HINTS[payload.code];
  if (hint) payload.hint = hint;
  if (err && Array.isArray(err.candidates) && err.candidates.length) payload.candidates = err.candidates;
  return payload;
}
