/**
 * Redaction for the Communications contact tools (Comms MCP M3-3). An agent works with ids, counts and masked addresses; a real address
 * never reaches the chat (it would be copied into the model provider's logs and the person's transcript). For the real address the person
 * opens the dashboard. Every contact tool runs its output AND its errors through scrubDeep, so a field nobody thought of cannot leak.
 */

/** Matches an address wherever it hides in text (global: for replacing). */
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Matches an UNMASKED address (not global: for tests and checks). A masked one has `***` before the @ and does not match. */
export const FULL_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** jane.doe@example.com -> j***@example.com. Anything that is not an address -> ***. null/undefined stay null. */
export function maskEmail(value) {
  if (value === null || value === undefined) return null;
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(String(value).trim());
  return m ? `${m[1][0]}***@${m[2]}` : '***';
}

/** Jane Doe -> J. D. Blank or missing -> null. */
export function maskName(value) {
  if (value === null || value === undefined) return null;
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  return words.length ? words.map((w) => `${w[0].toUpperCase()}.`).join(' ') : null;
}

/** Mask every address inside free text (a reason, an error message). */
export const scrubText = (text) => String(text).replace(EMAIL_IN_TEXT, (m) => maskEmail(m));

/** Mask every address in any string anywhere in a value. Returns a copy; never mutates the input. */
export function scrubDeep(value) {
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v)]));
  return value;
}

/** Make an error safe to hand to the agent: message and data masked. */
export function scrubError(err) {
  if (err && typeof err === 'object') {
    if (typeof err.message === 'string') err.message = scrubText(err.message);
    if (err.data) err.data = scrubDeep(err.data);
  }
  return err;
}
