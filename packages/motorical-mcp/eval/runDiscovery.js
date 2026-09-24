// packages/motorical-mcp/eval/runDiscovery.js
//
// UNTESTED AGAINST A REAL `claude` CHILD PROCESS as of 2026-09-24 — see
// discoveryScenarios.js's header for why, and what to do before trusting a
// full batch: `node eval/runDiscovery.js --only motorical_com_only`.
//
// Sibling to run.js, deliberately NOT sharing its runScenario/main — a
// discovery scenario needs no Motorical account, no mcp.json, no
// EVAL_DATABASE_URL, none of run.js's credential plumbing (design's Level 2
// is about whether a genuinely COLD agent finds its own way in, so wiring an
// MCP server up front would test the wrong thing). Keeping the two runners
// separate means a bug here cannot touch the existing, proven, money-costing
// harness — see the implementation plan's Step 5 AS-BUILT for the full
// reasoning.
//
// Same proven spawn shape as run.js's runScenario (bypassPermissions, no
// --mcp-config at all here, stream-json + verbose, stderr inherited, a
// wall-clock kill timer) — reused deliberately, EXCEPT for env and tool
// scope, which are stricter here on purpose (see CHILD_ENV/ALLOWED_TOOLS
// below): this script must run in a disposable environment (a fresh
// container or VM, not an operator's everyday shell) precisely because the
// env allowlist and tool restriction are defense in depth, not a substitute
// for isolation — a prompt injection that finds a gap in either still runs
// inside whatever ran this script.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DISCOVERY_SCENARIOS } from './discoveryScenarios.js';
import { gradeDiscovery } from './gradeDiscovery.js';

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const SCENARIO_TIMEOUT_MS = Number(process.env.EVAL_SCENARIO_TIMEOUT_MS ?? 15 * 60 * 1000);
const KILL_GRACE_MS = 5000;
const RESULTS_DIR = new URL('./results-discovery/', import.meta.url);

// Found 2026-09-24 (independent review B1) — the exact defect eval/run.js
// documents as found and fixed on 2026-09-05 (spawn() with no `env` inherits
// the entire parent environment; one run's agent ran `env | grep` and wrote
// a live DB credential into a saved transcript), except worse here: this
// child also runs under bypassPermissions with WebFetch/WebSearch/Bash all
// available (below), and a discovery scenario's whole point is pointing the
// agent at the open web — untrusted page content can steer a prompt
// injection straight at whatever secrets happen to be in env.
//
// run.js uses a DENYLIST (four known-sensitive vars specific to its own
// purpose-built eval account) because that set is small and fully
// enumerable. This script has no such list to enumerate: it is meant to run
// in whatever shell the operator has, which can hold arbitrary unrelated
// secrets (GitHub/npm/AWS tokens, other services' credentials) with no way
// to name them all in advance. An ALLOWLIST is the only safe default —
// only what the `claude` CLI itself needs to run, nothing else.
const CHILD_ENV_ALLOWLIST = ['PATH', 'HOME', 'TERM', 'LANG', 'LC_ALL', 'SHELL', 'USER', 'LOGNAME', 'TMPDIR'];
const CHILD_ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    // ANTHROPIC_*/CLAUDE_* is the CLI's own auth/config mechanism — the same
    // credential class the operator already trusts to run `claude` at all,
    // not an unrelated secret a scenario could be steered into exfiltrating.
    ([k]) => CHILD_ENV_ALLOWLIST.includes(k) || k.startsWith('ANTHROPIC_') || k.startsWith('CLAUDE_')
  )
);

// Every DISCOVERY_SCENARIOS prompt asks the agent to investigate and report
// back or describe steps — none require actually running a command (the
// shell-only scenario explicitly says "Do not install anything"). Bash adds
// pure risk with no scenario needing it, so it's left out entirely rather
// than sandboxed — narrower than the review's suggested fallback of
// "Bash only inside a sandbox/container".
//
// Fed to --tools, NOT --allowedTools (found 2026-09-25, re-review): --tools
// defines the set of built-in tools that EXIST for this session; --allowedTools
// is a permission allow-list, which bypassPermissions below makes a no-op —
// under bypass every tool is auto-approved regardless of what --allowedTools
// names, so Bash stayed fully available the whole time despite the comment
// that used to be here. toolRestrictionCheck.js proves this behaviorally
// (spawns a real scenario whose prompt asks for a Bash command, asserts no
// Bash tool_use appears) rather than trusting --help text.
const ENABLED_TOOLS = 'WebFetch,WebSearch';

