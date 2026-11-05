/**
 * The Communications campaign-draft family (Comms MCP M3-4): five tools, all write:comms.content, declared once like the other families.
 * Logic is in commsCampaigns.js. No new scope and no new consent.
 *
 * Rules built in (plan: motorical-docs plans/2026-10-27-comms-mcp-m3-4-campaign-drafts.md):
 * - drafts only: nothing here schedules, cancels, deletes, or sets a time, a timezone, pacing or a status;
 * - every tool except preflight (itself the check) defaults to a DRY RUN; a real write needs dryRun:false;
 * - the test send goes to the account owner ONLY and has no recipient input; the owner's address is shown masked;
 * - creates carry an Idempotency-Key; preflight reports only what the API computed, warnings first.
 */

import { z } from 'zod';
import { workspaceId, dryRun, idempotencyKey } from './commsWriteTools.js';

const uuid = (what) => z.string().uuid().describe(what);
const WRITE = (extra = {}) => ({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, ...extra });
const description = z.string().min(1).max(1000).describe('What this campaign is for, in one to three sentences. Required.');

export const COMMS_CAMPAIGN_TOOLS = [
  {
    tool: 'comms_create_campaign', method: 'commsCreateCampaign', http: 'POST', route: '/comm-api/api/campaigns', create: true,
    title: 'Create a campaign draft', annotations: WRITE(),
    description: 'Create a campaign as a DRAFT: a name, a template, the marketing Motor Block it sends through, the lists it goes to and '
      + 'optionally lists to exclude. DRY RUN by default: the API runs every check (the template and lists belong to this workspace, the Motor Block is assigned, the From '
      + 'address is on its verified domain, no list is both sent to and excluded) and returns the would-be draft; nothing is stored. Pass dryRun:false to create it. '
      + 'A real create makes a draft only: it is NOT scheduled and nothing is sent. Get ids from comms_list_templates, comms_list_lists and comms_list_marketing_blocks. '
      + 'A description is required. A retry never makes a second draft.',
    input: {
      name: z.string().min(1).max(200), templateId: uuid('The template to send.'), motorBlockId: uuid('The marketing Motor Block it sends through (comms_list_marketing_blocks).'),
      listIds: z.array(z.string().uuid()).min(1).max(50).describe('The lists it goes to.'),
      excludeListIds: z.array(z.string().uuid()).max(50).optional().describe('Lists whose members must NOT receive it. A list cannot be in both.'),
      description,
      fromAddress: z.string().max(320).optional().describe('Must be on the Motor Block\'s verified domain; omit for the default (noreply@ that domain).'),
      fromName: z.string().max(100).optional(), replyTo: z.string().max(320).optional(),
    },
  },
  {
    tool: 'comms_update_campaign', method: 'commsUpdateCampaign', http: 'PATCH', route: '/comm-api/api/campaigns/{id}/settings', idempotent: true,
    title: 'Edit a campaign draft', annotations: WRITE({ idempotentHint: true }),
    description: 'Change a campaign DRAFT: its From address, From name, reply-to, description, template, lists and excluded '
      + 'lists (null clears a name, a reply-to or the exclusions). DRY RUN by default: the API checks everything and returns what would change and what it is now. A '
      + 'real write (dryRun:false) returns the previous values so it can be undone. Only a draft can have its template, lists or sender changed: a scheduled, sending or '
      + 'finished campaign answers INVALID_STATE. This tool cannot set a send time, a timezone or pacing, and cannot schedule.',
    input: {
      id: uuid('The campaign id.'), fromAddress: z.string().max(320).optional(), fromName: z.string().max(100).nullable().optional(), replyTo: z.string().max(320).nullable().optional(),
      description: description.optional(), templateId: z.string().uuid().optional(), listIds: z.array(z.string().uuid()).min(1).max(50).optional(),
      excludeListIds: z.array(z.string().uuid()).max(50).nullable().optional(),
    },
  },
  {
    tool: 'comms_duplicate_campaign', method: 'commsDuplicateCampaign', http: 'POST', route: '/comm-api/api/campaigns/{id}/duplicate', create: true,
    title: 'Duplicate a campaign into a new draft', annotations: WRITE(),
    description: 'Copy any campaign (draft, scheduled, finished or cancelled) into a NEW draft with the same template, lists, Motor Block, From and tracking '
      + '(POST /comm-api/api/campaigns/{id}/duplicate). Nothing of the old run is carried over: no schedule, no recipients, no history. DRY RUN by default: names the copy. '
      + 'This is how a finished campaign is sent again, and how a changed version of a scheduled one is made. A retry never makes a second copy; to deliberately make '
      + 'another, pass a different idempotencyKey.',
    input: { id: uuid('The campaign to copy.') },
  },
  {
    tool: 'comms_preflight_campaign', method: 'commsPreflightCampaign', http: 'POST', route: '/comm-api/api/campaigns/{id}/compile', noDryRun: true,
    title: 'Preflight a campaign', annotations: WRITE({ idempotentHint: true }),
    description: 'The check to run and SHOW before anyone says a campaign is ready. Nothing is sent. It compiles a snapshot of '
      + 'the audience and content, stored as a numbered version, and returns who would receive it (totalRecipients and an audience breakdown of who is in and why '
      + 'others are out), a forecast and warnings. State the numbers exactly as returned, with the version and time. Read the warnings first and mention every one. The result has a `settings` block (click counts as consent, open tracking, the unsubscribe page, each with where it comes from): say them in plain words, explain with comms_get_workspace_settings if asked, and remember they are workspace settings the person decides, never yours to change. '
      + 'hasRecipients false means NOT ready: no one would receive it, and the audience breakdown says why. The forecast is an estimate that assumes no other traffic. '
      + 'Any later change to the template, lists or settings makes it stale: run it again before scheduling.',
    input: { id: uuid('The campaign id.') },
  },
  {
    tool: 'comms_send_test', method: 'commsSendTest', http: 'POST', route: '/comm-api/api/campaigns/{id}/test-send',
    title: 'Send a test email to the account owner', annotations: WRITE(),
    description: 'Send ONE test copy of a campaign to the ACCOUNT OWNER ONLY. There is no recipient input: it always goes to the '
      + 'account owner\'s own verified address, never to anyone else, and the address is shown masked. DRY RUN by default: says what would be sent (sender, subject) and '
      + 'sends nothing. Pass dryRun:false to send it; tell the person to check their own inbox. It is not a send to anyone else and is not a way to preview for a '
      + 'colleague. It is rate limited: a refusal comes with its wait time (retryAfter, in seconds); report it and do not retry in a loop. The optional sample fills the '
      + 'merge tags (name, identity_name) for the preview.',
    input: { id: uuid('The campaign id.'), sample: z.object({ name: z.string().max(200).optional(), identity_name: z.string().max(200).optional() }).strict().optional().describe('Sample first name for the merge tags.') },
  },
  {
    tool: 'comms_send_template_test', method: 'commsSendTemplateTest', http: 'POST', route: '/comm-api/api/templates/{id}/test-send',
    title: 'Send a template test to the account owner', annotations: WRITE(),
    description: 'Send ONE test copy of a TEMPLATE to the ACCOUNT OWNER ONLY, so a design can be checked before any campaign, list or schedule exists. '
      + 'Same rules as comms_send_test: no recipient input, it goes to the owner\'s own verified address (shown masked), it is marked [TEST], nothing is stored, and it is rate limited (a refusal comes with retryAfter). '
      + 'It needs a campaign Motor Block of this workspace to send through (motorBlockId, from comms_list_marketing_blocks); its sending domain is the From address. DRY RUN by default. '
      + 'In the copy the unsubscribe and consent links are placeholders that point to motorical.com and links are not tracked: that is expected, not a fault, and the result says so. The result also carries the workspace `settings` that apply to real sends. Check real links with comms_check_links.',
    input: { id: uuid('The template id.'), motorBlockId: uuid('A campaign Motor Block of this workspace to send the test through (comms_list_marketing_blocks).'), sample: z.object({ name: z.string().max(200).optional(), identity_name: z.string().max(200).optional() }).strict().optional().describe('Sample first name for the merge tags.') },
  },
];

/** The registry entry for one table row. Preflight takes no dryRun (it is the check); creates also take an idempotencyKey. */
export function campaignRegistryEntry(row) {
  return {
    name: row.tool,
    description: row.description,
    inputSchema: { workspaceId, ...(row.noDryRun ? {} : { dryRun }), ...row.input, ...(row.create ? { idempotencyKey } : {}) },
    annotations: { title: row.title, ...row.annotations },
    handler: (client) => async (args) => client[row.method](args),
  };
}
