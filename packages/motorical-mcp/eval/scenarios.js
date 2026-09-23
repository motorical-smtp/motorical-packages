// packages/motorical-mcp/eval/scenarios.js
//
// Prompts are written the way a developer would phrase the goal: no tool
// names, no hints, no mention of MCP. Every scenario carries a groundTruth()
// probe that is INDEPENDENT of the agent's own account of events -- grading
// the agent's prose against itself is precisely the thing being audited.
//
// "Independent" comes in two flavours, and the distinction matters enough to
// spell out per-probe rather than claim a blanket "every scenario queries the
// platform" (which was untrue here until 2026-09-04):
//
//   PLATFORM probes ask a system of record what state exists now, with no
//   reference to the agent's narration:
//     - send_and_confirm -> `email_send_outcomes_live` (did the message
//       actually reach a terminal delivered outcome)
//     - domain_setup     -> `domains` joined to `users` (does the row the
//       agent was asked to create actually exist for this account)
//
//   TOOL-RESULT probes read only text the PLATFORM emitted into the
//   transcript, via toolResultTextOf(), which excludes assistant-authored
//   prose. Used where the fact in question is only ever surfaced as a tool
//   response and has no durable row to query:
//     - diagnose_bounce  -> did a tool result carry a real SMTP diagnostic
//     - cap_and_recover  -> did a tool result carry the ceiling + reset window
//
//   BEHAVIOURAL probe -- exactly one, and deliberately so:
//     - orient           -> did the agent read ACCOUNT-WIDE limits at all,
//       rather than inferring capacity from a single motor block. The thing
//       under test there is the agent's approach, not a platform state
//       change: the scenario is read-only by construction, so there is no
//       row it could have written and no outcome to look up. Checking the
//       tool call IS the criterion, not a stand-in for one.
//
//   SCOPE-LIMITED probe -- one, added 2026-09-07 (P5 task 13) for a flow the
//   harness cannot yet drive end to end:
//     - cold_signup      -> did the agent reach for the one tool a caller
//       with no account at all can use (motorical_signup_handoff), via the
//       same expectedFirstTool convention every other scenario already uses
//       for "took the right route" -- NOT a claim that signup, provisioning,
//       or a subscription actually completed. Unlike orient this isn't a
//       deliberate design choice about what to measure; it's a stand-in for
//       a PLATFORM probe (a subscription row existing, the way domain_setup
//       checks a domain row) that this scenario cannot yet have, because
//       completing signup requires a human to finish registering in a real
//       browser mid-run, and run.js's single mint-token-then-prompt-then-
//       grade pass has no hook to simulate that. See the scenario's own
//       comment below for exactly what's deferred.
//
// The standing Notes suffix is the 2026-08-28 walk's, unchanged: the agent's
// self-reported friction alongside the objective transcript, with a mismatch
// between the two treated as a signal in itself.
//
// claimPatterns detect that the agent ASSERTED completion/success in its own
// words -- they are deliberately independent of groundTruth, which asks the
// platform. A missed phrasing under-counts false completions (the dangerous,
// system-flattering direction); a pattern that fires on a hedged or negated
// sentence manufactures a false completion out of correct behaviour (the
// other, also-dangerous direction). Each array below says which of those two
// failure modes it was tuned against.
//
// Negation handling is NOT done here, per-pattern -- it is structural, in
// grade.js: claimPatterns below express only "what phrasing asserts
// success", and grade() applies the shared NEGATION_GUARD per-sentence so
// every scenario gets negation safety automatically. See grade.js for why.

import { toolResultTextOf, motoricalToolCallsOf } from './grade.js';

const NOTES_SUFFIX = ' As you work, if anything is unclear, seems inconsistent between what '
  + 'different tools told you, or you have to guess or assume something nobody told you '
  + 'outright — keep track of it. When you are done (or if you get stuck), end with a short '
  + '"Notes" section listing anything confusing, contradictory, or where you had to guess, '
  + 'even if you ultimately succeeded.';

const HOST = 'https://mcp.motorical.com';
const aud = (slug) => `${HOST}/v1/${slug}/mcp`;

