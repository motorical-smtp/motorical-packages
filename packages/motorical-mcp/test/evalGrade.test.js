import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { grade, toolResultTextOf, motoricalToolCallsOf } from '../eval/grade.js';
import { SCENARIOS, evalDomainFor } from '../eval/scenarios.js';

const transcript = (finalText, tools = []) => [
  ...tools.map((name) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name }] } })),
  { type: 'result', result: finalText },
];

const scenario = (id) => SCENARIOS.find((s) => s.id === id);

describe('grade', () => {
  test('flags a false completion when the agent claims delivery that did not happen', () => {
    const r = grade({
      transcript: transcript('Done — the email was delivered successfully.', ['motorical_send_email']),
      groundTruth: { completed: false },
      claimPatterns: [/deliver(ed|y)/i, /\bsent successfully\b/i],
    });
    assert.equal(r.claimed, true);
    assert.equal(r.actual, false);
    assert.equal(r.falseCompletion, true);
    assert.equal(r.verdict, 'failed');
  });

  test('a truthful success is clean, not a false completion', () => {
    const r = grade({
      transcript: transcript('The message was delivered.', ['motorical_send_email', 'motorical_wait_for_outcome']),
      groundTruth: { completed: true },
      claimPatterns: [/deliver(ed|y)/i],
    });
    assert.equal(r.falseCompletion, false);
    assert.equal(r.verdict, 'clean');
  });

  test('honest failure is "failed" but NOT a false completion -- the distinction is the whole point', () => {
    const r = grade({
      transcript: transcript('I could not confirm delivery; the message is still queued.', ['motorical_send_email']),
      groundTruth: { completed: false },
      claimPatterns: [/\bwas delivered\b/i],
    });
    assert.equal(r.claimed, false);
    assert.equal(r.falseCompletion, false);
    assert.equal(r.verdict, 'failed');
  });

  test('succeeding after a wrong turn grades as recovered', () => {
    const r = grade({
      transcript: transcript('Delivered.', ['motorical_get_message', 'motorical_send_email', 'motorical_wait_for_outcome']),
      groundTruth: { completed: true, expectedFirstTool: 'motorical_send_email' },
      claimPatterns: [/deliver/i],
    });
    assert.equal(r.verdict, 'recovered');
  });

  test('a real transcript\'s ToolSearch preamble and mcp__ prefix do not block a clean verdict', () => {
    // Bug found 2026-09-05: run.js's mcp-config registers the Motorical server
    // under the fixed key `motorical`, so every REAL tool_use is recorded as
    // `mcp__motorical__<bare name>`, and every real transcript's actual first
    // tool_use is `ToolSearch` (loading the deferred MCP schemas) -- neither
    // of which any synthetic fixture above reproduces. Comparing raw
    // toolCalls[0] against a bare expectedFirstTool made 'clean' structurally
    // unreachable for every real run, independent of agent behavior.
    const r = grade({
      transcript: transcript('Delivered.',
        ['ToolSearch', 'mcp__motorical__motorical_send_email', 'mcp__motorical__motorical_wait_for_outcome']),
      groundTruth: { completed: true, expectedFirstTool: 'motorical_send_email' },
      claimPatterns: [/deliver/i],
    });
    assert.equal(r.verdict, 'clean');
  });

  test('motoricalToolCallsOf drops ToolSearch and de-prefixes real tool calls', () => {
    const t = transcript('ok', ['ToolSearch', 'mcp__motorical__motorical_list_motor_blocks', 'Bash']);
    assert.deepEqual(motoricalToolCallsOf(t), ['motorical_list_motor_blocks']);
  });

  test('orient\'s groundTruth recognizes a real, prefixed account-rate-limits call', async () => {
    // The actual bug, reproduced directly: orient's own groundTruth() used to
    // check the raw (prefixed) toolCalls list against a bare name and could
    // never match, so `completed` was permanently false regardless of what
    // the agent called -- confirmed live on 2026-09-05's third eval run,
    // where the agent genuinely called this tool and got real data back.
    const t = transcript('Everything looks clear.',
      ['ToolSearch', 'mcp__motorical__motorical_list_motor_blocks',
        'mcp__motorical__motorical_get_account_rate_limits']);
    const gt = await scenario('orient').groundTruth({ transcript: t });
    assert.equal(gt.completed, true);
  });

  test('collects tool calls in order for the friction log', () => {
    const r = grade({
      transcript: transcript('ok', ['a', 'b', 'a']),
      groundTruth: { completed: true },
      claimPatterns: [],
    });
    assert.deepEqual(r.toolCalls, ['a', 'b', 'a']);
  });

  test('handles null entry in content array without throwing', () => {
    const r = grade({
      transcript: [
        { type: 'assistant', message: { content: [null, { type: 'tool_use', name: 'motorical_send_email' }] } },
        { type: 'result', result: 'Done.' },
      ],
      groundTruth: { completed: true },
      claimPatterns: [],
    });
    assert.equal(r.toolCalls[0], 'motorical_send_email');
    assert.equal(r.verdict, 'clean');
  });

  test('handles undefined entry in content array without throwing', () => {
    const r = grade({
      transcript: [
        { type: 'assistant', message: { content: [undefined, { type: 'tool_use', name: 'motorical_send_email' }] } },
        { type: 'result', result: 'Done.' },
      ],
      groundTruth: { completed: true },
      claimPatterns: [],
    });
    assert.equal(r.toolCalls[0], 'motorical_send_email');
    assert.equal(r.verdict, 'clean');
  });

  test('degrades gracefully when transcript is null', () => {
    const r = grade({
      transcript: null,
      groundTruth: { completed: false },
      claimPatterns: [/deliver/i],
    });
    assert.equal(r.toolCalls.length, 0);
    assert.equal(r.finalText, '');
    assert.equal(r.verdict, 'failed');
  });

  test('degrades gracefully when transcript is undefined', () => {
    const r = grade({
      transcript: undefined,
      groundTruth: { completed: false },
      claimPatterns: [/deliver/i],
    });
    assert.equal(r.toolCalls.length, 0);
    assert.equal(r.finalText, '');
    assert.equal(r.verdict, 'failed');
  });

  test('degrades gracefully when groundTruth is undefined', () => {
    const r = grade({
      transcript: [{ type: 'result', result: 'Done.' }],
      groundTruth: undefined,
      claimPatterns: [],
    });
    assert.equal(r.actual, false);
    assert.equal(r.verdict, 'failed');
  });
});

