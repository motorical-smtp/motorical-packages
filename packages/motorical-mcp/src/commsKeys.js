/**
 * Idempotency keys for the Communications write tools. The caller's key if it is well formed; otherwise one derived from the grant,
 * the tool, the workspace and the arguments, so a retry of the same call (a timeout, a repeated message) gets the same key and the
 * Comms Block replays the first answer instead of creating a second thing.
 */
import crypto from 'node:crypto';

export const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

const canonical = (v) => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
  return v;
};

/** Throws nothing: returns the problem as a string, or null when the caller's key (if any) is fine. */
export const keyProblem = (a) => (a.idempotencyKey !== undefined && !KEY_RE.test(String(a.idempotencyKey))
  ? 'idempotencyKey must be 8 to 128 characters of letters, digits and . _ : -' : null);

export function deriveKey(claims, tool, workspace, a) {
  if (a.idempotencyKey !== undefined) return String(a.idempotencyKey);
  const { dryRun, idempotencyKey, workspaceId, ...rest } = a;
  const digest = crypto.createHash('sha256').update(JSON.stringify(canonical([claims.grantId, tool, workspace || null, rest]))).digest('hex');
  return `mcp-${digest.slice(0, 40)}`;
}
