// The tier-1 communications scenes (Comms MCP M4-3), proven without a paid run: every scene's honest transcript passes all its checks, every
// dishonest one fails the check it names, and every tool a scene mentions really exists on the server.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { COMMS_SCENES } from '../eval/comms/scenes.js';
import { gradeScene, ORACLES, personTurnsOf } from '../eval/comms/graders.js';
import { SERVERS } from '../src/servers.js';

const TOOLS = new Set(SERVERS.find((s) => s.key === 'communications').tools);

describe('the scene set', () => {
  test('has the 14 tier-1 scenes with unique ids and the fields a runner needs', () => {
    assert.equal(COMMS_SCENES.length, 14);
    assert.equal(new Set(COMMS_SCENES.map((s) => s.id)).size, COMMS_SCENES.length);
    for (const s of COMMS_SCENES) {
      assert.ok(s.title && s.person?.opening && Array.isArray(s.person.replies) && s.grant && s.fixtures, s.id);
      assert.ok(s.oracles.length > 0 && s.good.length > 0 && s.bad.length > 0, s.id);
      assert.equal(new Set(s.oracles.map((o) => o.id)).size, s.oracles.length, `${s.id}: duplicate oracle ids`);
      for (const o of s.oracles) assert.ok(ORACLES[o.kind], `${s.id}.${o.id}: unknown oracle kind ${o.kind}`);
    }
  });

  test('every tool a scene names exists on the communications server', () => {
    const names = (s) => [
      ...s.oracles.flatMap((o) => [...(o.oneOf || []), ...(o.tools || []), ...(o.tool ? [o.tool] : [])]),
      ...(s.yesExempt || []),
      ...(s.claims || []).flatMap((c) => [].concat(c.tool).filter((t) => t !== '__no_such_tool__')),
    ];
    for (const s of COMMS_SCENES) for (const n of names(s)) assert.ok(TOOLS.has(n) || n === 'motorical_whoami', `${s.id}: unknown tool ${n}`);
  });

  test('a scene\'s good transcript says what the scene scripts the person to say', () => {
    for (const s of COMMS_SCENES) assert.deepEqual(personTurnsOf(s.good), [s.person.opening, ...s.person.replies], s.id);
  });
});

for (const s of COMMS_SCENES) {
  describe(s.id, () => {
    test('the honest transcript passes every check', () => {
      const r = gradeScene(s, s.good);
      assert.deepEqual(r.failures, [], JSON.stringify(r.failures));
    });
    for (const b of s.bad) {
      test(`the dishonest transcript fails ${b.fails}`, () => {
        const r = gradeScene(s, b.transcript);
        assert.equal(r.pass, false);
        assert.ok(r.failures.some((f) => f.id === b.fails), `expected ${b.fails}, got ${r.failures.map((f) => f.id).join(', ') || 'nothing'}`);
      });
    }
  });
}
