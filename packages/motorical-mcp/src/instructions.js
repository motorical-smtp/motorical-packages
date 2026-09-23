//
// The `instructions` string returned by server/discover. This is the only
// place the server talks to the model BEFORE any tool is called, so it carries
// the two things agents most often get wrong about email: that acceptance is
// not delivery, and that a Motor Block is the unit of sending.
//
// Say nothing here about tools that do not exist yet. An agent that hunts a
// promised tool and cannot find it in tools/list is worse off than one that
// was never told.

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

const PER_SERVER = {
  analytics: [GENERIC, 'All tools here are read-only. Recipient addresses may be masked.'].join(' '),
  domains: [GENERIC, 'For cname_managed DKIM, publish the CNAME from dnsRecords -- not a raw TXT key.'].join(' '),
  sandbox: [GENERIC, 'Sandbox status, provisioning, and conversion work over OAuth. Sandbox allowlist request/confirmation need a dashboard session and are unavailable over OAuth regardless of scope.'].join(' '),
  webhooks: [GENERIC, 'Webhook endpoints receive delivery events; deleting one is irreversible.'].join(' '),
};

export function instructionsFor(serverKey) {
  // Object.hasOwn, not `PER_SERVER[serverKey] ||`: a plain-object lookup walks
  // the prototype chain, so instructionsFor('toString') returned a Function and
  // instructionsFor('constructor') an Object -- neither of which is a string of
  // instructions. Only an OWN key counts; everything else falls through to
  // GENERIC, which by design carries the 202 acceptance warning (Ruling Q12).
  return Object.hasOwn(PER_SERVER, serverKey) ? PER_SERVER[serverKey] : GENERIC;
}
