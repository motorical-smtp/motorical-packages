/**
 * The Communications contact family (Comms MCP M3-3): two reads (read:comms) and five writes (write:comms.audience), declared once like
 * the read and write families. Logic is in commsContacts.js. No new scope and no new consent.
 *
 * Rules built in (plan: motorical-docs plans/2026-10-27-comms-mcp-m3-3-contacts.md):
 * - every write defaults to a DRY RUN; a real write needs dryRun:false;
 * - a real import needs the person's consent answer (true OR false), never defaulted;
 * - addresses are ALWAYS masked (commsMask.js); there is no way to ask for a real one;
 * - nothing sends. Deleting a list or a contact, cleaning up contacts on no list and opting someone back in need manage:comms.audience, a grant of
 *   its own that the first consent never includes (owner decision 2026-11-04, plan 2026-11-04-comms-list-manipulation-complete).
 */

import { z } from 'zod';
import { workspaceId, dryRun, idempotencyKey } from './commsWriteTools.js';

export const SUPPRESSION_REASONS = ['manual', 'complaint', 'unsubscribe'];
export const DERIVE_OPERATIONS = ['union', 'intersection', 'difference', 'filter'];
export const AUDIENCE_SORTS = ['recent', 'email', 'activity'];
export const MAX_IMPORT_ROWS = 1001;
export const MAX_REMOVE_IDS = 100;
export const MAX_SUPPRESS_EMAILS = 200;
export const CONTACT_MODES = ['keep', 'delete_orphans'];
export const DASHBOARD_PURPOSES = ['import_csv', 'export_list', 'bulk_suppressions'];

const uuid = (what) => z.string().uuid().describe(what);
const email = z.string().min(3).max(320).describe('The address the person typed. It is never echoed back: results show it masked.');
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = (extra = {}) => ({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, ...extra });

const idList = (what) => z.union([z.string().uuid(), z.array(z.string().uuid()).min(1).max(20)]).describe(what);
/** One filter for search, summary and a filtered list. Every key is optional and they combine with AND; unknown keys are refused. */
export const audienceFilter = z.object({
  status: z.union([z.string(), z.array(z.string()).min(1).max(7)]).optional().describe('One or more of: new, sent, delivered, engaged, bounced, unsubscribed, complained.'),
  engagement: z.union([z.string(), z.array(z.string()).min(1).max(4)]).optional().describe('One or more of: none, low, medium, high.'),
  consent_kind: z.enum(['explicit', 'inferred', 'none']).optional(),
  suppressed: z.boolean().optional().describe('true: only suppressed people. false: only people who are not.'),
  list_id: idList('On at least one of these lists.').optional(),
  list_id_not: idList('On none of these lists.').optional(),
  no_list: z.boolean().optional().describe('true: people who are on no list at all.'),
  campaign_id: idList('Took part in one of these campaigns.').optional(),
  batch_id: z.string().uuid().optional().describe('Created or added by this import batch (comms_list_imports).'),
  email_domain: z.string().max(253).optional().describe('The part after the @, exactly, for example example.com. No sub-domains, no @.'),
  search: z.string().max(200).optional().describe('Part of a name or address.'),
  date_from: z.string().max(40).optional().describe('Added on or after this date (ISO, for example 2026-01-31; a bare date starts at 00:00 UTC).'),
  date_to: z.string().max(40).optional().describe('Added on or before this date. A bare date such as 2026-11-04 includes that WHOLE day (to 23:59:59 UTC); a full timestamp is exact. The result echoes the range in plain words (interpreted).'),
  last_activity_from: z.string().max(40).optional().describe('Last campaign activity (send, delivery, open, click) on or after this date.'),
  last_activity_to: z.string().max(40).optional().describe('Last campaign activity on or before this date; a bare date includes the whole day.'),
  never_active: z.boolean().optional().describe('true: no campaign activity yet. Cannot be combined with the last-activity dates.'),
}).strict();

const importRow = z.object({
  email: z.string().max(320), name: z.string().max(200).optional(), phone: z.string().max(50).optional(),
  identityType: z.string().max(50).optional(), identityName: z.string().max(200).optional(),
}).strict();

