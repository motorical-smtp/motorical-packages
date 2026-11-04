// Resolving "when should this go out" without ever guessing (Comms MCP M3-5). A person says "Friday 9 Riga time": that is a LOCAL wall-clock time plus an
// IANA timezone, converted to one exact UTC instant. Anything that cannot name exactly one instant is refused, with a code the agent can act on:
// a missing or invalid zone, a local time that does not exist (the clocks jumped over it) or happens twice (the clocks went back), a past time.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSendTime } from '../src/commsTime.js';

const NOW = new Date('2026-10-27T12:00:00Z');
const EARLY = new Date('2026-01-01T00:00:00Z');
const fails = (input, code, now = NOW) => assert.throws(() => resolveSendTime(input, now), (e) => e.code === code, `${JSON.stringify(input)} -> ${code}`);

describe('a local time with a timezone', () => {
  test('Friday 9:00 in Riga in winter is 07:00 UTC, and the text says the weekday', () => {
    const r = resolveSendTime({ sendAtLocal: '2026-11-06T09:00', timezone: 'Europe/Riga' }, NOW);
    assert.equal(r.utc.toISOString(), '2026-11-06T07:00:00.000Z');
    assert.equal(r.timezone, 'Europe/Riga');
    assert.match(r.localText, /Friday/); assert.match(r.localText, /6 November 2026/); assert.match(r.localText, /09:00/);
    assert.equal(r.utcText, '2026-11-06T07:00:00.000Z');
  });
  test('the same wall clock in summer is an hour earlier in UTC (daylight saving is honoured)', () => {
    assert.equal(resolveSendTime({ sendAtLocal: '2027-07-15T09:00', timezone: 'Europe/Riga' }, NOW).utc.toISOString(), '2027-07-15T06:00:00.000Z');
    assert.equal(resolveSendTime({ sendAtLocal: '2027-07-15T09:00', timezone: 'America/New_York' }, NOW).utc.toISOString(), '2027-07-15T13:00:00.000Z');
    assert.equal(resolveSendTime({ sendAtLocal: '2026-11-06T09:00', timezone: 'UTC' }, NOW).utc.toISOString(), '2026-11-06T09:00:00.000Z');
  });
  test('seconds are accepted', () => assert.equal(resolveSendTime({ sendAtLocal: '2026-11-06T09:00:30', timezone: 'Europe/Riga' }, NOW).utc.toISOString(), '2026-11-06T07:00:30.000Z'));
  test('a local time without a timezone is refused (never the server\'s zone, never UTC by default)', () => fails({ sendAtLocal: '2026-11-06T09:00' }, 'TIMEZONE_REQUIRED'));
  test('an unknown timezone is refused', () => fails({ sendAtLocal: '2026-11-06T09:00', timezone: 'Mars/Base' }, 'INVALID_TIMEZONE'));
  test('anything that is not YYYY-MM-DDTHH:MM is refused: no "next friday", no offset on a local time, no impossible date', () => {
    for (const bad of ['next friday', '2026-11-06 09:00', '2026-11-06', '2026-11-06T09:00+02:00', '2026-02-30T09:00', '2026-11-06T25:00']) fails({ sendAtLocal: bad, timezone: 'Europe/Riga' }, 'INVALID_LOCAL_TIME');
  });
});

describe('daylight-saving edges are refused, not guessed', () => {
  test('a local time the clocks jump over does not exist', () => {
    fails({ sendAtLocal: '2027-03-28T03:30', timezone: 'Europe/Riga' }, 'LOCAL_TIME_DOES_NOT_EXIST', EARLY);
    fails({ sendAtLocal: '2027-03-14T02:30', timezone: 'America/New_York' }, 'LOCAL_TIME_DOES_NOT_EXIST', EARLY);
  });
  test('a local time that happens twice is ambiguous', () => {
    fails({ sendAtLocal: '2026-10-25T03:30', timezone: 'Europe/Riga' }, 'LOCAL_TIME_AMBIGUOUS', EARLY);
    fails({ sendAtLocal: '2026-11-01T01:30', timezone: 'America/New_York' }, 'LOCAL_TIME_AMBIGUOUS', EARLY);
  });
  test('a time next to the edge is fine', () => {
    assert.equal(resolveSendTime({ sendAtLocal: '2027-03-28T04:30', timezone: 'Europe/Riga' }, EARLY).utc.toISOString(), '2027-03-28T01:30:00.000Z');
    assert.equal(resolveSendTime({ sendAtLocal: '2026-10-25T02:30', timezone: 'Europe/Riga' }, EARLY).utc.toISOString(), '2026-10-24T23:30:00.000Z');
  });
});

describe('an explicit UTC instant', () => {
  test('Z and numeric offsets both name one instant; the timezone is only for showing it (default UTC)', () => {
    assert.equal(resolveSendTime({ sendAtUtc: '2026-11-06T07:00:00Z' }, NOW).utc.toISOString(), '2026-11-06T07:00:00.000Z');
    assert.equal(resolveSendTime({ sendAtUtc: '2026-11-06T09:00:00+02:00' }, NOW).utc.toISOString(), '2026-11-06T07:00:00.000Z');
    const shown = resolveSendTime({ sendAtUtc: '2026-11-06T07:00:00Z', timezone: 'Europe/Riga' }, NOW);
    assert.equal(shown.timezone, 'Europe/Riga'); assert.match(shown.localText, /09:00/);
    assert.equal(resolveSendTime({ sendAtUtc: '2026-11-06T07:00:00Z' }, NOW).timezone, 'UTC');
  });
  test('a UTC string with no zone or offset is refused', () => { fails({ sendAtUtc: '2026-11-06T07:00:00' }, 'INVALID_SEND_TIME_UTC'); fails({ sendAtUtc: 'tomorrow' }, 'INVALID_SEND_TIME_UTC'); });
});

describe('the rest', () => {
  test('no time at all, or both forms at once, is refused', () => {
    fails({}, 'SEND_TIME_REQUIRED');
    fails({ sendAtLocal: '2026-11-06T09:00', timezone: 'Europe/Riga', sendAtUtc: '2026-11-06T07:00:00Z' }, 'SEND_TIME_AMBIGUOUS_INPUT');
  });
  test('a time in the past is refused', () => {
    fails({ sendAtLocal: '2026-10-01T09:00', timezone: 'Europe/Riga' }, 'SEND_TIME_IN_PAST');
    fails({ sendAtUtc: '2026-10-01T09:00:00Z' }, 'SEND_TIME_IN_PAST');
  });
  test('the errors are 400s an agent can read', () => {
    try { resolveSendTime({}, NOW); assert.fail('should throw'); } catch (e) { assert.equal(e.status, 400); assert.ok(e.message.length > 20); }
  });
});
