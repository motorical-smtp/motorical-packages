// packages/motorical-mcp/eval/discoveryScenarios.js
//
// UNTESTED AGAINST A LIVE RUN as of 2026-09-24 — written by a session with no
// EVAL_* credentials and no network path to docs.motorical.com, npmjs.com, or
// motorical.com, so nothing here has been observed against a real `claude`
// child process or real front-door content. Dry-run ONE scenario by hand
// (`node eval/runDiscovery.js --only motorical_com_only`) and read its
// transcript before trusting a full batch — this costs real API money per
// scenario, same as run.js's existing scenarios.
//
// Design 2026-09-24 agent-ready-docs-and-positioning §10, Level 2: "cold-agent
// acceptance... persona x front door, about 5 runs each." This file defines
// the FRONT-DOOR half (which starting point) crossed with enough of the
// PERSONA half (design §4's audiences) to exercise the specific pass/fail
// criteria §10 names. It deliberately does NOT reuse run.js/scenarios.js's
// machinery (which assumes an MCP server is already wired via --mcp-config)
// — see eval/runDiscovery.js for why discovery needs a different spawn
// shape, and why keeping the two files separate means this untested code
// cannot break the existing, proven, money-costing harness.
//
// A discovery scenario's `prompt` deliberately names no tool, no URL, and no
// Motorical-specific vocabulary beyond what design §10's own scenario
// descriptions call for — the thing under test is whether the agent finds
// its own way there, the same discipline scenarios.js's own comment block
// applies to its MCP scenarios.

const PASS_CRITERIA_NOTE = 'Graded by gradeDiscovery() in this eval run — see its checks list below.';

export const DISCOVERY_SCENARIOS = [
  {
    id: 'motorical_com_only',
    frontDoor: 'motorical.com',
    persona: 'D (embedding Motorical in an agent app)',
    prompt: 'A teammate told you to look at motorical.com and figure out how our own agent app '
      + 'could send email through it. Investigate and report back: what is Motorical, what would we '
      + 'need to integrate it, and where should we start.',
    note: PASS_CRITERIA_NOTE,
  },
  {
    id: 'github_repo_only',
    frontDoor: 'GitHub motorical-packages repo',
    persona: 'A (coding assistant adding email to an app)',
    prompt: 'Look at https://github.com/motorical-smtp/motorical-packages and figure out how to add '
      + 'Motorical email sending to a Node.js backend. What would you install or connect, and how would '
      + 'you start?',
    note: PASS_CRITERIA_NOTE,
  },
  {
    id: 'npm_package_only',
    frontDoor: '@motorical/mcp on npm',
    persona: 'A (coding assistant adding email to an app)',
    prompt: 'A teammate found the npm package @motorical/mcp (https://www.npmjs.com/package/@motorical/mcp) '
      + 'and asked you whether we should use it to add Motorical email to our agent, or whether there is a '
      + 'better route. Investigate and recommend.',
    note: PASS_CRITERIA_NOTE,
  },
  {
    id: 'docs_home_only',
    frontDoor: 'docs.motorical.com (bare, no /agents hint)',
    persona: 'B (operator agent running a customer account over MCP)',
    prompt: 'You are helping a user who already has a Motorical account operate it from this chat. '
      + 'Start at https://docs.motorical.com and figure out how you, as an agent, should connect.',
    note: PASS_CRITERIA_NOTE,
  },
  {
    id: 'bare_mcp_url',
    frontDoor: 'mcp.motorical.com (bare URL, no docs context)',
    persona: 'B (operator agent running a customer account over MCP)',
    prompt: 'A user gave you this URL and said "connect to this for Motorical": https://mcp.motorical.com — '
      + 'figure out what it is and how to connect correctly.',
    note: PASS_CRITERIA_NOTE,
  },
  {
    id: 'shell_only_no_mcp_client',
    frontDoor: 'shell only, no MCP client available',
    persona: 'C (agent whose human has no account) + the shell-only constraint design §10 names explicitly',
    prompt: 'You are operating in a plain shell with no MCP client available — only curl and a browser you '
      + 'can describe steps for a human to follow. A user with no Motorical account wants to send a test '
      + 'email. Walk through exactly what you would run or ask the human to do, in order. Do not install '
      + 'anything.',
    note: 'Pass criteria include: must NOT look for or attempt to install @motorical/cli (retired); must '
      + 'choose REST onboarding or direct the human to the hosted MCP signup handoff; must stop at the '
      + 'email-verification-code step rather than fabricating a code (design §10\'s named stop condition).',
  },
  {
    id: 'communications_honesty',
    frontDoor: 'docs.motorical.com (agent already oriented)',
    persona: 'E (agent asked to run a marketing campaign)',
    prompt: 'Using Motorical, send a marketing campaign to a list of 500 subscribers announcing a product '
      + 'launch. Figure out how.',
    note: 'Pass criteria: must route to the Communications Block via its API/dashboard, must NOT claim an '
      + 'MCP tool exists for this (design §9 — Communications Block is api-only, not available over MCP), '
      + 'and must not attempt to use a transactional Motor Block tool for bulk send.',
  },
];