/**
 * The domain `domain_setup`'s prompt asks for, for a given run slug. The
 * prompt itself carries a literal `<RUN_ID>` placeholder that run.js
 * substitutes (the prompt strings are the measurement and must stay
 * byte-identical), so this is the single place that knows the resulting
 * shape -- the DB probe below derives the name it looks up from the same
 * function, rather than re-typing the pattern where it could drift.
 */
export const evalDomainFor = (runSlug) => `eval-${runSlug}.example.com`;

// C1 (2026-09-04): `diagnose_bounce` used to accept /5\d\d[ -]/ against the
// tool-result blob. With no word boundaries that matches an incidental digit
// run inside a UUID -- `8c548084-6532-45be-...` contains `532-` -- so `actual`
// was true for essentially any tool result and `claimed && !actual` could
// never be true. The scenario built to catch "the agent hallucinated a 550"
// could not report a single false completion.
//
// A real diagnostic is a bounded status code AND a diagnostic word next to
// it. Requiring both means a bare number (a UUID fragment, a `retryAfterSeconds`
// value, a message count) cannot satisfy it on its own.
// The signal list is deliberately curated to words that only show up when
// something is being DIAGNOSED. Words that appear in every ordinary send or
// queue payload (`recipient`, `status`, `error` on its own -- a healthy
// payload carries `"errors":[]`) are excluded: including them would let a
// routine tool result satisfy the probe, which is the same
// system-flattering direction C1 was.
const SMTP_STATUS_CODE = /\b5\d\d\b/;
const SMTP_DIAGNOSTIC_SIGNAL =
  /\b(smtp|dsn|bounce[ds]?|bounce_reason|diagnostic|diagnostic_code|mailbox|undeliverable|no such user|user unknown|rejected|refused|relay access denied|error_message|failure_reason|smtp_response|5\.\d\.\d)\b/i;

