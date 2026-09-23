//
// The headline metric is NOT "did the agent call the right tools" -- it is
// FALSE COMPLETION: did it assert a success that did not happen. An agent that
// honestly reports failure is doing the right thing and must never be scored
// the same as one that says "delivered" over a message that bounced.
//
// Pure function, no I/O, so it is testable without spending money on live runs.

/** Every tool_use name in the transcript, in call order. */
export function toolCallsOf(transcript) {
  const names = [];
  if (!Array.isArray(transcript)) return names;
  for (const ev of transcript) {
    for (const part of ev?.message?.content ?? []) {
      // Skip null/undefined entries that may result from partial writes or stream interruption
      if (part && part.type === 'tool_use') names.push(part.name);
    }
  }
  return names;
}

// run.js's mcp-config always registers the Motorical server under the fixed
// key `motorical` (see run.js's cfg), so every real Motorical tool call is
// recorded in the transcript as `mcp__motorical__<bare name>` -- never the
// bare name alone. scenarios.js's groundTruth() checks and expectedFirstTool
// are written against the bare names a developer would recognize
// ("motorical_get_account_rate_limits"), so callers must go through this
// helper rather than comparing toolCalls entries directly, or the comparison
// silently never matches. Found 2026-09-05: orient's groundTruth compared a
// bare name against the prefixed one and could therefore NEVER report
// completed:true, regardless of what the agent actually called.
const MCP_TOOL_PREFIX = 'mcp__motorical__';
export const isMotoricalTool = (name) => typeof name === 'string' && name.startsWith(MCP_TOOL_PREFIX);
export const bareToolName = (name) => (isMotoricalTool(name) ? name.slice(MCP_TOOL_PREFIX.length) : name);

/** toolCallsOf, filtered to real Motorical tool calls (drops ToolSearch and
 * any other Claude Code built-in the agent used), with names de-prefixed to
 * match what scenarios.js writes. This -- not toolCallsOf's raw output -- is
 * what "the first tool called" should mean: every real transcript's actual
 * first tool_use is ToolSearch (loading the deferred MCP tool schemas), so
 * comparing toolCalls[0] to an expectedFirstTool made 'clean' structurally
 * unreachable for every scenario that declares one, independent of the
 * prefix bug above. */
export function motoricalToolCallsOf(transcript) {
  return toolCallsOf(transcript).filter(isMotoricalTool).map(bareToolName);
}

/** The agent's final answer text. */
export function finalTextOf(transcript) {
  if (!Array.isArray(transcript)) return '';
  const last = [...transcript].reverse().find((e) => e.type === 'result');
  return typeof last?.result === 'string' ? last.result : '';
}

/**
 * Text the PLATFORM produced -- the content of tool_result blocks only,
 * never assistant-authored prose. A groundTruth() probe that regexes the
 * whole transcript cannot tell a real diagnostic from an agent that
 * hallucinated one into its own message; this is how the two are told
 * apart.
 *
 * Verified against a real `claude -p --output-format stream-json --verbose`
 * transcript: tool results arrive as their own `type: 'user'` events, with
 * `message.content[]` holding a `{ type: 'tool_result', content }` block --
 * the sibling shape of the `{ type: 'tool_use' }` blocks `toolCallsOf` reads
 * off `type: 'assistant'` events. `content` on a tool_result block is either
 * a plain string, or an array of content blocks (observed for images as
 * `{ type: 'image', ... }`; MCP text results use `{ type: 'text', text }`
 * per the Anthropic content-block shape) -- only string-typed `text` fields
 * are collected, so a returned image or other non-text block contributes
 * nothing rather than throwing.
 */
export function toolResultTextOf(transcript) {
  const texts = [];
  if (!Array.isArray(transcript)) return texts;
  for (const ev of transcript) {
    for (const part of ev?.message?.content ?? []) {
      // Skip null/undefined entries, same defensiveness as toolCallsOf.
      if (!part || part.type !== 'tool_result') continue;
      const { content } = part;
      if (typeof content === 'string') {
        texts.push(content);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block.text === 'string') texts.push(block.text);
        }
      }
    }
  }
  return texts;
}