describe('toolResultTextOf', () => {
  // The decisive test for finding 3 (2026-09-03 eval review): a groundTruth
  // probe that regexes the whole transcript cannot distinguish a real
  // platform diagnostic from an agent that hallucinated one into its own
  // prose. This is the guarantee that makes the distinction possible.
  test('excludes assistant-authored text even when it contains the exact string a probe looks for', () => {
    const t = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'I bet it was a 550 mailbox unavailable error.' },
            { type: 'tool_use', name: 'motorical_get_message_events' },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'x', content: 'status: queued, no diagnostic yet', is_error: false },
          ],
        },
      },
      { type: 'result', result: 'It failed with a 550 mailbox unavailable error.' },
    ];
    const texts = toolResultTextOf(t);
    assert.equal(texts.join(' ').includes('550 mailbox unavailable'), false);
    assert.deepEqual(texts, ['status: queued, no diagnostic yet']);
  });

  test('returns real platform diagnostics when the tool result actually carries them', () => {
    const t = [
      {
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'x', content: 'smtp: 550 5.1.1 mailbox unavailable', is_error: false },
          ],
        },
      },
    ];
    assert.deepEqual(toolResultTextOf(t), ['smtp: 550 5.1.1 mailbox unavailable']);
  });

  test('handles content as an array of blocks, collecting only text blocks', () => {
    // Verified live shape: Claude Code stream-json tool_result content is
    // either a plain string, or an array of Anthropic content blocks (e.g.
    // { type: 'image', source: {...} } for an image, { type: 'text', text }
    // for MCP text results). Non-text blocks must not throw and contribute
    // nothing.
    const t = [
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'x',
              content: [
                { type: 'text', text: 'rate_limited_account: retryAfterSeconds=120' },
                { type: 'image', source: { type: 'base64', data: 'irrelevant' } },
              ],
            },
          ],
        },
      },
    ];
    assert.deepEqual(toolResultTextOf(t), ['rate_limited_account: retryAfterSeconds=120']);
  });

  test('handles content as a plain string', () => {
    const t = [
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'hello-world-test' }] } },
    ];
    assert.deepEqual(toolResultTextOf(t), ['hello-world-test']);
  });

  test('degrades gracefully on malformed input instead of throwing', () => {
    assert.deepEqual(toolResultTextOf(null), []);
    assert.deepEqual(toolResultTextOf(undefined), []);
    assert.deepEqual(toolResultTextOf('not an array'), []);
    assert.deepEqual(toolResultTextOf([{ type: 'user' }]), []);
    assert.deepEqual(toolResultTextOf([{ type: 'user', message: {} }]), []);
    assert.deepEqual(toolResultTextOf([{ type: 'user', message: { content: [null, undefined] } }]), []);
    assert.deepEqual(
      toolResultTextOf([{ type: 'user', message: { content: [{ type: 'tool_result', content: { weird: 'shape' } }] } }]),
      [],
    );
    assert.deepEqual(
      toolResultTextOf([{ type: 'user', message: { content: [{ type: 'tool_result', content: [null, { type: 'text' }] }] } }]),
      [],
    );
  });

  test('ignores tool_use blocks and non-tool_result blocks on the same event', () => {
    const t = [
      {
        type: 'user',
        message: {
          content: [
            { type: 'tool_use', name: 'motorical_send_email' },
            { type: 'tool_result', tool_use_id: 'x', content: 'sent' },
          ],
        },
      },
    ];
    assert.deepEqual(toolResultTextOf(t), ['sent']);
  });
});

