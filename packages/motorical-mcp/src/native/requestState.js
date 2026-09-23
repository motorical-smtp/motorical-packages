// requestState binds an MRTR confirmation to the EXACT args that were shown
// to the user, so a client bug (or a malicious intermediary) can't send
// `inputResponses: { confirm: { action: "accept" } }` alongside DIFFERENT
// arguments than what the original input_required prompt described. The
// spec allows a bare unsigned opaque string; this signs it, closing that gap.
//
// A separate HMAC secret from this codebase's JWT RS256 signing key -- this
// is a different trust boundary (a short-lived, single-purpose token, not an
// access credential).
import crypto from 'node:crypto';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

// Falling back to a hardcoded, git-visible secret would let anyone forge a
// valid confirmation token if the env var is misconfigured. Fail loudly in
// production instead of silently degrading, matching taskStore.js's
// resolveRedisPassword() and serve.js's loadSigner()/buildServer().
const SECRET = process.env.MRTR_REQUEST_STATE_SECRET
  || (process.env.NODE_ENV === 'production'
    ? (() => { throw new Error(
        'requestState: MRTR_REQUEST_STATE_SECRET is required in production '
        + '(no insecure default allowed)'
      ); })()
    : 'dev-only-insecure-mrtr-secret');

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalArgsHash(args) {
  return crypto.createHash('sha256').update(stableStringify(args ?? {})).digest('hex');
}

export function signRequestState({ tool, args, nowMs = Date.now() }) {
  const payload = { tool, argsHash: canonicalArgsHash(args), exp: nowMs + TTL_MS };
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', SECRET).update(json).digest('hex');
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64url');
}

export function verifyRequestState(token, { tool, args }) {
  try {
    const { payload, sig } = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const expectedSig = crypto.createHmac('sha256', SECRET).update(JSON.stringify(payload)).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;
    if (payload.tool !== tool) return false;
    if (payload.argsHash !== canonicalArgsHash(args)) return false;
    if (Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}
