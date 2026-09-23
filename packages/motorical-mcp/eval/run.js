// packages/motorical-mcp/eval/run.js
//
// Drives real, non-interactive Claude Code processes against the real hosted
// MCP server -- the actual client software a user would run, not a simulation.
// Mechanism inherited from specs/2026-08-28-mcp-cold-agent-walk-design.md.
//
//   --strict-mcp-config  the agent sees ONLY the Motorical server
//   --setting-sources project,local   (omit `user`: no personal CLAUDE.md)
//   --permission-mode bypassPermissions   no host to answer prompts in an
//       unattended child; --print defaults permission-prompts to "host" and
//       denies everything when none exists, which isn't a safety fallback
//       here -- it silently reduces every scenario to "agent got blocked"
//   fresh empty cwd per scenario      no project CLAUDE.md, no prior state
//   --output-format stream-json --verbose
//       full transcript, not just the answer. --verbose is not optional here:
//       the CLI itself refuses `--print --output-format=stream-json` without
//       it ("requires --verbose"), and it's also what was actually running
//       when grade.js's helpers' event shape was verified against a live
//       transcript (see grade.js's toolResultTextOf doc comment).
//
// Transcript events are pushed onto `transcript` EXACTLY as the CLI emits
// them -- one JSON object per stdout line, unmodified. grade.js's
// toolCallsOf/finalTextOf/toolResultTextOf all walk `ev.message.content[]`
// directly; reshaping, flattening, or unwrapping here would make every
// scenario silently grade as a failure with nothing to catch it.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS } from './scenarios.js';
import { mintToken } from './mintToken.js';
import { grade, toolCallsOf } from './grade.js';
import { connect } from './db.js';

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');

// The slug substituted for the `<RUN_ID>` placeholder in scenario prompts --
// today only `domain_setup`'s, which creates `eval-<slug>.example.com`.
//
// I4 (2026-09-04): this used to be `RUN_ID.slice(0, 10)`, i.e. `2026-09-04`,
// discarding the time. The second run of any day therefore asked the agent to
// create a domain that already existed, which changes what the agent sees
// (a 409 instead of a fresh add), changes what it does about it, and drifts
// the baseline -- the exact failure mode eval/README.md's cleanup section
// warns about. Keeping the whole timestamp makes it unique per run.
//
// DNS-label-safe by construction: RUN_ID is an ISO-8601 timestamp with `:`
// and `.` already replaced by `-`, so lower-casing leaves only [a-z0-9-]. It
// starts with a digit and ends with `z`, never a hyphen, and the resulting
// label (`eval-2026-09-04t12-34-56-789z`, 29 chars) is well inside the 63-char
// limit. The strip below is a belt-and-braces guard, not load-bearing.
const RUN_SLUG = RUN_ID.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');

// Wall-clock ceiling per scenario. A hung `claude` child would otherwise stall
// the whole run indefinitely (see the stderr note on spawn() below).
const SCENARIO_TIMEOUT_MS = Number(process.env.EVAL_SCENARIO_TIMEOUT_MS ?? 15 * 60 * 1000);
// Grace period between SIGTERM and SIGKILL when a scenario times out.
const KILL_GRACE_MS = 5000;

// Found 2026-09-05: spawn() with no `env` option inherits the ENTIRE parent
// environment by default. The child is an unattended agent with a Bash tool
// and no reason to trust it -- it is the thing being evaluated, not a co-
// operating process -- and this harness's own env holds EVAL_PASSWORD (the
// real account password, in plaintext) and EVAL_DATABASE_URL (a live
// Postgres credential reading three tables, `users` included, across every
// tenant, not just this eval account). Confirmed live: one run's agent ran
// `env | grep -i motor`, which matched EVAL_DATABASE_URL (the connection
// string contains "motorical_db") and wrote it straight into the saved
// transcript -- a file this harness's own README says to treat as sensitive,
// now doubly so. EVAL_PASSWORD did not happen to match that run's grep
// pattern, but it was sitting in the child's env the whole time and a
// differently-phrased `env` dump would have caught it too.
//
// None of these four are needed by the child -- mintToken.js and db.js run
// in the PARENT and hand the child only an already-minted bearer token inside
// mcp.json. A denylist (inherit everything else) rather than a built-from-
// scratch allowlist, so this doesn't have to guess at whatever the `claude`
// CLI itself needs (auth state, proxy settings, etc.) to function.
const SENSITIVE_ENV_KEYS = ['EVAL_EMAIL', 'EVAL_PASSWORD', 'EVAL_DATABASE_URL', 'MCP_EVAL_CLIENT_ID'];
const CHILD_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !SENSITIVE_ENV_KEYS.includes(k))
);