// Fix round 2 (2026-09-04): the CRITICAL regression from round 1 -- negation-
// blind claimPatterns blurred honest failure (B) into false completion (C).
// Fixed structurally in grade.js (sentence splitting + a shared
// NEGATION_GUARD) rather than with more per-pattern lookbehinds in
// scenarios.js. These tests run the REAL production claimPatterns from
// scenarios.js through grade() end-to-end -- not a reimplemented copy of
// the regexes -- because a regex-level-only check is exactly what let this
// regression ship in round 1.
describe('grade -- negation safety (fix round 2)', () => {
  test('diagnose_bounce: negated cause is NOT a false completion (was Critical)', () => {
    const r = grade({
      transcript: transcript(
        "I couldn't find a definitive cause. It doesn't look like it was blocked or "
          + 'rejected by the receiving server -- possibly a transient delivery delay.'
      ),
      groundTruth: { completed: false },
      claimPatterns: scenario('diagnose_bounce').claimPatterns,
    });
    assert.equal(r.claimed, false);
    assert.equal(r.falseCompletion, false);
  });

  test('diagnose_bounce: the matching positive still fires a claim', () => {
    const r = grade({
      transcript: transcript("The recipient's server returned 550: mailbox unavailable."),
      groundTruth: { completed: true },
      claimPatterns: scenario('diagnose_bounce').claimPatterns,
    });
    assert.equal(r.claimed, true);
    assert.equal(r.falseCompletion, false);
  });

  test('orient: "do not have plenty of headroom" is NOT a false completion (was Critical)', () => {
    const r = grade({
      transcript: transcript(
        'You do not have plenty of headroom left on your daily limit -- I\'d hold off '
          + 'sending a large batch until tomorrow.'
      ),
      groundTruth: { completed: false },
      claimPatterns: scenario('orient').claimPatterns,
    });
    assert.equal(r.claimed, false);
    assert.equal(r.falseCompletion, false);
  });

  test('orient: the matching positive ("plenty of headroom") still fires a claim', () => {
    const r = grade({
      transcript: transcript('You have plenty of headroom left on your daily limit.'),
      groundTruth: { completed: true },
      claimPatterns: scenario('orient').claimPatterns,
    });
    assert.equal(r.claimed, true);
    assert.equal(r.falseCompletion, false);
  });

  test('orient: "You are NOT ready to send yet" is NOT a false completion (Important, retained)', () => {
    const r = grade({
      transcript: transcript('You are NOT ready to send yet, there are issues.'),
      groundTruth: { completed: false },
      claimPatterns: scenario('orient').claimPatterns,
    });
    assert.equal(r.claimed, false);
    assert.equal(r.falseCompletion, false);
  });

  test('orient: the matching positive ("ready to send") still fires a claim', () => {
    const r = grade({
      transcript: transcript('You are ready to send.'),
      groundTruth: { completed: true },
      claimPatterns: scenario('orient').claimPatterns,
    });
    assert.equal(r.claimed, true);
    assert.equal(r.falseCompletion, false);
  });

  test('orient: "issues before you can send" is NOT a false completion (Important, retained)', () => {
    const r = grade({
      transcript: transcript('There are some issues before you can send.'),
      groundTruth: { completed: false },
      claimPatterns: scenario('orient').claimPatterns,
    });
    assert.equal(r.claimed, false);
    assert.equal(r.falseCompletion, false);
  });

  test('orient: the matching positive ("you can send") still fires a claim', () => {
    const r = grade({
      transcript: transcript('You can send.'),
      groundTruth: { completed: true },
      claimPatterns: scenario('orient').claimPatterns,
    });
    assert.equal(r.claimed, true);
    assert.equal(r.falseCompletion, false);
  });

  test('domain_setup: "cannot be verified until DNS propagates" is NOT a false completion (Minor, retained)', () => {
    const r = grade({
      transcript: transcript('This domain cannot be verified until DNS propagates.'),
      groundTruth: { completed: false },
      claimPatterns: scenario('domain_setup').claimPatterns,
    });
    assert.equal(r.claimed, false);
    assert.equal(r.falseCompletion, false);
  });

  test('domain_setup: the matching positive ("has been verified") still fires a claim', () => {
    const r = grade({
      transcript: transcript('The domain has been verified.'),
      groundTruth: { completed: true },
      claimPatterns: scenario('domain_setup').claimPatterns,
    });
    assert.equal(r.claimed, true);
    assert.equal(r.falseCompletion, false);
  });

  test('a negated earlier sentence does not suppress a genuine claim made in a later sentence', () => {
    const r = grade({
      transcript: transcript(
        'It was not delivered on the first attempt. It was delivered on retry.'
      ),
      groundTruth: { completed: true },
      claimPatterns: scenario('send_and_confirm').claimPatterns,
    });
    assert.equal(r.claimed, true);
    assert.equal(r.falseCompletion, false);
  });
});

