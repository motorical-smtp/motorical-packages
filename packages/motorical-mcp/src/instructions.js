//
// The `instructions` string returned by server/discover. This is the only
// place the server talks to the model BEFORE any tool is called, so it carries
// the two things agents most often get wrong about email: that acceptance is
// not delivery, and that a Motor Block is the unit of sending.
//
// Say nothing here about tools that do not exist yet. An agent that hunts a
// promised tool and cannot find it in tools/list is worse off than one that
// was never told.
//
// design 2026-09-24 agent-ready-docs-and-positioning §5.3: "Server
// instructions become generated (route chooser, rules, pointer to the
// resources); every server gets its own." Before this, four of the eight
// scoped servers (main, transactional, motorBlocks, signup) fell through to
// the two-sentence GENERIC fallback — the design's own audit named this gap.
// Every server key now has its own PER_SERVER entry, and every entry points
// at the hub resource (motorical://docs/agents-hub) rather than duplicating
// the hub's rulebook text here.

// This warning lives in GENERIC, not in a per-server entry, on purpose: GENERIC
// is also the fallback for any key that ISN'T in PER_SERVER below -- including
// 'main' (the unscoped server that carries every tool, motorical_send_email
// included), the stdio entrypoint's instructionsFor(undefined), and any future
// server key added without a matching PER_SERVER entry. The fallback must be
// safe by construction; it must never be the one path that omits this.
const ACCEPTANCE_WARNING = [
  'IMPORTANT: a successful send returns 202 Accepted. That means the message was ACCEPTED FOR',
  'DELIVERY -- it is NOT delivered. Delivery, bounce or deferral is decided seconds to hours',
  'later. Never tell a user a message was delivered on the strength of a 202; check the message',
  'status before making any claim about the outcome. Use dryRun:true when composing a new send.',
].join(' ');

const GENERIC = [
  'Motorical is a transactional email API and SMTP provider.',
  'A "Motor Block" is an isolated sending stream with its own reputation and rate limits;',
  'most operations are scoped to one Motor Block, identified by its UUID.',
  'Domains must be verified (SPF + DKIM) before mail from them will be accepted.',
  ACCEPTANCE_WARNING,
].join(' ');

// Read via the motorical://docs/agents-hub and motorical://docs/agents-playbook
// resources (registered unconditionally in server.js, same treatment as the
// existing llms.txt/openapi.json resources) rather than duplicated here --
// one place holds the full route chooser and rulebook.
const HUB_POINTER = [
  'For the full route chooser, rulebook, and journeys (which server to use, when a human must be',
  'involved, what a consequential operation requires), read the motorical://docs/agents-hub resource',
  'or fetch https://docs.motorical.com/agents -- do not guess at rules this server has not told you.',
].join(' ');

// One short, specific line per server: what this particular audience is
// scoped to do and the one thing most worth knowing about it that GENERIC
// doesn't already cover. Kept short on purpose -- HUB_POINTER carries the
// rest, so this is a orientation line, not a duplicate of the hub.
const PER_SERVER_BLURB = {
  main: 'This server carries every tool across every scoped area (transactional, analytics, domains, sandbox, webhooks, Motor Block lifecycle) under one OAuth consent -- use it for a full setup in one connection, or connect a narrower server below for least privilege.',
  transactional: 'This server sends transactional email and inspects delivery for the caller\'s Motor Block(s): motorical_send_email, status, message and event lookups, and motorical_wait_for_outcome for a terminal result instead of polling.',
  analytics: 'All tools here are read-only. Recipient addresses may be masked.',
  domains: 'For cname_managed DKIM, publish the CNAME from dnsRecords -- not a raw TXT key.',
  sandbox: 'Sandbox status, provisioning, and conversion work over OAuth. Sandbox allowlist request/confirmation need a dashboard session and are unavailable over OAuth regardless of scope.',
  motorBlocks: 'This server manages the ordinary lifecycle of production Motor Blocks (create, rename, change type, assign domain, deactivate, reactivate, delete) -- transactional and general_purpose only. Deactivate is reversible; delete is permanent, asynchronous, and requires a stated deleteHistory choice. A consequential operation asks for confirmation bound to the exact arguments shown.',
  webhooks: 'Webhook endpoints receive delivery events; deleting one is irreversible.',
  signup: 'This is the one unauthenticated server -- no OAuth grant needed, for a caller with no Motorical account yet. Its one tool, motorical_signup_handoff, returns a one-time URL that runs signup and consent in the same browser visit; no credential of any kind is ever returned to the agent.',
};

const PER_SERVER = Object.fromEntries(
  Object.entries(PER_SERVER_BLURB).map(([key, blurb]) => [key, [GENERIC, blurb, HUB_POINTER].join(' ')])
);

export function instructionsFor(serverKey) {
  // Object.hasOwn, not `PER_SERVER[serverKey] ||`: a plain-object lookup walks
  // the prototype chain, so instructionsFor('toString') returned a Function and
  // instructionsFor('constructor') an Object -- neither of which is a string of
  // instructions. Only an OWN key counts; everything else falls through to
  // GENERIC, which by design carries the 202 acceptance warning (Ruling Q12).
  return Object.hasOwn(PER_SERVER, serverKey) ? PER_SERVER[serverKey] : GENERIC;
}