// Temp dirs currently on disk, each holding an mcp.json with a LIVE bearer
// token. runScenario's `finally` removes its own on every normal exit path,
// but a SIGINT (^C on a run that takes many minutes is entirely normal) or a
// SIGTERM skips `finally` entirely and would leave the token sitting in
// os.tmpdir(). Registered handlers below sweep whatever is still open.
const liveTempDirs = new Set();

function removeTempDir(dir) {
  liveTempDirs.delete(dir);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.error(`failed to remove temp dir ${dir}: ${e?.message ?? e}`);
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const dir of [...liveTempDirs]) removeTempDir(dir);
    // Re-raise with the default disposition so the exit status is the normal
    // signal-death status rather than a plain 0/1.
    process.removeAllListeners(sig);
    process.kill(process.pid, sig);
  });
}

// Transcripts live in a known, run-scoped location under eval/results/ (git-
// ignored) -- not in the mkdtemp'd cwd, which is deleted the moment the
// scenario finishes so the live bearer token inside its mcp.json doesn't sit
// on disk indefinitely. Deterministic from RUN_ID + scenario.id alone, so
// both the success path (runScenario) and the crash path (main()'s catch,
// which never gets to run the rest of runScenario) compute the exact same
// path without needing to thread it through a thrown error.
const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(EVAL_DIR, 'results', RUN_ID);

function transcriptPathFor(scenario) {
  return path.join(RESULTS_DIR, `${scenario.id}.jsonl`);
}

