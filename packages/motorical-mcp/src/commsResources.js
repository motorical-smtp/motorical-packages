// The resources of the hosted `communications` server (Comms MCP M4-2): four reference pages an agent reads instead of remembering. One
// declarative table that the legacy path (server.js) and the native dispatcher (native/dispatch.js) both read. Nothing here is typed twice:
// the numbers are rendered at read time from the published agent-facts.json (generated from backend/src/config/commsPolicy.js), the closed
// vocabularies from the constants the tools validate with, and the rulebook is the Comms API's own endpoint. Tests: test/commsResources.test.js.
import { SUPPRESSION_REASONS, DERIVE_OPERATIONS } from './commsContactTools.js';
import { WEBHOOK_EVENTS } from './commsManageTools.js';
import { EVENT_TYPES } from './commsReportTools.js';
import { TEMPLATE_KINDS, LIST_KINDS, BRAND_FONTS } from './commsWriteTools.js';

const HOW_URI = 'motorical://comms/how-sending-works';
const LIMITS_URI = 'motorical://comms/limits-and-pacing';
const VOCAB_URI = 'motorical://comms/vocabularies';
const RULES_URI = 'motorical://comms/template-rulebook';

const markdown = (uri, text) => ({ contents: [{ uri, mimeType: 'text/markdown', text }] });
const json = (uri, data) => ({ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] });

const HOW_SENDING_WORKS = `# How marketing sending works here

Facts you can rely on. Numbers are deliberately not on this page: they are on ${LIMITS_URI}, rendered from the published policy.

- A **workspace** is a tenant: its own lists, templates, campaigns and brand kit. A grant covers some workspaces; one it does not cover looks as if it does not exist.
- Mail goes out through a **marketing Motor Block**, a sender identity with no SMTP login and no API key. The From address must be on that block's own verified domain, so a free-mail address can never be the sender.
- A contact has an email, a name, a phone, an identity type and an identity name (the contact's own organisation, rarely filled). There are no custom fields.
- **Merge variables are a closed set.** A fallback such as {{name|there}} covers an empty value; the links cannot take one. An unknown variable is refused when the campaign is scheduled. The rulebook (${RULES_URI}) is the authority on which variables exist.
- **Every campaign needs {{unsubscribe_url}}** in its HTML or text. Unsubscribes and complaints are suppressions, and a suppression is **account-wide**: it holds in every workspace.
- A **test send** goes only to the account owner's verified address, marked as a test, without tracking. It uses the current template; a scheduled campaign keeps the copy compiled when it was scheduled, so editing the template afterwards does not change it.
- A campaign is a draft, then scheduled, sending, completed or cancelled; cancelled is final and there is no pause. Its template, lists and Motor Block cannot change after it is created; duplicate it to change them.
- A send is always **scheduled at an explicit time with a timezone**. Sending limits are real: a campaign that reaches one waits and resumes by itself.
- **Results** come from one report, per recipient: handed off, accepted, delivered, opened, clicked, bounced, failed, complained. Delivery outcomes lag the hand-off by a few minutes. Opens are an upper bound, because mail apps can load images for the reader.
- Webhooks are signed, https only, and switched off by the platform after repeated failures. A person creates one and sees its secret once.
`;