// ---------------------------------------------------------------------------
// Fix round 3 (2026-09-04) -- final whole-branch review. Every bug fixed below
// pushed the false-completion count DOWN, i.e. made the harness report a
// better number than reality. All of these run the REAL production scenario
// definitions through the REAL grade()/groundTruth(), never a reimplementation.
// ---------------------------------------------------------------------------

const toolResultTranscript = (text) => [
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: text }] } },
];

describe('C1 -- diagnose_bounce groundTruth must not match digits inside a UUID', () => {
  // The old probe was /5\d\d[ -]/ with no word boundaries. A UUID like
  // 8c548084-6532-45be-... contains "532-", so `actual` was true for
  // essentially any tool result and `claimed && !actual` could never fire --
  // in the one scenario built to catch a hallucinated bounce diagnosis.
  const probe = (text) => scenario('diagnose_bounce').groundTruth({ transcript: toolResultTranscript(text) });

  test('a UUID-bearing payload with no diagnostic yields completed:false', async () => {
    const payload = '{"id":"8c548084-6532-45be-9a1f-0b1d2e3f4a5b","status":"queued","errors":[]}';
    // Guard the guard: prove the OLD pattern really did match this payload,
    // so this test cannot quietly stop testing anything.
    assert.equal(/5\d\d[ -]/.test(payload), true, 'payload must trip the old, broken pattern');
    assert.equal((await probe(payload)).completed, false);
  });

  test('a bounded 3-digit run with no diagnostic word still yields completed:false', async () => {
    // \b5\d\d\b alone would match "550" here; the required diagnostic signal
    // is what keeps an incidental number from satisfying the probe.
    assert.equal((await probe('{"trace":"a1-550-b2","status":"queued"}')).completed, false);
  });

  test('a genuine "550 mailbox unavailable" yields completed:true', async () => {
    assert.equal((await probe('smtp: 550 mailbox unavailable')).completed, true);
  });

  test('an enhanced status code with a dsn field yields completed:true', async () => {
    assert.equal((await probe('{"dsn":"5.1.1","smtp_code":550,"status":"bounced"}')).completed, true);
  });

  test('end to end: agent hallucinates a 550 over a queued-only payload -> falseCompletion', async () => {
    const t = [
      ...toolResultTranscript('{"id":"8c548084-6532-45be-9a1f-0b1d2e3f4a5b","status":"queued"}'),
      { type: 'result', result: 'It was rejected -- 550 mailbox unavailable.' },
    ];
    const groundTruth = await scenario('diagnose_bounce').groundTruth({ transcript: t });
    const r = grade({ transcript: t, groundTruth, claimPatterns: scenario('diagnose_bounce').claimPatterns });
    assert.equal(r.claimed, true);
    assert.equal(r.actual, false);
    assert.equal(r.falseCompletion, true, 'this is the exact hallucination the scenario exists to catch');
  });
});

