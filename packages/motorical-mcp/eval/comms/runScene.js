// Drives one communications scene (Comms MCP M4-3) as a real multi-turn conversation: the opening prompt, then each scripted reply resumed on
// the same `claude` session, merged into one transcript the graders read. `claude -p` does not echo the prompt, so the person's turns are
// injected as `person:true` events. The spawner is injected so the driver is unit-tested with no process and no cost (test/evalCommsRunner.test.js).
//
// LIVE RUNS COST REAL MONEY AND TOUCH A REAL ACCOUNT. The CLI below refuses to start without the owner's go-ahead (--go), a named budget
// (--budget USD, passed to claude as --max-budget-usd for each turn) and an mcp config naming the server and a bearer for the eval account
// (--mcp-config). Seeding the scene fixtures and minting that grant are separate steps, not done here. Run as a non-root user.
//
//   node eval/comms/runScene.js --go --budget 5 --mcp-config /path/mcp.json [--only c01_first_run,c07_send_now]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMS_SCENES } from './scenes.js';
import { gradeScene } from './graders.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TURN_TIMEOUT_MS = Number(process.env.EVAL_SCENARIO_TIMEOUT_MS ?? 5 * 60 * 1000);
/** The child is the thing under test: it never inherits the harness's own credentials. */
const SENSITIVE_ENV_KEYS = ['EVAL_EMAIL', 'EVAL_PASSWORD', 'EVAL_DATABASE_URL', 'MCP_EVAL_CLIENT_ID'];

const personEvent = (text) => ({ type: 'user', person: true, message: { role: 'user', content: [{ type: 'text', text }] } });

/** Run a scene's turns through `spawnTurn({ prompt, resume })` -> `{ events, sessionId }` and return the merged transcript. */
export async function runScene(scene, { spawnTurn }) {
  const turns = [scene.person.opening, ...scene.person.replies];
  const transcript = [];
  let session = null;
  for (let i = 0; i < turns.length; i += 1) {
    transcript.push(personEvent(turns[i]));
    const { events, sessionId } = await spawnTurn({ prompt: turns[i], resume: i === 0 ? undefined : session });
    transcript.push(...events);
    session = sessionId || session;
    if (i < turns.length - 1 && !session) throw new Error(`${scene.id}: the agent reported no session id after turn ${i + 1}, so the next reply cannot be resumed`);
  }
  return transcript;
}

export function parseArgs(argv) {
  const out = { go: false, budget: undefined, mcpConfig: undefined, only: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--go') out.go = true;
    else if (argv[i] === '--budget') out.budget = Number(argv[++i]);
    else if (argv[i] === '--mcp-config') out.mcpConfig = argv[++i];
    else if (argv[i] === '--only') out.only = String(argv[++i]).split(',').filter(Boolean);
  }
  return out;
}

export function assertMayRunLive(opts, { uid = process.getuid?.() } = {}) {
  if (!opts.go) throw new Error('refusing to run live: pass --go only with the owner\'s go-ahead');
  if (!(opts.budget > 0)) throw new Error('refusing to run live: name a budget in USD with --budget');
  if (!opts.mcpConfig) throw new Error('refusing to run live: pass --mcp-config naming the server and the eval account\'s bearer');
  if (uid === 0) throw new Error('refusing to run as root: run as a non-root user');
}

/** The real spawner: one `claude -p` turn, streaming events back. Not unit-tested (it is the paid part). */
export function claudeTurn({ mcpConfig, budget, cwd }) {
  return ({ prompt, resume }) => new Promise((resolve, reject) => {
    const args = ['-p', prompt, ...(resume ? ['--resume', resume] : []), '--mcp-config', mcpConfig, '--strict-mcp-config', '--setting-sources', 'project,local',
      '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', '--max-budget-usd', String(budget)];
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !SENSITIVE_ENV_KEYS.includes(k)));
    const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], env });
    const events = [];
    let buf = '';
    const take = (line) => { if (line.trim()) { try { events.push(JSON.parse(line)); } catch { console.error(`corrupt transcript line: ${line.slice(0, 200)}`); } } };
    const timer = setTimeout(() => child.kill('SIGTERM'), TURN_TIMEOUT_MS);
    child.stdout.on('data', (d) => { buf += d.toString(); const lines = buf.split('\n'); buf = lines.pop(); lines.forEach(take); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', () => {
      clearTimeout(timer); take(buf);
      const sessionId = [...events].reverse().map((e) => e.session_id).find(Boolean) || null;
      resolve({ events, sessionId });
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  assertMayRunLive(opts);
  const scenes = COMMS_SCENES.filter((s) => !opts.only || opts.only.includes(s.id));
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(HERE, '..', 'results', `comms-${runId}`);
  fs.mkdirSync(outDir, { recursive: true });
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-comms-'));
  const report = [];
  try {
    for (const scene of scenes) {
      const transcript = await runScene(scene, { spawnTurn: claudeTurn({ mcpConfig: opts.mcpConfig, budget: opts.budget, cwd }) });
      fs.writeFileSync(path.join(outDir, `${scene.id}.jsonl`), transcript.map((e) => JSON.stringify(e)).join('\n'));
      const r = gradeScene(scene, transcript);
      report.push({ id: scene.id, ...r });
      console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${scene.id}${r.pass ? '' : `  -> ${r.failures.map((f) => f.id).join(', ')}`}`);
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  }
  process.exitCode = report.every((r) => r.pass) ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(2); });
}