// Rendered from the published agent-facts.json at read time. Every figure is read from the policy; a missing one is an error, never a guess.
async function limitsPage(client) {
  const facts = JSON.parse(await client.fetchDocs('/agent-facts.json'));
  const p = facts && facts.policy && facts.policy.comms;
  const need = ['testSendPerCampaignPerHour', 'testSendPerAccountPerDay', 'mergeFallbackMaxChars', 'maxCampaignDays', 'accountSharePercent', 'bulkTemplateDeleteMax',
    'agentMinLeadMinutes', 'agentMaxLeadDays', 'agentSchedulesPerDay', 'preflightMaxAgeMinutes', 'mcpEventsPageSize', 'agentWebhookTestsPerHour'];
  const missing = need.filter((k) => !Number.isFinite(p && p[k]));
  if (missing.length) throw new Error(`The published policy (agent-facts.json policy.comms) is missing: ${missing.join(', ')}`);
  return `# Limits and pacing

Rendered from the published policy at the time you read this page. When a tool result disagrees, the tool result is right.

## Scheduling
- A campaign is scheduled at least ${p.agentMinLeadMinutes} minutes ahead and at most ${p.agentMaxLeadDays} days ahead.
- At most ${p.agentSchedulesPerDay} campaigns a day can be scheduled through one connection.
- A campaign that could not finish within ${p.maxCampaignDays} days at the current limits is refused at scheduling.
- A preflight must be less than ${p.preflightMaxAgeMinutes} minutes old when you schedule.

## Test sends
- At most ${p.testSendPerCampaignPerHour} test sends per campaign per hour and ${p.testSendPerAccountPerDay} per account per day, to the owner's address only.

## Sending limits and waiting
- Campaigns obey the Motor Block's hourly, daily and burst limits and use at most ${p.accountSharePercent} percent of the account's ceiling.
- A campaign that reaches a limit **waits and resumes by itself**; the campaign says why and when. Waiting is not failing. Quote the time from the tool, and never offer to raise a limit.

## Content and reading
- A merge fallback is at most ${p.mergeFallbackMaxChars} characters.
- Deleting templates in bulk takes at most ${p.bulkTemplateDeleteMax} at a time (a person does it; you cannot delete).
- Event pages hold at most ${p.mcpEventsPageSize} events; page through them rather than guessing a total.
- Webhook test events: at most ${p.agentWebhookTestsPerHour} per hour.
`;
}

const VOCAB_NOTE = 'Only these values are valid for the sets above. The template findings, fix types and merge variables are in the rulebook (comms_get_template_rules, or the template-rulebook resource). Campaign statuses, pacing states and error codes are whatever comms_get_campaign, comms_list_campaigns and the tool errors return: use only those, never invent one.';

async function rulebookPage(client) {
  try {
    return json(RULES_URI, await client.commsGetTemplateRules({}));
  } catch (err) {
    // A refused or revoked grant is not a reading problem: let it through, so it surfaces as an error (code and all) instead of a page that looks like an answer.
    if (err && (err.status === 401 || err.status === 403)) {
      const code = err.data && err.data.code;
      throw new Error(code && !String(err.message).includes(code) ? `${code}: ${err.message}` : err.message);
    }
    // Reading the rulebook needs one workspace; with several covered and none named the client refuses. Say so and point at the tool, which can be told which.
    return markdown(RULES_URI, `The template rulebook could not be read here: ${err && err.message ? err.message : 'unknown error'}\n\nCall the tool comms_get_template_rules (pass workspaceId if it asks) to read it.`);
  }
}

export const COMMS_RESOURCES = [
  {
    uri: HOW_URI, name: 'How marketing sending works here', mimeType: 'text/markdown',
    description: 'The facts of marketing sending on Motorical that an agent can rely on: workspaces, senders, merge variables, suppressions, tests, campaign states and results.',
    handler: () => async () => markdown(HOW_URI, HOW_SENDING_WORKS),
  },
  {
    uri: LIMITS_URI, name: 'Limits and pacing', mimeType: 'text/markdown',
    description: 'Every limit that applies to marketing campaigns (scheduling window, daily cap, test sends, sending limits, pacing), rendered from the published policy.',
    handler: (client) => async () => markdown(LIMITS_URI, await limitsPage(client)),
  },
  {
    uri: VOCAB_URI, name: 'Closed vocabularies', mimeType: 'application/json',
    description: 'The closed sets the tools accept: suppression reasons, derive operations, webhook events, event types, template and list kinds, brand fonts.',
    handler: () => async () => json(VOCAB_URI, {
      suppressionReasons: SUPPRESSION_REASONS, deriveOperations: DERIVE_OPERATIONS, webhookEvents: WEBHOOK_EVENTS, eventTypes: EVENT_TYPES,
      templateKinds: TEMPLATE_KINDS, listKinds: LIST_KINDS, brandFonts: BRAND_FONTS, note: VOCAB_NOTE,
    }),
  },
  {
    uri: RULES_URI, name: 'Template rulebook', mimeType: 'application/json',
    description: 'The rules every marketing template is held to (size limits, removed merge tags, link rules, lint findings and fix types), as the Comms API returns them.',
    handler: (client) => async () => rulebookPage(client),
  },
];

export function commsResourceByUri(uri) {
  return COMMS_RESOURCES.find((r) => r.uri === uri) || null;
}
