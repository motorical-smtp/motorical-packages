/**
 * "When should this go out", without ever guessing (Comms MCP M3-5). A person says "Friday 9:00 Riga time": a LOCAL wall-clock time plus an IANA
 * timezone, turned into one exact UTC instant. Anything that cannot name exactly ONE instant is refused with a code an agent can act on: a missing
 * or unknown zone, a malformed time, a local time the clocks jump over (it does not exist) or pass twice (it is ambiguous), a time in the past.
 * No dependencies: only Intl.
 */

export class SendTimeError extends Error {
  constructor(code, message) { super(message); this.name = 'SendTimeError'; this.code = code; this.status = 400; }
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DAY = 24 * 60 * 60 * 1000;

const validZone = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };

/** The wall clock in `tz` at an instant, expressed as if it were UTC (so two wall clocks can be compared as numbers). */
function wallAt(instantMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instantMs));
  const p = Object.fromEntries(parts.filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}
const offsetAt = (instantMs, tz) => wallAt(instantMs, tz) - Math.floor(instantMs / 1000) * 1000;

function show(date, timezone) {
  const local = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: timezone }).format(date);
  return { localText: `${local} (${timezone})`, utcText: date.toISOString() };
}

function fromLocal(sendAtLocal, timezone) {
  const m = LOCAL_RE.exec(String(sendAtLocal).trim());
  if (!m) throw new SendTimeError('INVALID_LOCAL_TIME', 'sendAtLocal must look like 2026-11-06T09:00 (year-month-day, a T, hour:minute), with no offset and no words.');
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] || '00'].map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const back = new Date(wall);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || back.getUTCHours() !== h || back.getUTCMinutes() !== mi || s > 59) {
    throw new SendTimeError('INVALID_LOCAL_TIME', 'That date or time does not exist on the calendar.');
  }
  // Every UTC offset the zone had around that day; each gives a candidate instant, and it only counts if the zone shows the same wall clock then.
  const offsets = new Set([offsetAt(wall - DAY, timezone), offsetAt(wall, timezone), offsetAt(wall + DAY, timezone)]);
  const valid = new Set();
  for (const off of offsets) { const inst = wall - off; if (wallAt(inst, timezone) === wall) valid.add(inst); }
  if (valid.size === 0) throw new SendTimeError('LOCAL_TIME_DOES_NOT_EXIST', `${sendAtLocal} does not exist in ${timezone}: the clocks jump over it. Ask the person for another time.`);
  if (valid.size > 1) throw new SendTimeError('LOCAL_TIME_AMBIGUOUS', `${sendAtLocal} happens twice in ${timezone}: the clocks go back. Ask the person which one, or give an explicit UTC time.`);
  return new Date([...valid][0]);
}

/**
 * input: { sendAtLocal + timezone } OR { sendAtUtc [+ timezone for display] }. Returns { utc: Date, timezone, localText, utcText }.
 * `now` is a parameter so the result is testable.
 */
export function resolveSendTime({ sendAtLocal, timezone, sendAtUtc } = {}, now = new Date()) {
  const hasLocal = sendAtLocal !== undefined && sendAtLocal !== null && sendAtLocal !== '';
  const hasUtc = sendAtUtc !== undefined && sendAtUtc !== null && sendAtUtc !== '';
  if (hasLocal && hasUtc) throw new SendTimeError('SEND_TIME_AMBIGUOUS_INPUT', 'Give the send time either as sendAtLocal with a timezone, or as sendAtUtc, not both.');
  if (!hasLocal && !hasUtc) throw new SendTimeError('SEND_TIME_REQUIRED', 'Say when it should go out: sendAtLocal (for example 2026-11-06T09:00) with an IANA timezone (for example Europe/Riga), or sendAtUtc.');
  let tz = timezone;
  if (hasLocal && !tz) throw new SendTimeError('TIMEZONE_REQUIRED', 'A local send time needs the timezone it is in (an IANA name such as Europe/Riga). Ask the person; do not assume one.');
  if (tz && !validZone(String(tz))) throw new SendTimeError('INVALID_TIMEZONE', `${tz} is not a timezone name. Use an IANA name such as Europe/Riga or America/New_York.`);
  let utc;
  if (hasLocal) {
    utc = fromLocal(sendAtLocal, tz);
  } else {
    if (!UTC_RE.test(String(sendAtUtc).trim()) || Number.isNaN(new Date(sendAtUtc).getTime())) {
      throw new SendTimeError('INVALID_SEND_TIME_UTC', 'sendAtUtc must be a full timestamp with Z or an offset, for example 2026-11-06T07:00:00Z.');
    }
    utc = new Date(sendAtUtc);
    tz = tz || 'UTC';
  }
  if (utc.getTime() <= now.getTime()) throw new SendTimeError('SEND_TIME_IN_PAST', 'That time has already passed. Ask the person for a time in the future.');
  return { utc, timezone: tz, ...show(utc, tz) };
}