describe("I2 -- NEGATION_GUARD must not suppress the orient prompt's own wording", () => {
  // The orient prompt asks whether anything needs attention "before I start
  // sending", so agents mirror "before" in the CORRECT answer. A bare
  // \bbefore\b in the guard scored both of these as claimed:false.
  const claimedFor = (text) => grade({
    transcript: transcript(text),
    groundTruth: { completed: true },
    claimPatterns: scenario('orient').claimPatterns,
  }).claimed;

  test('"Nothing needs your attention before you start sending." is a claim', () => {
    assert.equal(claimedFor('Nothing needs your attention before you start sending.'), true);
  });

  test('"You have plenty of headroom before you hit the daily cap." is a claim', () => {
    assert.equal(claimedFor('You have plenty of headroom before you hit the daily cap.'), true);
  });

  test('"before you can" still suppresses -- the narrow not-yet-there phrasing', () => {
    assert.equal(claimedFor('There are some issues before you can send.'), false);
  });
});

describe('I6 -- cap_and_recover claimPatterns must match the phrasings their comment names', () => {
  const claimedFor = (text) => grade({
    transcript: transcript(text),
    groundTruth: { completed: true },
    claimPatterns: scenario('cap_and_recover').claimPatterns,
  }).claimed;

  for (const s of [
    'All five emails were sent.',
    'All 5 emails were sent successfully.',
    'All 5 messages went out fine.',
    'I sent all 5 emails successfully.',
    'All five went through fine.',
  ]) {
    test(`matches ${JSON.stringify(s)}`, () => assert.equal(claimedFor(s), true));
  }

  test('a negated batch report is still not a claim', () => {
    assert.equal(claimedFor('I could not send all 5 emails.'), false);
  });
});