const liveTempDirs = new Set();
function removeTempDir(dir) {
  liveTempDirs.delete(dir);
  fs.rmSync(dir, { recursive: true, force: true });
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const dir of liveTempDirs) removeTempDir(dir);
    process.exit(1);
  });
}

export async function runDiscoveryScenario(scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mcp-eval-discovery-${scenario.id}-`));
  liveTempDirs.add(dir);
  const transcriptPath = new URL(`./results-discovery/${RUN_ID}/${scenario.id}.jsonl`, import.meta.url);

  try {
    const transcript = [];
    let corruptLines = 0;
    const parseLine = (line) => {
      if (!line.trim()) return;
      try {
        transcript.push(JSON.parse(line));
      } catch (e) {
        corruptLines++;
        console.error(`[${scenario.id}] corrupt transcript line (${e.message}): ${line.slice(0, 200)}`);
      }
    };

    const exitCode = await new Promise((resolve, reject) => {
      // No --mcp-config / --strict-mcp-config at all — the whole point of a
      // discovery scenario is an agent with no Motorical connection wired
      // up yet. --tools restricts which built-in tools exist at all for this
      // session, down to ENABLED_TOOLS (WebFetch/WebSearch — see its comment
      // above); env is CHILD_ENV, not the inherited process.env (see
      // CHILD_ENV_ALLOWLIST's comment above).
      const child = spawn('claude', [
        '-p', scenario.prompt,
        '--setting-sources', 'project,local',
        '--output-format', 'stream-json',
        '--verbose',
        '--permission-mode', 'bypassPermissions',
        '--tools', ENABLED_TOOLS,
      ], { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'], env: CHILD_ENV });

      let timedOut = false;
      let killTimer = null;
      const timeout = setTimeout(() => {
        timedOut = true;
        console.error(`[${scenario.id}] timed out after ${SCENARIO_TIMEOUT_MS}ms -- killing child`);
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
        killTimer.unref?.();
      }, SCENARIO_TIMEOUT_MS);
      const clearTimers = () => { clearTimeout(timeout); if (killTimer) clearTimeout(killTimer); };

      let buf = '';
      child.stdout.on('data', (d) => {
        buf += d.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) parseLine(line);
      });
      child.on('error', (e) => { clearTimers(); reject(e); });
      child.on('close', (code) => {
        clearTimers();
        if (timedOut) { reject(new Error(`scenario timed out after ${SCENARIO_TIMEOUT_MS}ms`)); return; }
        parseLine(buf);
        resolve(code);
      });
    });

    fs.mkdirSync(new URL(`./results-discovery/${RUN_ID}/`, import.meta.url), { recursive: true });
    fs.writeFileSync(transcriptPath, transcript.map((e) => JSON.stringify(e)).join('\n'));

    return {
      id: scenario.id,
      frontDoor: scenario.frontDoor,
      persona: scenario.persona,
      note: scenario.note,
      exitCode,
      corruptLines,
      transcriptPath: transcriptPath.pathname,
      ...gradeDiscovery({ transcript, scenario }),
    };
  } finally {
    removeTempDir(dir);
  }
}

async function main() {
  const onlyIdx = process.argv.indexOf('--only');
  const onlyId = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
  const scenarios = onlyId
    ? DISCOVERY_SCENARIOS.filter((s) => s.id === onlyId)
    : DISCOVERY_SCENARIOS;
  if (onlyId && scenarios.length === 0) {
    throw new Error(`no discovery scenario named "${onlyId}"`);
  }

  const results = [];
  for (const s of scenarios) {
    console.error(`running discovery scenario ${s.id}...`);
    try {
      results.push(await runDiscoveryScenario(s));
    } catch (e) {
      console.error(`${s.id} crashed: ${e?.stack || e}`);
      results.push({ id: s.id, crashed: true, error: String(e?.message ?? e) });
    }
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const reportPath = new URL(`./results-discovery/${RUN_ID}.json`, import.meta.url);
  fs.writeFileSync(reportPath, JSON.stringify({ runId: RUN_ID, results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
}

// Guarded so toolRestrictionCheck.js can import runDiscoveryScenario without
// triggering a full (money-costing) run over every DISCOVERY_SCENARIOS entry
// as a side effect of the import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