async function runScenario(scenario, db) {
  // `noToken: true` skips the mint entirely and connects with NO Authorization
  // header at all.
  //
  // Not an optimisation — without it `cold_signup` cannot run. mintToken() ends
  // in POST /api/oauth2/token with `resource: scenario.audience`, and the AS
  // (backend/src/routes/oauth.js) refuses any resource that is not a row in
  // `oauth_resource_servers`. The `signup` server is deliberately not one: it is
  // `public: true` in servers.js precisely because it is the server a caller
  // with NO account can reach, and registering it as an OAuth resource would
  // contradict that. So the mint 400s `invalid_target` and the scenario dies
  // before the agent is ever spawned.
  //
  // Skipping it is also the more faithful measurement: a real cold agent
  // reaching for motorical_signup_handoff has no account, therefore no consent
  // grant, therefore no bearer of any kind. Sending one would be testing a
  // situation that cannot occur.
  const token = scenario.noToken
    ? null
    : await mintToken({
      email: process.env.EVAL_EMAIL,
      password: process.env.EVAL_PASSWORD,
      audience: scenario.audience,
      scopes: scenario.scopes,
    });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mcp-eval-${scenario.id}-`));
  liveTempDirs.add(dir);
  const transcriptPath = transcriptPathFor(scenario);

  try {
    const cfg = path.join(dir, 'mcp.json');
    // mode 0600 explicitly -- don't rely solely on the parent dir's 0700 for
    // a file holding a live bearer token. (Harmless when there is no token:
    // the mode is set the same way regardless.)
    //
    // No `headers` key at all in the noToken case -- not an empty object and
    // not `Bearer null`, either of which would send something. The MCP server's
    // authenticateMcp (src/http.js) short-circuits on `srv.public` before it
    // ever looks at the header, so a public server sees exactly what a real
    // cold caller sends: nothing.
    fs.writeFileSync(cfg, JSON.stringify({
      mcpServers: {
        motorical: {
          type: 'http',
          url: scenario.audience,
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        },
      },
    }), { mode: 0o600 });

    const prompt = scenario.prompt.replace('<RUN_ID>', RUN_SLUG);
    const transcript = [];
    let corruptLines = 0;

    const parseLine = (line) => {
      if (!line.trim()) return;
      try {
        transcript.push(JSON.parse(line));
      } catch (e) {
        // By the time a line reaches here it is a COMPLETE line (split on
        // '\n' already happened) that failed to parse as JSON -- genuine
        // transcript corruption, not a partial write. Log it and count it
        // so a corrupted run can't look identical to a clean one in the
        // JSON report.
        corruptLines++;
        console.error(`[${scenario.id}] corrupt transcript line (${e.message}): ${line.slice(0, 200)}`);
      }
    };

    const exitCode = await new Promise((resolve, reject) => {
      // stdio: stdout piped (we parse it), stderr INHERITED, stdin ignored.
      //
      // I5 (2026-09-04): spawn()'s default is 'pipe' for all three, and only
      // stdout was being drained. An undrained stderr pipe fills its ~64KB
      // kernel buffer and then blocks the child's next write FOREVER --
      // repeated MCP connection warnings get there easily -- hanging the run
      // mid-way through five paid agent sessions with nothing in the output
      // explaining why. Inheriting sends the child's stderr straight to the
      // operator's terminal: nothing to drain, and the diagnostics are
      // visible live instead of swallowed.
      const child = spawn('claude', [
        '-p', prompt,
        '--mcp-config', cfg,
        '--strict-mcp-config',
        '--setting-sources', 'project,local',
        '--output-format', 'stream-json',
        '--verbose',
        // --print's permission-prompts default is "host", and there is no
        // host here to answer -- every prompt is denied automatically. That
        // makes every scenario "fail" the same way (agent reports being
        // blocked, never touches a Motorical tool) rather than exercising the
        // platform at all. The eval's entire premise is an unattended agent,
        // so bypassing is the correct mode, not a workaround.
        '--permission-mode', 'bypassPermissions',
      ], { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'], env: CHILD_ENV });

      // Belt and braces behind the stderr fix: a child that hangs for any
      // other reason (a stalled HTTP request to the MCP server, an interactive
      // prompt we didn't anticipate) is killed and surfaced as a crashed
      // scenario rather than stalling the whole run.
      let timedOut = false;
      let killTimer = null;
      const timeout = setTimeout(() => {
        timedOut = true;
        console.error(`[${scenario.id}] timed out after ${SCENARIO_TIMEOUT_MS}ms -- killing child`);
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
        killTimer.unref?.();
      }, SCENARIO_TIMEOUT_MS);

      const clearTimers = () => {
        clearTimeout(timeout);
        if (killTimer) clearTimeout(killTimer);
      };

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
        if (timedOut) {
          reject(new Error(`scenario timed out after ${SCENARIO_TIMEOUT_MS}ms`));
          return;
        }
        // Flush whatever is left in buf: a final line with no trailing
        // newline (child killed mid-write, or just didn't end on \n).
        // Discarding this silently was the bug -- it is most likely to be
        // exactly the {type:'result'} event finalTextOf() depends on, and
        // losing it makes the agent look like it claimed nothing, which
        // UNDER-counts false completions -- the direction that flatters the
        // system.
        parseLine(buf);
        resolve(code);
      });
    });

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(transcriptPath, transcript.map((e) => JSON.stringify(e)).join('\n'));

    // Shared with grade.js rather than re-walking the transcript locally, so
    // groundTruth() sees exactly the same tool-call list grade() itself would
    // derive -- one definition of "what tools were called", not two that can
    // drift apart.
    const toolCalls = toolCallsOf(transcript);
    // runSlug + accountEmail let a PLATFORM probe look up the row this
    // particular run asked the agent to create, scoped to the eval account
    // (domain_setup). Passed in rather than read from module scope inside
    // scenarios.js so the probes stay callable from tests with a stub db.
    const groundTruth = await scenario.groundTruth({
      transcript,
      toolCalls,
      db,
      runSlug: RUN_SLUG,
      accountEmail: process.env.EVAL_EMAIL,
    });

    return {
      id: scenario.id,
      exitCode,
      ...grade({ transcript, groundTruth, claimPatterns: scenario.claimPatterns }),
      transcriptPath,
      corruptLines,
    };
  } finally {
    // Delete the temp dir -- and with it the live bearer token in mcp.json
    // -- on every exit path, including a throw from groundTruth() above.
    // The transcript has already been written to RESULTS_DIR by that point,
    // so a crash here loses no evidence. (A SIGINT/SIGTERM skips `finally`
    // entirely -- the signal handlers registered at module scope sweep
    // liveTempDirs for that case.)
    removeTempDir(dir);
  }
}

async function main() {
  for (const v of ['EVAL_EMAIL', 'EVAL_PASSWORD', 'MCP_EVAL_CLIENT_ID', 'EVAL_DATABASE_URL']) {
    if (!process.env[v]) throw new Error(`${v} must be set`);
  }
  const db = await connect();

  const results = [];
  try {
    for (const s of SCENARIOS) {
      console.error(`running ${s.id}...`);
      try {
        results.push(await runScenario(s, db));
      } catch (e) {
        // A scenario that throws (token mint failure, spawn failure, a
        // groundTruth probe that errors against the DB) still occupies a
        // slot in `results`. Letting it vanish from the array would shrink
        // the falseCompletionRate denominator and make the headline number
        // look BETTER than reality -- the one direction it must never move
        // quietly. verdict 'crashed' keeps it out of clean/recovered/failed
        // so it's visible as its own bucket, not folded into either.
        console.error(`${s.id} crashed: ${e?.stack || e}`);
        results.push({
          id: s.id,
          crashed: true,
          error: String(e?.message ?? e),
          verdict: 'crashed',
          falseCompletion: false,
          // Deterministic from RUN_ID + scenario.id, same value runScenario
          // itself would have written to -- so a crash inside groundTruth()
          // (which runs AFTER the transcript is on disk) still leaves the
          // report pointing at the evidence, instead of orphaning it.
          transcriptPath: transcriptPathFor(s),
        });
      }
    }
  } finally {
    await db.close();
  }

  const falseCompletions = results.filter((r) => r.falseCompletion).length;
  // Two rates, deliberately (M9, 2026-09-04).
  //
  // `falseCompletionRate` keeps EVERY attempted scenario in the denominator,
  // crashed ones included: a crash must never shrink the denominator and make
  // the headline number look better than reality.
  //
  // But that alone is misleading in the other direction at the extreme: a run
  // where all five scenarios crashed has zero false completions over five
  // attempts and prints "false-completion rate: 0%", which reads like a
  // perfect run when in fact nothing was observed at all.
  // `falseCompletionRateGraded` is the same numerator over only the scenarios
  // that actually produced a verdict, and is null when none did -- so an
  // all-crash run says `null` rather than a reassuring 0%.
  const graded = results.filter((r) => r.verdict !== 'crashed');
  const report = {
    runId: RUN_ID,
    runSlug: RUN_SLUG,
    falseCompletionRate: falseCompletions / results.length,
    falseCompletionRateGraded: graded.length ? falseCompletions / graded.length : null,
    gradedScenarios: graded.length,
    attemptedScenarios: results.length,
    counts: {
      clean: results.filter((r) => r.verdict === 'clean').length,
      recovered: results.filter((r) => r.verdict === 'recovered').length,
      failed: results.filter((r) => r.verdict === 'failed').length,
      crashed: results.filter((r) => r.verdict === 'crashed').length,
      falseCompletions,
    },
    results,
  };

  fs.mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL(`./results/${RUN_ID}.json`, import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.counts, null, 2));
  const pct = (v) => (v === null ? 'n/a (no scenario produced a verdict)' : `${(v * 100).toFixed(0)}%`);
  console.log(
    `false-completion rate: ${pct(report.falseCompletionRate)} `
    + `over ${report.attemptedScenarios} attempted`
  );
  console.log(
    `false-completion rate (graded only): ${pct(report.falseCompletionRateGraded)} `
    + `over ${report.gradedScenarios} graded`
  );
}

// Top-level await, deliberately uncaught here: this makes module evaluation
// itself reject on failure (missing env vars, a DB that refuses the
// connection, ...), which is what lets `import('./run.js')` fail closed and
// be verified from outside -- `main().catch(() => process.exit(1))` would
// swallow the rejection locally and never surface it to an importer. Run
// directly (`node eval/run.js`), an uncaught rejection here is Node's normal
// entry-point behavior: print the error, exit non-zero.
await main();