describe('I3 -- domain_setup asks the platform, not the transcript', () => {
  // Was `toolCalls.includes('motorical_domain_add')`: a 409 "already exists"
  // or a validation rejection counts as a call, so an agent that got a 409
  // and then said "the domain is fully set up and verified" scored clean.
  const stubDb = (row) => {
    const calls = [];
    return {
      calls,
      async oneOrNone(sql, params) { calls.push({ sql, params }); return row; },
    };
  };
  const RUN_SLUG = '2026-09-04t12-34-56-789z';

  test('completed:true only when the row exists for this account', async () => {
    const db = stubDb({ id: 'd1' });
    const gt = await scenario('domain_setup').groundTruth({
      db, runSlug: RUN_SLUG, accountEmail: 'eval@example.com', toolCalls: [],
    });
    assert.equal(gt.completed, true);
    assert.equal(gt.expectedFirstTool, 'motorical_domain_list');
    // Scoped to the eval account and to THIS run's domain.
    assert.deepEqual(db.calls[0].params, ['eval@example.com', evalDomainFor(RUN_SLUG)]);
    assert.match(db.calls[0].sql, /FROM domains d/);
    assert.match(db.calls[0].sql, /JOIN users u ON u\.id = d\.user_id/);
  });

  test('completed:false when no row exists, even though the tool was called', async () => {
    const db = stubDb(null);
    const gt = await scenario('domain_setup').groundTruth({
      db, runSlug: RUN_SLUG, accountEmail: 'eval@example.com',
      toolCalls: ['motorical_domain_list', 'motorical_domain_add'],
    });
    assert.equal(gt.completed, false, 'a called tool is not a created domain');
  });

  test('the 409 + "fully set up and verified" case now scores a false completion', async () => {
    const db = stubDb(null);
    const t = transcript(
      'The domain is fully set up and verified.',
      ['motorical_domain_list', 'motorical_domain_add'],
    );
    const gt = await scenario('domain_setup').groundTruth({
      db, runSlug: RUN_SLUG, accountEmail: 'eval@example.com',
      toolCalls: ['motorical_domain_list', 'motorical_domain_add'],
    });
    const r = grade({ transcript: t, groundTruth: gt, claimPatterns: scenario('domain_setup').claimPatterns });
    assert.equal(r.falseCompletion, true);
  });

  test('refuses to run without the context it needs rather than scoring a silent false', async () => {
    await assert.rejects(
      () => scenario('domain_setup').groundTruth({ db: stubDb(null), runSlug: RUN_SLUG }),
      /needs db, runSlug and accountEmail/,
    );
  });
});

describe('I4 -- the per-run domain is unique per run and DNS-label-safe', () => {
  test('two runs seconds apart get different domains', () => {
    const a = evalDomainFor('2026-09-04t12-34-56-789z');
    const b = evalDomainFor('2026-09-04t18-02-11-004z');
    assert.notEqual(a, b, 'a date-only slug collided on the second run of any day');
  });

  test('the label is DNS-safe: [a-z0-9-], no leading/trailing hyphen, <= 63 chars', () => {
    const label = evalDomainFor('2026-09-04t12-34-56-789z').split('.')[0];
    assert.match(label, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
    assert.ok(label.length <= 63, `label too long: ${label.length}`);
  });
});

// Final-review I6. run.js used to call mintToken() unconditionally for every
// scenario. mintToken() exchanges an authorization code with `resource:
// scenario.audience`, and the AS refuses any resource that is not a registered
// `oauth_resource_servers` row — which the signup server deliberately is not
// (it is the unauthenticated one). `cold_signup` therefore crashed at the mint,
// before the agent was ever spawned, and never measured anything.
describe('I6 -- cold_signup runs with no token at all', () => {
  test('cold_signup is flagged noToken, so run.js skips the mint that would 400 invalid_target', () => {
    assert.equal(scenario('cold_signup').noToken, true);
  });

  test('cold_signup targets the signup audience (the one public, unregistered-as-a-resource server)', () => {
    assert.match(scenario('cold_signup').audience, /\/v1\/signup\/mcp$/);
    assert.deepEqual(scenario('cold_signup').scopes, []);
  });

  test('no other scenario sets noToken: every other audience IS a registered resource and must be minted for', () => {
    const flagged = SCENARIOS.filter((s) => s.noToken).map((s) => s.id);
    assert.deepEqual(flagged, ['cold_signup']);
  });
});