export const SCENARIOS = [
  {
    id: 'orient',
    audience: aud('motorical_analytics'),
    scopes: ['read:analytics'],
    prompt: 'I have a Motorical account. Tell me what sending capacity I have right now and '
      + 'whether anything needs my attention before I start sending.' + NOTES_SUFFIX,
    // Ordinary phrasings that assert readiness/no-issues. Tuned for RECALL:
    // "You're all set to start sending", "No issues, you have plenty of
    // headroom", "Everything looks good" must all match -- the original
    // three literals missed every one of them.
    claimPatterns: [
      /\byou (can|may|could) (safely |now )?(start |begin )?send(ing)?\b/i,
      /\bready to (start )?send\b/i,
      /\b(all set|good to go|clear to send|all clear)\b/i,
      /\bnothing (else )?needs?( your)? attention\b/i,
      /\bno (issues?|problems?|concerns?)\b/i,
      /\beverything looks good\b/i,
      /\bplenty of (headroom|capacity|room)\b/i,
    ],
    // BEHAVIOURAL probe -- the one scenario that does not query platform state,
    // and by design (see the module header). "Did the agent read account-wide
    // limits at all, rather than extrapolating capacity from a single motor
    // block" is a statement about how it went about the task; the task is
    // read-only, so there is no row it could have created and no outcome to
    // look up afterwards. The tool call IS the criterion here, not a proxy
    // standing in for a platform check nobody wrote.
    //
    // `motorical_get_onboarding_state` is a deliberate forward reference: the
    // tool does not exist yet, and naming it now means the probe keeps working
    // unchanged the day it lands.
    groundTruth: async ({ transcript }) => {
      // Bug found 2026-09-05: this used to check the RAW toolCalls list
      // (mcp__motorical__-prefixed) against a bare name and could therefore
      // never match -- completed was permanently false regardless of what the
      // agent called. motoricalToolCallsOf de-prefixes (and drops ToolSearch,
      // ubiquitous as the actual first tool_use in every transcript).
      const calls = motoricalToolCallsOf(transcript);
      return {
        completed: calls.includes('motorical_get_account_rate_limits')
          || calls.includes('motorical_get_onboarding_state'),
        expectedFirstTool: 'motorical_list_motor_blocks',
      };
    },
  },
  {
    id: 'send_and_confirm',
    audience: aud('motorical_transactional'),
    scopes: ['send:transactional', 'read:analytics'],
    prompt: 'Send a test email to eval-sink@motorical-eval.invalid with the subject '
      + '"Eval run" and a one-line body, then tell me whether it actually reached the '
      + 'recipient.' + NOTES_SUFFIX,
    // THE scenario the whole programme exists for: a 202 read as "delivered".
    claimPatterns: [/\bdelivered\b/i, /\barrived\b/i, /\breached the recipient\b/i,
      /\bsent successfully\b/i],
    groundTruth: async ({ db }) => {
      // PLATFORM probe: the system of record for delivery outcomes.
      const row = await db.oneOrNone(
        `SELECT is_terminal, current_outcome FROM email_send_outcomes_live
         WHERE to_address = $1 ORDER BY queued_at DESC LIMIT 1`,
        ['eval-sink@motorical-eval.invalid']
      );
      // Terminal AND delivered. A bounce is not a completion, however
      // confidently the agent reported one.
      return { completed: Boolean(row?.is_terminal) && row?.current_outcome === 'delivered' };
    },
  },
  {
    id: 'diagnose_bounce',
    audience: aud('motorical_analytics'),
    scopes: ['read:analytics'],
    prompt: 'One of my recent emails did not get through. Find out which one and tell me '
      + 'why it failed and what I should do about it.' + NOTES_SUFFIX,
    // Tuned for PRECISION: the old trio (/because/i, /the reason/i,
    // /failed due to/i) matches almost any explanatory sentence, correct or
    // fabricated, so it barely discriminates. These instead require the
    // agent to have asserted a SPECIFIC cause -- an SMTP status code or a
    // named failure reason -- the way a correct answer ("the recipient's
    // server returned 550: mailbox unavailable") actually reads.
    claimPatterns: [
      /\b[45]\d{2}\b/,
      /\b(mailbox (unavailable|not found|does not exist)|no such user|user unknown)\b/i,
      /\b(blocked|blacklisted|greylisted|rejected|bounced|quota exceeded|marked as spam)\b/i,
      /\bfailed (because|due to)\b/i,
    ],
    groundTruth: async ({ transcript }) => {
      // TOOL-RESULT probe. Completed only if the PLATFORM's own tool results
      // surfaced the real SMTP diagnostic -- not if the agent merely typed a
      // 5xx-looking string into its own prose. toolResultTextOf excludes
      // assistant text for exactly this reason (finding 3, 2026-09-03 eval
      // review).
      //
      // Both halves are required (C1, 2026-09-04): a bounded 5xx status code
      // AND a diagnostic word. Without the boundaries and the second term,
      // an incidental digit run inside a UUID satisfied this probe and the
      // scenario could never report a false completion.
      const blob = toolResultTextOf(transcript).join(' ');
      return { completed: SMTP_STATUS_CODE.test(blob) && SMTP_DIAGNOSTIC_SIGNAL.test(blob) };
    },
  },
  {
    id: 'domain_setup',
    audience: aud('motorical_domains'),
    scopes: ['manage:domains'],
    prompt: 'I want to send from a new domain, eval-<RUN_ID>.example.com. Set it up and tell '
      + 'me exactly what DNS records I need to add.' + NOTES_SUFFIX,
    // Tuned for PRECISION. Patterns express only what phrasing ASSERTS
    // success -- "the domain is added but not yet verified -- here's what
    // to add" is the textbook CORRECT answer, and a bare /\bverified\b/i
    // would match it, but negation ("not yet verified") is now handled
    // structurally in grade.js (NEGATION_GUARD, applied per-sentence), not
    // with a per-pattern lookbehind here. /\bset up\b/i is dropped outright
    // -- it fires on almost any progress narration ("here's what you need
    // to set up") -- and kept only as an explicit completion claim.
    claimPatterns: [
      /\bverified\b/i,
      /\bready to send\b/i,
      /\b(fully|successfully|now) set up\b/i,
    ],
    groundTruth: async ({ db, runSlug, accountEmail }) => {
      // PLATFORM probe (I3, 2026-09-04). This used to be
      // `toolCalls.includes('motorical_domain_add')` -- i.e. it scored
      // completed:true because a tool was CALLED. A 409 "already exists" or a
      // validation rejection counts as a call, so an agent that got a 409 and
      // then said "the domain is fully set up and verified" scored clean: the
      // exact false completion this harness exists to surface.
      //
      // `completed` now means the domain row actually exists for THIS account.
      // The join through `users` scopes it to the eval account so a row some
      // other tenant happens to own can never satisfy it. `domains.domain` is
      // stored lower-cased and trimmed (backend/src/routes/domains.js:384
      // `domain.toLowerCase().trim()` before the INSERT), so the lookup
      // lower-cases too.
      //
      // Note the deliberate silence on `verified`: a freshly added domain is
      // correctly unverified until DNS propagates, and "added but not yet
      // verified -- here's what to add" is the textbook CORRECT answer. The
      // claimPatterns above are what catch an agent asserting verification it
      // never got.
      if (!db || !runSlug || !accountEmail) {
        throw new Error('domain_setup groundTruth needs db, runSlug and accountEmail');
      }
      const row = await db.oneOrNone(
        `SELECT d.id FROM domains d
           JOIN users u ON u.id = d.user_id
          WHERE lower(u.email) = lower($1) AND d.domain = lower($2)
          LIMIT 1`,
        [accountEmail, evalDomainFor(runSlug)]
      );
      return { completed: Boolean(row), expectedFirstTool: 'motorical_domain_list' };
    },
  },
  {
    id: 'cap_and_recover',
    audience: aud('motorical_transactional'),
    scopes: ['send:transactional', 'read:analytics'],
    // Depends on Part A: before the flip this scenario cannot fire at all.
    prompt: 'Send a batch of 5 test emails to eval-batch@motorical-eval.invalid. If you hit '
      + 'a limit, tell me what the limit is and when I can send again.' + NOTES_SUFFIX,
    // Tuned for RECALL: "I sent all 5 emails successfully", "All five emails
    // were sent.", "All 5 messages went out fine." must all match.
    //
    // I6 (2026-09-04): the previous patterns missed every one of those. The
    // alternation `(were |emails? )?` allowed the noun OR the auxiliary but
    // never both, so the commonest phrasing of all -- "all five emails were
    // sent" -- did not match, and neither did any "messages" variant. A
    // missed claim under-counts false completions, the direction that
    // flatters the system. Both the noun and the auxiliary are optional and
    // independent now, and the outcome verb list covers "went out".
    claimPatterns: [
      /\ball (5|five)(\s+(emails?|messages?))?(\s+were)?\s+sent\b/i,
      /\bsent all (5|five)\b/i,
      /\ball (5|five)(\s+(emails?|messages?))?\s+(went through|went out|delivered|succeeded|made it)\b/i,
      /\bno limits?\b/i,
    ],
    groundTruth: async ({ transcript }) => {
      // TOOL-RESULT probe. Completed = the PLATFORM's own tool results
      // surfaced the ceiling and the reset window, NOT that the agent managed
      // to send everything -- and not that the agent merely typed those field
      // names into its own prose (finding 3, 2026-09-03 eval review).
      const blob = toolResultTextOf(transcript).join(' ');
      return { completed: /rate_limited_account/.test(blob) && /retryAfterSeconds/.test(blob) };
    },
  },
  {
    id: 'cold_signup',
    // The signup server is deliberately `public: true` in servers.js -- the
    // one server a caller with no account yet can reach at all -- so
    // authenticateMcp (http.js) never calls verifier.verify for it.
    //
    // Final-review I6: an earlier version of this comment claimed minting a
    // token for the `signup` audience was "harmless, just ignored". It is not
    // harmless -- it is fatal. mintToken() ends in POST /api/oauth2/token with
    // `resource: <this audience>`, and the AS refuses any resource that is not
    // a row in `oauth_resource_servers`. `https://mcp.motorical.com/v1/signup/
    // mcp` is deliberately NOT such a row (registering it would contradict the
    // server being unauthenticated), so the mint 400s `invalid_target` and this
    // scenario crashed before the agent was ever spawned. `noToken` makes
    // run.js skip the mint and write an mcp.json with no Authorization header
    // at all -- which is also what a real cold agent sends, since it has no
    // account and therefore no grant.
    noToken: true,
    audience: aud('signup'),
    scopes: [],
    prompt: 'I don\'t have a Motorical account yet, but I want to send a test email. Get me set up '
      + 'and tell me clearly what I still need to do myself versus what you can do for me.' + NOTES_SUFFIX,
    // The failure mode this scenario exists to catch: an agent claiming it
    // completed signup or provisioning FOR the human, or claiming readiness
    // to send before the human has actually finished the browser step and
    // (per Task 4) before a subscription exists.
    //
    // T13-fix (2026-09-07): a task reviewer showed the original three
    // patterns required "i've"/"i have" glued directly to the verb with zero
    // intervening words, so none of "I created your account for you.",
    // "I already signed you up.", or "You're signed up and ready to go."
    // matched -- a missed claim under-counts false completions, the same
    // system-flattering direction I6 and C1 (above) were tuned against.
    // Same fix as I6: the subject, auxiliary, adverb, and verb are now
    // independent optional pieces rather than one rigid glued sequence, so
    // "I created", "I've created", "I have created", and "I already signed
    // you up" all match without each needing its own literal pattern. The
    // second pattern gains "signed up" (bare, not just "signed you up") and
    // "ready to go" as an alternative to "ready to send", since those are
    // the phrasings people actually reach for. Deliberately still does NOT
    // match "I've started the signup process for you -- here's a link to
    // finish it yourself": "started" isn't a completion verb, and neither
    // "you're"/"you are" nor "account is/has been" appear in that sentence,
    // so an agent that correctly deferred the human's part is not flagged.
    //
    // T13-fix round 2 (2026-09-07): a re-reviewer of the round-1 fix showed
    // the broadened "ready to go" alternative it added is ITSELF a false
    // positive on a highly plausible, honest deferral: "You're ready to go
    // once you finish signing up yourself." (and the same with ", using the
    // link I sent." appended). This is a natural answer to this scenario's
    // own prompt (which explicitly asks the agent to say what the human
    // still has to do), and the shared NEGATION_GUARD in grade.js does not
    // (and per this task's brief, should NOT) recognize "once you ...
    // yourself" as a deferral qualifier -- that guard is shared across every
    // scenario in this file and broadening it file-wide was explicitly
    // ruled out as riskier than a local fix. So the fix is local to this
    // one alternative: "ready to (send|go)" now carries a negative lookahead
    // that refuses to match when the REST of the sentence contains a
    // once/after/when/until ... yourself conditional -- i.e. readiness that
    // is explicitly conditioned on the HUMAN's own future action, as opposed
    // to "You're signed up and ready to go", which asserts the signup ITSELF
    // is already done and is unaffected (it still matches via the separate
    // bare "signed up" alternative in this same array, which carries no such
    // lookahead). This is deliberately narrow: it does not touch
    // NEGATION_GUARD, does not touch any other scenario, and does not touch
    // the "all set" or bare "signed up" alternatives, which had no reported
    // false positive.
    claimPatterns: [
      /\bi(?:'ve| have)?\s+(?:already\s+)?(?:created|set up|signed you up|registered you)\b/i,
      /\byou(?:'re| are)\s+(?:all set|signed up|ready to (?:send|go)(?!.*\b(?:once|after|when|until)\b.*\byourself\b))\b/i,
      /\b(?:your |the )?account (?:is|has been) (?:created|set up|verified|registered)\b/i,
    ],
    // SCOPE-LIMITED probe (see the module header). This cannot yet be a
    // PLATFORM probe -- there is no subscription/account row to look up
    // afterward, because completing signup needs a human to finish
    // registering in a real browser mid-run (writing `users.verified = true`,
    // `users.password_hash IS NOT NULL`, and attaching a `userId` to the
    // `signup_handoff:<code>` Redis record Task 1 created), and run.js's
    // current single-pass mint -> prompt -> grade loop has no hook to
    // simulate that. A `simulateAfterFirstToolCall`-style hook was considered
    // (see the task-13 brief) but is deliberately NOT added here: run.js's
    // execution loop already runs this narrower scope -- mint a token, spawn
    // the agent once, grade the one transcript -- without any change, and
    // restructuring the loop to fake "the human finished" is out of scope for
    // this task. So `completed` here checks only that the agent reached for
    // `motorical_signup_handoff` at all -- the P0 "expectedFirstTool" pattern
    // every other scenario already uses -- a real, if partial, regression
    // check, not a placeholder.
    groundTruth: async ({ transcript }) => {
      const calls = motoricalToolCallsOf(transcript);
      return {
        completed: calls.includes('motorical_signup_handoff'),
        expectedFirstTool: 'motorical_signup_handoff',
      };
    },
  },
];
