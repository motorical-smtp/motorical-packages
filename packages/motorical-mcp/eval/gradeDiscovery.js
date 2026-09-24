// packages/motorical-mcp/eval/gradeDiscovery.js
//
// UNTESTED AGAINST A LIVE TRANSCRIPT as of 2026-09-24 — see
// discoveryScenarios.js's header. Pure functions, no I/O, so at least
// testable offline against a hand-written fake transcript before spending
// money on a real run (grade.js's own comment makes the same point about
// its sibling module).
//
// Grades what design §10's Level 2 acceptance actually asks for: did the
// agent reach the hub (or an equivalent correct answer) quickly, pick the
// right route, restate the core definition, and never claim MCP support for
// something that doesn't have it. Unlike grade.js's false-completion check
// (which has a PLATFORM ground truth to query), there is no database row
// that proves "the agent picked the right route" — correctness here is
// read from the transcript itself: which URLs it fetched, and what its
// final answer says. That is a real limitation, not an oversight; keep the
// checks conservative (specific strings/hosts) rather than inferring intent.

import { finalTextOf } from './grade.js';

const HUB_URL = 'docs.motorical.com/agents';
const HOSTED_MCP_HOST = 'mcp.motorical.com';
const RETIRED_CLI_NAME = '@motorical/cli';

/** Every URL the agent fetched (WebFetch tool_use inputs) or mentioned in its final answer. */
function urlsTouchedIn(transcript) {
  const urls = new Set();
  if (!Array.isArray(transcript)) return urls;
  for (const ev of transcript) {
    for (const part of ev?.message?.content ?? []) {
      if (part?.type === 'tool_use' && part.name === 'WebFetch' && typeof part.input?.url === 'string') {
        urls.add(part.input.url);
      }
    }
  }
  const final = finalTextOf(transcript);
  for (const match of final.matchAll(/https?:\/\/[^\s)"'<>]+/g)) urls.add(match[0]);
  return urls;
}

/**
 * gradeDiscovery({ transcript, scenario }) -> {
 *   reachedHub: boolean,          // fetched or named docs.motorical.com/agents
 *   nameadHostedMcp: boolean,     // named mcp.motorical.com anywhere
 *   suggestedRetiredCli: boolean, // named @motorical/cli — always a failure
 *   finalText: string,            // for a human to read alongside the flags
 * }
 *
 * Deliberately returns raw signal, not a single pass/fail verdict — design
 * §10's pass criteria differ per scenario (the shell-only and
 * communications-honesty scenarios have their own extra conditions, noted
 * in each scenario's `note` field), so a human or a scenario-specific
 * checker composes these into a verdict, the same division of labor
 * scenarios.js's per-scenario groundTruth() already has relative to
 * grade.js's shared grade().
 */
export function gradeDiscovery({ transcript, scenario }) {
  const urls = urlsTouchedIn(transcript);
  const finalText = finalTextOf(transcript);
  const haystack = `${[...urls].join(' ')} ${finalText}`.toLowerCase();

  return {
    scenarioId: scenario.id,
    reachedHub: haystack.includes(HUB_URL),
    namedHostedMcp: haystack.includes(HOSTED_MCP_HOST),
    suggestedRetiredCli: haystack.includes(RETIRED_CLI_NAME.toLowerCase()),
    urlsTouched: [...urls],
    finalText,
  };
}
