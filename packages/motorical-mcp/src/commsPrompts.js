// The prompts of the hosted `communications` server (Comms MCP M4-2): six playbooks, one declarative table that both the legacy path (server.js)
// and the native dispatcher (native/dispatch.js) read, so they can never advertise different things. A prompt orders the tools and names the stop
// points; it does not restate a tool's procedure (that is the tool description) or a rule (that is commsInstructions.js), and it carries no
// policy number (limits live in commsPolicy.js, reachable through the motorical://comms/limits-and-pacing resource).
// Tests: test/commsPrompts.test.js.
import { z } from 'zod';

import { MAX_IMPORT_ROWS } from './commsContactTools.js';
const MAX_ARG_CHARS = 500;

// An argument is the person's own words: put it on one line, inside quotes, so it reads as data and cannot open a new paragraph of instructions.
const words = (value) => String(value).replace(/\s+/g, ' ').replace(/["“”]/g, "'").trim();
const aboutLine = (label, value) => (value ? `\n${label}: "${words(value)}"\n` : '');

const arg = (describe) => z.string().max(MAX_ARG_CHARS).optional().describe(describe);

export const COMMS_PROMPTS = [
  {
    name: 'motorical_run_campaign',
    title: 'Run a marketing campaign',
    description: 'Take a marketing email from "I want to send it" to scheduled and reported, stopping at every point where the person must decide.',
    args: { goal: arg('What the campaign is, in the person\'s words (for example "my November newsletter on Friday morning").') },
    build: ({ goal } = {}) => `Help me run a marketing campaign. Follow the server instructions and each tool's own description.${aboutLine('What I want', goal)}
Say the plan in one short list first, then run it, stopping only at a step that needs me and at the send confirmation.
1. Look before you act: comms_get_readiness, then comms_get_map. Tell me the first thing that is missing, not the whole manual.
2. Audience: comms_list_lists and comms_get_list. If two lists could fit, show both cards and ask; never choose by name alone.
3. Content: comms_list_templates and comms_get_template. To write or repair one, use the template prompts (motorical_write_template, motorical_fix_template).
4. Draft the campaign with comms_create_campaign, then run comms_preflight_campaign and show me its numbers exactly as returned, warnings first.
5. Send me a test with comms_send_test and wait for me to look at it.
6. Time: confirm the timezone out loud; "Friday 9am" with no timezone is a question, not a time. A send is always scheduled at an explicit time.
7. Confirmation: read back one sentence naming the campaign, the subject, the sender, exactly how many people, and the time with its timezone. Only my clear yes to that sentence counts. Then comms_schedule_campaign.
8. Afterwards: comms_get_campaign and comms_get_campaign_report. Quote counts with what they are out of, and call opens estimates.
If I say stop, call comms_cancel_campaign at once and tell me cancelling is final.`,
  },
  {
    name: 'motorical_import_audience',
    title: 'Import an audience',
    description: 'Bring a list of contacts in safely: a dry run first, consent asked, and the list described so nobody mixes it up later.',
    args: { source: arg('Where the contacts come from (for example "customers exported from Shopify").') },
    build: ({ source } = {}) => `Help me bring contacts into Motorical. Follow the server instructions and each tool's own description.${aboutLine('Where they come from', source)}
1. Ask whether anyone on the list opted out in the tool it comes from (a new Motorical account does not know). A handful: add them with comms_add_suppression, or leave their rows out. Many (for example the Unsubscribed or Cleaned file from Mailchimp): the person adds them in the dashboard, Comm, Suppressions, Bulk Import, before the contacts are imported; never paste them into chat. In a Mailchimp file only a column called name, full name or contact name is imported as the name (First Name and Last Name are not), so the person adds a name column first. Ask how many people there are. Up to ${MAX_IMPORT_ROWS} rows: ask for them as text, tidy the rows yourself (headers, delimiters, a title row, stray spaces) and use comms_import_contacts. More than that, or a file you cannot read: never paste or send a big list through this chat. Also tell me a small list can go either way: pasting it here puts the addresses in this conversation, while the dashboard card keeps them out of chat. Tell me why (the file stays between me and Motorical) and how (dashboard on a computer: Comm, Lists, the "Import Contacts (CSV)" card, choose the list, tick consent, pick the file), then carry on from step 4 once I say it is done.
2. Do a dry run first with comms_import_contacts. Show me the counts and three examples of each problem (invalid addresses, duplicates, rows that would overwrite a name). Nothing is imported at this stage.
3. Ask me, for each source, whether these people agreed to get marketing email from me. The consent statement is mine, in my words; never assert it for me.
4. Ask where the data came from and what the list is for, and write that into the list's description, kind and source in the same call (comms_create_list or comms_update_list).
5. Only then import for real. People who unsubscribed or are suppressed are never added back silently; tell me how many were left out and why.
6. Finish by reading the list back with comms_get_list so I see what is really there.`,
  },
  {
    name: 'motorical_write_template',
    title: 'Write an email template',
    description: 'Write a marketing email that passes the rulebook: brand kit read, linted, previewed, with a deliberate text version.',
    args: { topic: arg('What the email is about (for example "a winter sale for existing customers").') },
    build: ({ topic } = {}) => `Help me write a marketing email template. Follow the server instructions and each tool's own description.${aboutLine('What it is about', topic)}
1. Read the rulebook with comms_get_template_rules and my brand kit with comms_get_brand_kit. If the kit is empty, ask me once and keep the answer (comms_set_brand_kit); never invent a logo address or legal text.
2. Start from a skeleton: comms_list_starters, then comms_create_template_from_starter, or write the HTML yourself.
3. Write the text version deliberately; do not leave it to be generated from the HTML.
4. Lint it with comms_lint_template. Explain every finding in plain words, and apply a fix only with my yes.
5. Save it with comms_create_template, with a plain description and a kind.
6. Show me comms_preview_template: the HTML, the effective text version, the links, and the greeting for a contact with a name and one without.
7. Offer to send me a test with comms_send_test.`,
  },
  {
    name: 'motorical_fix_template',
    title: 'Fix an email template',
    description: 'Check an existing template, explain each finding, and repair it with the person\'s yes, never claiming a fix the re-lint does not show.',
    args: { template: arg('Which template to check (its name, or say "this one" and paste it).') },
    build: ({ template } = {}) => `Help me check and repair a marketing email template. Follow the server instructions and each tool's own description.${aboutLine('Which template', template)}
1. Read it with comms_get_template (or take the pasted draft) and lint it with comms_lint_template.
2. Group the findings by how serious they are: what blocks scheduling, what changes what people see, what could mislead, and tips. For each one say what it means for the person receiving the email, in plain words, and show the fix as before and after.
3. Check every link with comms_check_links: where it goes, whether it is tracked, anything wrong.
4. Show the effective text version next to the HTML.
5. Ask me which fixes to apply; I must say yes first. Preview them with comms_apply_template_fixes before anything is saved, and save as a new version, never over the only copy.
6. Lint again after the fix. Do not tell me a finding is fixed until the new lint result shows it.`,
  },
  {
    name: 'motorical_set_up_brand',
    title: 'Set up a brand or sender',
    description: 'Set up a separate brand, client or sender: a workspace, its brand kit and its sending identity, one confirmed step at a time.',
    args: { brand: arg('The brand, client or sender to set up (for example "Shop Ltd").') },
    build: ({ brand } = {}) => `Help me set up a brand or sender. Follow the server instructions and each tool's own description.${aboutLine('The brand', brand)}
1. Look first: comms_list_workspaces and comms_list_marketing_blocks. Tell me what already exists, and say in which workspace you are working.
2. Create a separate workspace with comms_create_workspace only because I asked to keep this brand apart, and only after I confirm its name. Never split things up on your own.
3. Ask for the brand kit once (legal sender name and postal address, logo address, colour, footer wording, reply-to) and store it with comms_set_brand_kit. Do not ask for it again.
4. Sender identity: comms_add_sending_identity adds a sending address. The domain must be verified first; adding the DNS records is for me to do at my domain provider, so give me the exact records, tell me, and wait.
5. Finish with comms_get_readiness for that workspace so we both see what is still missing.`,
  },
  {
    name: 'motorical_diagnose_campaign',
    title: 'Diagnose a campaign',
    description: 'Answer "why has it not all gone out", "why did fewer people get it" or "how did it do" from the campaign\'s own report.',
    args: { campaign: arg('Which campaign (its name), and what looks wrong (for example "November Newsletter, only part of it has gone").') },
    build: ({ campaign } = {}) => `Help me understand how a campaign is doing. Follow the server instructions and each tool's own description.${aboutLine('The campaign', campaign)}
1. Find it with comms_list_campaigns if I did not name it exactly, then read it with comms_get_campaign: its status, its pacing and the reason it gives.
2. A campaign held by a sending limit is waiting, not failing. Say when it resumes, taken from the tool, and never offer to raise a limit.
3. Read comms_get_campaign_report and comms_get_campaign_timeline. Quote every count together with what it is out of, say when you read it, and remember that delivery outcomes lag behind the hand-off, so a low "delivered" soon after sending is not a failure.
4. If fewer people received it than are on the list, explain the difference from the audience breakdown in the report (unsubscribed, suppressed, earlier bounces) rather than guessing.
5. For one person's story use comms_list_campaign_events or comms_find_contact; addresses stay masked.
6. Opens are estimates, because mail apps can load images for the reader; say so whenever you quote them.`,
  },
];

/** The MCP "arguments" array of a prompt, derived from its zod shape. */
export function promptArguments(prompt) {
  return Object.entries(prompt.args).map(([name, schema]) => ({ name, description: schema.description, required: !schema.isOptional() }));
}

/** The prompts/list entry for a prompt (no functions, nothing the client cannot serialise). */
export function promptListing(prompt) {
  return { name: prompt.name, title: prompt.title, description: prompt.description, arguments: promptArguments(prompt) };
}

/** The prompts/get result for a prompt, or `{ error }` when the arguments are not valid. */
export function getPrompt(name, rawArgs) {
  const prompt = COMMS_PROMPTS.find((p) => p.name === name);
  if (!prompt) return { error: `Unknown prompt: ${name}` };
  const parsed = z.object(prompt.args).strict().safeParse(rawArgs || {});
  if (!parsed.success) return { error: `Invalid arguments for ${name}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'arguments'} ${i.message}`).join('; ')}` };
  return { description: prompt.description, messages: [{ role: 'user', content: { type: 'text', text: prompt.build(parsed.data) } }] };
}