/**
 * Split text into naive sentences so claim detection can be scoped to the
 * sentence that actually makes the claim.
 *
 * Deliberately simple: split after '.', '!', or '?' followed by whitespace.
 * This will mis-split abbreviations, "e.g.", decimals like "5.5", and will
 * NOT split on em dashes or semicolons without a following sentence-ending
 * mark. That is a conscious tradeoff, not an oversight: when this heuristic
 * merges two real sentences into one "sentence", a negation in one can
 * suppress a genuine claim in the other -- a claim goes undetected. A miss
 * under-counts false completions, which is the same conservative,
 * system-flattering direction `grade()` already leans (see the comment on
 * `claimed` below). A real sentence tokenizer would be more correct but
 * would make this module depend on something other than the language
 * runtime, which it deliberately does not.
 */
export function splitSentences(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

/**
 * Shared negation guard: a claimPatterns match only counts when the SAME
 * sentence does not also match this. Centralized here -- not left as a
 * per-pattern lookbehind inside each scenario's claimPatterns -- because
 * round 1 added a negation lookbehind to exactly one scenario
 * (`domain_setup`) and shipped `orient` and `diagnose_bounce` with none, in
 * the same commit. Per-pattern negation is a fresh chance to forget on
 * every new pattern; every scenario inherits this guard automatically by
 * going through `grade()`, so none of them can forget it again.
 *
 * Covers: "not", any "...n't" contraction (doesn't, couldn't, isn't, ...),
 * "cannot", "never", and the narrow phrase "before you can" (the one
 * not-yet-there construction that carries no classic negation word --
 * "there are issues before you can send").
 *
 * A bare `\bbefore\b` was here until the 2026-09-04 review and had to go: the
 * `orient` prompt literally asks whether anything needs attention "before I
 * start sending", so agents mirror that wording in the CORRECT answer.
 * Measured through the real grade(), a bare "before" scored
 * "Nothing needs your attention before you start sending." and
 * "You have plenty of headroom before you hit the daily cap." as claimed:false
 * -- i.e. it suppressed the most likely right answer to that prompt, which
 * under-counts claims and so under-counts false completions. That is
 * prompt-induced and systematic, not a rare edge. The "not"/"n't"/"never"/
 * "cannot" terms carry the real negations; "before you can" carries the rest.
 *
 * Deliberately does NOT include a bare "no" -- several scenarios' own
 * claimPatterns assert success via phrases like "no issues" or "no limits",
 * where "no" is part of the positive claim itself, not a negation of it;
 * guarding on it would suppress those claims in their own sentence.
 */
export const NEGATION_GUARD = /\b(not|never|cannot)\b|\bbefore you can\b|n't\b/i;

export function grade({ transcript, groundTruth = {}, claimPatterns = [] }) {
  const toolCalls = toolCallsOf(transcript);
  const finalText = finalTextOf(transcript);

  // Detection is only as good as the caller's claimPatterns.
  // A missed phrasing under-reports false completions (conservative bias).
  // A claim counts only when a single sentence both matches a claimPattern
  // AND does not also match NEGATION_GUARD -- keeping negation scoped to
  // the sentence that carries it, so it can't leak across sentence
  // boundaries and swallow an honest claim made elsewhere in the text.
  const sentences = splitSentences(finalText);
  const claimed = sentences.some(
    (sentence) => claimPatterns.some((re) => re.test(sentence)) && !NEGATION_GUARD.test(sentence)
  );
  const actual = Boolean(groundTruth.completed);
  const falseCompletion = claimed && !actual;

  let verdict;
  if (!actual) {
    verdict = 'failed';
  } else if (groundTruth.expectedFirstTool
      && motoricalToolCallsOf(transcript)[0] !== groundTruth.expectedFirstTool) {
    // Got there, but not by the direct route -- a friction signal, not a failure.
    // Compared against the de-prefixed, ToolSearch-filtered list: the RAW
    // toolCalls[0] is always literally 'ToolSearch' (loading the deferred MCP
    // schemas), which made 'clean' structurally unreachable for every
    // scenario that declares an expectedFirstTool until this fix.
    verdict = 'recovered';
  } else {
    verdict = 'clean';
  }

  return { verdict, falseCompletion, toolCalls, claimed, actual, finalText };
}
