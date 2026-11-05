/**
 * The Communications send family (Comms MCP M3-5): schedule and cancel a campaign, both send:comms.campaign. This is the step that actually emails
 * people, so it is the most guarded one. Logic is in commsSend.js; the plan is motorical-docs plans/2026-10-27-comms-mcp-m3-5-schedule-and-cancel.md.
 *
 * - SCHEDULE: a dry run first (the default) that returns a plain summary and a signed token bound to that exact preview; the real call needs
 *   dryRun:false, confirm:true AND that token, a preflight version, and an explicit future time with a timezone. It does NOT use the native `mrtr`
 *   prompt, because that fires on every call, including the preview.
 * - CANCEL: final, one step: confirm:true (the existing `mrtr` mechanism). Speed matters when someone says "stop".
 */

import { z } from 'zod';
import { workspaceId, dryRun } from './commsWriteTools.js';

const uuid = (what) => z.string().uuid().describe(what);
const SEND = (extra = {}) => ({ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, ...extra });

export const COMMS_SEND_TOOLS = [
  {
    tool: 'comms_schedule_campaign', method: 'commsScheduleCampaign', http: 'POST', route: '/comm-api/api/campaigns/{id}/schedule',
    title: 'Schedule a campaign (this emails people)', annotations: SEND(),
    description: 'Schedule a campaign draft to be SENT to its audience at a time. This is what actually emails people. '
      + 'PROCEDURE, in this order: (1) run comms_preflight_campaign and show the person its numbers; (2) call this tool WITHOUT dryRun:false to get a DRY RUN: a summary of the campaign, '
      + 'the subject, the sender, exactly how many people, the send time in the person\'s timezone with the weekday and in UTC, every warning, the settings sentence (click counts as consent, open tracking, where people go after unsubscribing) and a confirmToken; (3) read that '
      + 'summary to the person and get a clear YES to exactly that summary; (4) only then call again with the same arguments plus dryRun:false, confirm:true and the confirmToken. '
      + 'Never pass confirm:true or a token the person has not just seen the summary for. If anything changed since the preview (the numbers, the time, the template, a workspace setting) the token '
      + 'is refused: preview again and show the new numbers. Give the time as sendAtLocal (for example 2026-11-06T09:00) WITH its IANA timezone (for example Europe/Riga), or as '
      + 'sendAtUtc; ask the person for the timezone, never assume it. There is no sending now: the time must be at least 15 minutes ahead and at most 90 days. preflightVersion '
      + 'is the version comms_preflight_campaign returned; it must still describe exactly what would be sent and be less than 30 minutes old. A connection can schedule at most 50 '
      + 'campaigns a day (a runaway guard, not a working limit), and the account owner is emailed about every one. Cancel with comms_cancel_campaign.',
    input: {
      id: uuid('The campaign id.'), preflightVersion: z.number().int().min(1).describe('The version returned by comms_preflight_campaign for this campaign.'),
      sendAtLocal: z.string().max(25).optional().describe('Local date and time, YYYY-MM-DDTHH:MM, with no offset. Needs timezone.'),
      timezone: z.string().max(64).optional().describe('IANA timezone the local time is in, for example Europe/Riga.'),
      sendAtUtc: z.string().max(40).optional().describe('Instead of sendAtLocal: a full UTC timestamp with Z or an offset.'),
      confirm: z.boolean().optional().describe('true only after the person said yes to the summary of the dry run.'),
      confirmToken: z.string().max(2000).optional().describe('The confirmToken from the matching dry run.'),
    },
  },
  {
    tool: 'comms_cancel_campaign', method: 'commsCancelCampaign', http: 'POST', route: '/comm-api/api/campaigns/{id}/cancel', noDryRun: true,
    title: 'Cancel a campaign (final)', annotations: SEND({ idempotentHint: true }),
    description: 'Cancel a draft, scheduled or sending campaign. Cancelling is FINAL: the campaign can never be restarted; to send it again, '
      + 'duplicate it (comms_duplicate_campaign) and schedule the copy. It stops anything not yet sent; mail already sent cannot be recalled. Use it at once when the person says to stop. '
      + 'Pass confirm:true after the person has said to cancel. The account owner is emailed.',
    input: { id: uuid('The campaign id.'), confirm: z.boolean().optional().describe('true after the person has said to cancel it.') },
    mrtr: { confirmArg: 'confirm', message: (args) => `Cancel campaign ${args.id}? Cancelling is final and cannot be undone; mail already sent cannot be recalled.` },
  },
];

export function sendRegistryEntry(row) {
  return {
    name: row.tool,
    description: row.description,
    inputSchema: { workspaceId, ...(row.noDryRun ? {} : { dryRun }), ...row.input },
    annotations: { title: row.title, ...row.annotations },
    ...(row.mrtr ? { mrtr: row.mrtr } : {}),
    handler: (client) => async (args) => client[row.method](args),
  };
}