export const COMMS_CONTACT_TOOLS = [
  {
    tool: 'comms_list_list_contacts', method: 'commsListListContacts', http: 'GET', route: '/comm-api/api/lists/{id}/contacts', read: true,
    title: 'Contacts on a list (masked)', annotations: READ,
    description: 'The members of one list, paged: id, status, consent kind and source, and quality. Addresses are MASKED '
      + '(j***@example.com) and names are initials only; phone numbers are never returned. Use the ids for comms_remove_from_list. To see real addresses the person '
      + 'opens the dashboard: do not try to get them. `q` searches by name or address. Counts come from this result.',
    input: { id: uuid('The list id.'), q: z.string().max(100).optional(), page: z.number().int().min(1).optional(), pageSize: z.number().int().min(1).max(200).optional() },
  },
  {
    tool: 'comms_find_contact', method: 'commsFindContact', http: 'GET', route: '/comm-api/api/recipients', read: true,
    title: 'Find a contact by address (masked)', annotations: READ,
    description: 'Look up ONE contact by the exact address the person gave you: id, status (new, sent, delivered, engaged, bounced, '
      + 'unsubscribed, complained), suppression reason, consent kind and how many lists they are on. The address is returned masked. Not found means nobody in '
      + 'this workspace has that exact address. Use it before comms_unsubscribe_contact or comms_add_suppression.',
    input: { email },
  },
  {
    tool: 'comms_search_audience', method: 'commsSearchAudience', http: 'POST', route: '/comm-api/api/recipients/search', read: true,
    title: 'Search the whole audience (masked)', annotations: READ,
    description: 'Search EVERY contact in the workspace, not one list: by domain, status, engagement, consent, suppression, campaign, import batch, dates, or "on no list" / "not on these lists". '
      + 'Each row: id, masked address, initials, status, engagement, last activity, suppression reason, and which lists the person is on (up to 5, plus list_count). Paged (limit up to 100, offset; sort recent, email or activity); total says how many match. '
      + 'Addresses are always masked: to find one person by the full address they gave, use comms_find_contact. To count rather than list, use comms_audience_summary; to turn a filter into a list, comms_derive_list with operation filter.',
    input: { filter: audienceFilter.optional(), limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).optional(), sort: z.enum(AUDIENCE_SORTS).optional() },
  },
  {
    tool: 'comms_audience_summary', method: 'commsAudienceSummary', http: 'POST', route: '/comm-api/api/recipients/summary', read: true,
    title: 'Counts across the whole audience', annotations: READ,
    description: 'Counts only, for the whole workspace or for a filter: total, by status, by consent, by engagement, the biggest domains, the biggest lists and how many people are on no list. '
      + 'No addresses at all. Use it to understand an audience before touching it, and to check an import or a derived list afterwards.',
    input: { filter: audienceFilter.optional(), top: z.number().int().min(1).max(20).optional().describe('How many domains and lists to show (default 10).') },
  },
  {
    tool: 'comms_suppression_info', method: 'commsSuppressionInfo', http: 'GET', route: '/comm-api/api/suppressions/lookup', read: true,
    title: 'Is this address suppressed, and why', annotations: READ,
    description: 'Read the account-wide suppression list for ONE address the person gave you: suppressed or not, the reason (manual, complaint, unsubscribe, bounce...), where it came from and since when. '
      + 'The address is returned masked. A suppression applies to every workspace of the account. Adding one is comms_add_suppression; removing one is only possible in the dashboard.',
    input: { email },
  },
  {
    tool: 'comms_import_contacts', method: 'commsImportContacts', http: 'POST', route: '/comm-api/api/lists/{id}/contacts/bulk',
    title: 'Import contacts into a list', annotations: WRITE({ idempotentHint: true }),
    description: 'Add up to ' + MAX_IMPORT_ROWS + ' contacts to a list from rows you were given. Clean messy rows yourself first. A bigger list, or a contact file, is not sent through chat: the person uploads it in the Motorical dashboard (Comm, Lists, the "Import Contacts (CSV)" card, on a computer), which keeps the file between them and Motorical. DRY RUN by default: every row gets its own '
      + 'outcome (created, added_existing, already_in_list, invalid, duplicate_in_request, rejected_unsafe, skipped_unsubscribed, skipped_bounced, skipped_inactive, '
      + 'skipped_suppressed) and nothing is written. People who unsubscribed, bounced or are suppressed in Motorical are never added back, but a new account does not know who opted out in the person\'s PREVIOUS tool: ask, and add those people with comms_add_suppression (or leave their rows out) BEFORE a real import. If consentConfirmed is false the contacts are still added with no consent recorded, and they can still be emailed (Motorical does not block a campaign on it): the person\'s answer is the only record of consent, so never pass true for people who did not agree. For many opt-outs (more than a handful) the person uses Comm, Suppressions, Bulk Import in the dashboard, not this tool. Safe to repeat. Show the person the '
      + 'summary first. BEFORE a real import you must ASK the person, in plain words, "Do these people know they will get your marketing email: did they sign up, '
      + 'or are they customers who agreed?", and pass their answer as consentConfirmed (true or false; never guess, never default). A sourceLabel (where the '
      + 'contacts came from) is required. Results show addresses masked.',
    input: {
      listId: uuid('The list to add them to.'), contacts: z.array(importRow).min(1),
      onExisting: z.enum(['keep', 'update']).optional().describe('keep (default): an existing contact\'s own values win; update: what you send wins.'),
      sourceLabel: z.string().min(1).max(200).describe('Where these contacts came from, in a few words. Required.'),
      consentConfirmed: z.boolean().optional().describe('The person\'s answer to the consent question. Required for a real import.'),
      batchId: z.string().uuid().optional().describe('The batchId an earlier call returned. Pass it to add this call to the SAME import, so one comms_undo_import takes back all of it (a big file sent in several calls).'),
    },
  },
  {
    tool: 'comms_remove_from_list', method: 'commsRemoveFromList', http: 'POST', route: '/comm-api/api/lists/{id}/contacts/bulk-remove',
    title: 'Remove contacts from a list', annotations: WRITE({ idempotentHint: true }),
    description: 'Take up to 100 contacts, by id, off ONE list. The contacts themselves are NOT deleted and stay on '
      + 'other lists; they can be added again. DRY RUN by default: names the list and how many ids it would try to remove. There is no "remove everyone matching" '
      + 'mode. Get the ids from comms_list_list_contacts.',
    input: { listId: uuid('The list.'), contactIds: z.array(z.string().uuid()).min(1).max(MAX_REMOVE_IDS) },
  },
  {
    tool: 'comms_derive_list', method: 'commsDeriveList', http: 'POST', route: '/comm-api/api/lists/derive', create: true,
    title: 'Derive a list from other lists', annotations: WRITE(),
    description: 'Make a NEW list from other lists: union, intersection (needs two or more sources) or difference (sources minus '
      + 'excludeListIds), up to 10 sources. Or operation filter: a list of everyone in the workspace who matches a `filter` (the same filter as comms_search_audience: a domain, a status, a campaign, "on no list"...; '
      + 'give filter and no source lists, at least one filter key is required, at most 10000 people). Suppressed people are copied but stay ineligible, and the dry run counts them apart (would_be_eligible). The result is a one-time SNAPSHOT, not live; it records its sources. DRY RUN by default: returns the counts and creates '
      + 'nothing. A description is required. Only active, not-suppressed members are copied. A retry never creates a second list.',
    input: {
      name: z.string().min(1).max(200), description: z.string().min(1).max(1000).describe('What the list is for. Required.'),
      operation: z.enum(DERIVE_OPERATIONS), sourceListIds: z.array(z.string().uuid()).min(1).max(10).optional(), excludeListIds: z.array(z.string().uuid()).max(10).optional(),
      filter: audienceFilter.optional().describe('Only with operation filter.'),
      sourceLabel: z.string().max(200).optional(),
    },
  },
  {
    tool: 'comms_unsubscribe_contact', method: 'commsUnsubscribeContact', http: 'POST', route: '/comm-api/api/contacts/{id}/unsubscribe',
    title: 'Unsubscribe a contact', annotations: WRITE({ idempotentHint: true }),
    description: 'Honour a request to stop emailing one person, found by the exact address they gave. DRY RUN by default: '
      + 'shows the contact (masked) and its status. Do the dry run, tell the person who you found, and get a clear yes in chat BEFORE dryRun:false. You cannot undo '
      + 'it from here: there is no resubscribe tool, because only the person (or the account owner in the dashboard) may opt someone back in. Someone already '
      + 'unsubscribed, bounced or complained is reported as no change.',
    input: { email },
  },
  {
    tool: 'comms_add_suppression', method: 'commsAddSuppression', http: 'POST', route: '/comm-api/api/suppressions',
    title: 'Suppress an address', annotations: WRITE({ idempotentHint: true }),
    description: 'Stop all marketing email to an address. The suppression is ACCOUNT-WIDE: it applies to every workspace of this '
      + 'account, not just this one. Reasons: manual (the person asked), complaint (they reported spam), unsubscribe. Bounces are recorded automatically. DRY RUN by '
      + 'default: says what would be added, and the contact (masked) if there is one. One address at a time: for many addresses (for example a previous tool\'s unsubscribed list) the person uses Comm, Suppressions, Bulk Import in the dashboard instead. Get the person\'s clear yes in chat BEFORE dryRun:false. It cannot be removed '
      + 'from here; only the account owner can, in the dashboard.',
    input: { email, reason: z.enum(SUPPRESSION_REASONS) },
  },
  {
    tool: 'comms_add_suppressions', method: 'commsAddSuppressions', http: 'POST', route: '/comm-api/api/suppressions/bulk',
    title: 'Suppress many addresses', annotations: WRITE({ idempotentHint: true }),
    description: 'Stop all marketing email to up to ' + MAX_SUPPRESS_EMAILS + ' addresses at once, for example the people who opted out in the person\'s PREVIOUS tool: do this BEFORE importing their list. '
      + 'ACCOUNT-WIDE, like comms_add_suppression, and it cannot be removed from here. DRY RUN by default: counts the addresses and shows a masked sample, writes nothing. '
      + 'More than ' + MAX_SUPPRESS_EMAILS + ': call again with the next ' + MAX_SUPPRESS_EMAILS + '. Get the person\'s clear yes in chat BEFORE dryRun:false. Addresses are never echoed back.',
    input: { emails: z.array(z.string().min(3).max(320)).min(1).max(MAX_SUPPRESS_EMAILS), reason: z.enum(SUPPRESSION_REASONS) },
  },
  {
    tool: 'comms_list_imports', method: 'commsListImports', http: 'GET', route: '/comm-api/api/lists/{id}/imports', read: true,
    title: 'Imports into a list', annotations: READ,
    description: 'The recent imports into one list: batchId, source, when, how many contacts it created, how many existing contacts it only added, and whether it was undone. '
      + 'Use the batchId with comms_undo_import. Only imports made with comms_import_contacts or the JSON import API have a batch; a CSV import from the dashboard does not.',
    input: { listId: uuid('The list.') },
  },
  {
    tool: 'comms_undo_import', method: 'commsUndoImport', http: 'POST', route: '/comm-api/api/lists/{id}/imports/{batchId}/undo',
    title: 'Undo an import', annotations: WRITE({ idempotentHint: true }),
    description: 'Take back one import: the batch\'s people leave the list, and the contacts the import CREATED that are now on no list are erased. People who already existed are only taken off this list, not erased. '
      + 'Anyone who has unsubscribed, bounced or is suppressed since is kept. DRY RUN by default: says how many would leave the list and how many contacts would be erased. A batch can be undone once. Show the person the numbers and get a clear yes BEFORE dryRun:false.',
    input: { listId: uuid('The list.'), batchId: uuid('The batchId from comms_list_imports or from the import result.') },
  },
  {
    tool: 'comms_set_list_archived', method: 'commsSetListArchived', http: 'POST', route: '/comm-api/api/lists/{id}/archive',
    title: 'Archive or restore a list', annotations: WRITE({ idempotentHint: true }),
    description: 'Put a list away without deleting it, or bring it back (archived:false, POST /comm-api/api/lists/{id}/unarchive). An archived list is hidden from comms_list_lists unless you ask for it and cannot be sent to; nothing else changes and no contact is touched. '
      + 'A list a campaign sends to or excludes cannot be archived. DRY RUN by default. Prefer this to deleting when the person is not sure.',
    input: { listId: uuid('The list.'), archived: z.boolean().describe('true to archive, false to restore.') },
  },
  {
    tool: 'comms_delete_list', method: 'commsDeleteList', http: 'DELETE', route: '/comm-api/api/lists/{id}',
    title: 'Delete a list', annotations: WRITE({ destructiveHint: true, idempotentHint: true }),
    description: 'Delete one list for good. Needs the manage:comms.audience permission, which the person adds in the dashboard. A list is only a set of memberships, so you must also say what happens to the people on it: '
      + 'contacts=delete_orphans erases the contacts that are on no other list (people who unsubscribed, bounced or are suppressed are ALWAYS kept, so they cannot be mailed again by a later import); contacts=keep leaves every contact in the workspace. '
      + 'DRY RUN by default and it reports exactly how many people each choice affects. ASK the person which they want ("also delete the people who are on no other list?"), show the numbers, and pass their answer as contacts on the real call: it is required and never defaulted. '
      + 'A list a draft, scheduled or sending campaign sends to, or any campaign excludes, cannot be deleted. Cannot be undone.',
    input: { listId: uuid('The list.'), contacts: z.enum(CONTACT_MODES).optional().describe('delete_orphans or keep. Required for a real delete; the person\'s answer.') },
  },
  {
    tool: 'comms_cleanup_orphan_contacts', method: 'commsCleanupOrphans', http: 'POST', route: '/comm-api/api/contacts/cleanup-orphans',
    title: 'Clean up contacts on no list', annotations: WRITE({ destructiveHint: true, idempotentHint: true }),
    description: 'Erase the contacts that are on no list at all, for example people left behind when lists were deleted earlier. Needs manage:comms.audience. People who unsubscribed, bounced or are suppressed are never erased. '
      + 'DRY RUN by default: says how many are on no list and how many would be erased. Show the person the numbers and get a clear yes BEFORE dryRun:false. Cannot be undone.',
    input: {},
  },
  {
    tool: 'comms_delete_contact', method: 'commsDeleteContact', http: 'DELETE', route: '/comm-api/api/contacts/{id}',
    title: 'Erase one contact', annotations: WRITE({ destructiveHint: true, idempotentHint: true }),
    description: 'Erase ONE person from the workspace, found by the exact address they gave: the right to erasure. Needs manage:comms.audience. They leave every list; campaign statistics stay but are no longer linked to them. '
      + 'If they unsubscribed or are suppressed, the suppression stays, so they are not mailed again. DRY RUN by default: shows the contact (masked) and how many lists they are on. Tell the person who you found and get a clear yes BEFORE dryRun:false. Cannot be undone.',
    input: { email },
  },
  {
    tool: 'comms_delete_campaign', method: 'commsDeleteCampaign', http: 'DELETE', route: '/comm-api/api/campaigns/{id}',
    title: 'Delete a campaign (recycle bin)', annotations: WRITE({ destructiveHint: true, idempotentHint: true }),
    description: 'Move a campaign to the recycle bin. Nothing is erased: the person can restore it in the dashboard. A campaign that is scheduled or sending is REFUSED: cancel it first with comms_cancel_campaign, which needs its own permission. '
      + 'Needs manage:comms.audience, like every delete. DRY RUN by default: names the campaign and its status. Show the person which one and get a clear yes BEFORE dryRun:false.',
    input: { id: uuid('The campaign id.') },
  },
  {
    tool: 'comms_delete_template', method: 'commsDeleteTemplate', http: 'DELETE', route: '/comm-api/api/templates/{id}',
    title: 'Delete a template', annotations: WRITE({ destructiveHint: true, idempotentHint: true }),
    description: 'Delete ONE template for good. Needs manage:comms.audience. A template that any campaign uses (even a finished or deleted one) is REFUSED with the campaigns named: delete or change those first. '
      + 'DRY RUN by default: names the template and says whether it can go. Show the person which one and get a clear yes BEFORE dryRun:false. Cannot be undone: if they may want it back, comms_duplicate_template first. To clear out test drafts, use this once per template.',
    input: { id: uuid('The template id.') },
  },
  {
    tool: 'comms_resubscribe_contact', method: 'commsResubscribeContact', http: 'PUT', route: '/comm-api/api/contacts/{id}/resubscribe',
    title: 'Opt a contact back in', annotations: WRITE({ idempotentHint: true }),
    description: 'Opt a person who unsubscribed back in, found by the exact address. Needs manage:comms.audience. Only do this when the PERSON asked to be emailed again; the account owner\'s wish to mail them is not a reason. '
      + 'Someone who reported your mail as spam cannot be opted back in from here. DRY RUN by default: shows the contact (masked) and its status. Get the person\'s clear yes, and ask how the contact asked to be re-subscribed, BEFORE dryRun:false.',
    input: { email },
  },
  {
    tool: 'comms_get_dashboard_link', method: 'commsGetDashboardLink', http: 'GET', route: null, read: true, noWorkspace: true,
    title: 'Where to do it in the dashboard', annotations: READ,
    description: 'For the few things that must stay between the person and Motorical, not pass through chat: uploading a large contact file (import_csv), exporting a list (export_list: real addresses are never given to an agent) and many opt-outs (bulk_suppressions, if more than a few hundred). '
      + 'Returns the exact steps and the dashboard address to give the person. Calls no API and reads nothing.',
    input: { purpose: z.enum(DASHBOARD_PURPOSES) },
  },
];

/** The registry entry for one table row. Reads take no dryRun; writes do; derive also takes an idempotencyKey. */
export function contactRegistryEntry(row) {
  return {
    name: row.tool,
    description: row.description,
    inputSchema: { ...(row.noWorkspace ? {} : { workspaceId }), ...(row.read ? {} : { dryRun }), ...row.input, ...(row.create ? { idempotencyKey } : {}) },
    annotations: { title: row.title, ...row.annotations },
    handler: (client) => async (args) => client[row.method](args),
  };
}
