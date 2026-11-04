// The multi-turn driver of the communications eval (Comms MCP M4-3), tested with a fake `claude` so nothing is spawned and nothing is spent.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runScene, assertMayRunLive, parseArgs } from '../eval/comms/runScene.js';
import { personTurnsOf, finalOf } from '../eval/comms/graders.js';
import { script } from '../eval/comms/script.js';

const scene = { id: 's', person: { opening: 'hello', replies: ['yes please', 'thanks'] } };

/** A fake agent: each turn answers "turn N" and reports a session id; records how it was called. */
function fakeSpawn() {
  const calls = [];
  const spawnTurn = async (args) => {
    calls.push(args);
    const n = calls.length;
    return { sessionId: 'sess-1', events: script().end(`turn ${n}`).build() };
  };
  return { spawnTurn, calls };
}

describe('runScene', () => {
  test('sends the opening, then each scripted reply on the same session, and merges one transcript with the person\'s turns injected', async () => {
    const { spawnTurn, calls } = fakeSpawn();
    const t = await runScene(scene, { spawnTurn });
    assert.deepEqual(calls.map((c) => [c.prompt, c.resume ?? null]), [['hello', null], ['yes please', 'sess-1'], ['thanks', 'sess-1']]);
    assert.deepEqual(personTurnsOf(t), ['hello', 'yes please', 'thanks']);
    assert.equal(finalOf(t), 'turn 3');
    assert.deepEqual(t.filter((e) => e.person || e.type === 'result').map((e) => (e.person ? 'P' : 'R')), ['P', 'R', 'P', 'R', 'P', 'R']);
  });

  test('stops with a clear error if the agent never reports a session to resume', async () => {
    const spawnTurn = async () => ({ sessionId: null, events: [] });
    await assert.rejects(runScene(scene, { spawnTurn }), /session/i);
  });

  test('a scene with no replies is one turn and needs no session id', async () => {
    const spawnTurn = async () => ({ sessionId: null, events: script().end('hi').build() });
    const t = await runScene({ id: 'x', person: { opening: 'hello', replies: [] } }, { spawnTurn });
    assert.equal(finalOf(t), 'hi');
  });
});

describe('the live guard', () => {
  const ok = { go: true, budget: 5, mcpConfig: '/x/mcp.json' };
  test('refuses without the owner\'s go-ahead, a named budget, or an mcp config', () => {
    assert.throws(() => assertMayRunLive({ ...ok, go: false }, { uid: 501 }), /go-ahead/i);
    assert.throws(() => assertMayRunLive({ ...ok, budget: undefined }, { uid: 501 }), /budget/i);
    assert.throws(() => assertMayRunLive({ ...ok, mcpConfig: undefined }, { uid: 501 }), /mcp-config/i);
  });
  test('refuses to run as root (bypassPermissions is refused there, and an unattended agent should not be root anyway)', () => {
    assert.throws(() => assertMayRunLive(ok, { uid: 0 }), /root/i);
    assert.doesNotThrow(() => assertMayRunLive(ok, { uid: 501 }));
  });
  test('parseArgs reads the flags', () => {
    assert.deepEqual(parseArgs(['--go', '--budget', '7.5', '--mcp-config', 'a.json', '--only', 'c01,c07']),
      { go: true, budget: 7.5, mcpConfig: 'a.json', only: ['c01', 'c07'] });
    assert.deepEqual(parseArgs([]), { go: false, budget: undefined, mcpConfig: undefined, only: null });
  });
});
