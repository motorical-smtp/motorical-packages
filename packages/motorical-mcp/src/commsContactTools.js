/**
 * The Communications contact family (Comms MCP M3-3): two reads (read:comms) and five writes (write:comms.audience), declared once like
 * the read and write families. Logic is in commsContacts.js. No new scope and no new consent.
 *
 * Rules built in (plan: motorical-docs plans/2026-10-27-comms-mcp-m3-3-contacts.md):
 * - every write defaults to a DRY RUN; a real write needs dryRun:false;
 * - a real import needs the person's consent answer (true OR false), never defaulted;
 * - addresses are ALWAYS masked (commsMask.js); there is no way to ask for a real one;
 * - nothing deletes or erases a contact, resubscribes anyone, exports data, or sends.
 */

import { z } from 'zod';
import { workspaceId, dryRun, idempotencyKey } from './commsWriteTools.js';

export const SUPPRESSION_REASONS = ['manual', 'complaint', 'unsubscribe'];
export const DERIVE_OPERATIONS = ['union', 'intersection', 'difference'];
export const MAX_IMPORT_ROWS = 1001;
export const MAX_REMOVE_IDS = 100;

const uuid = (what) => z.string().uuid().describe(what);
const email = z.string().min(3).max(320).describe('The address the person typed. It is never echoed back: results show it masked.');
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = (extra = {}) => ({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, ...extra });

const importRow = z.object({
  email: z.string().max(320), name: z.string().max(200).optional(), phone: z.string().max(50).optional(),
  identityType: z.string().max(50).optional(), identityName: z.string().max(200).optional(),
}).strict();

export const COMMS_CONTACT_TOOLS = [
  {
    tool: 'comms_list_list_contacts', method: 'commsListListContacts', http: 'GET', route: '/comm-api/api/lists/{id}/contacts', read: true,
    title: 'Contacts on a list (masked)', annotations: READ,
    description: 'The members of one list (GET /comm-api/api/lists/{id}/contacts), paged: id, status, consent kind and source, and quality. Addresses are MASKED '
      + '(j***@example.com) and names are initials only; phone numbers are never returned. Use the ids for comms_remove_from_list. To see real addresses the person '
      + 'opens the dashboard: do not try to get them. `q` searches by name or address. Counts come from this result.',
    input: { id: uuid('The list id.'), q: z.string().max(100).optional(), page: z.number().int().min(1).optional(), pageSize: z.number().int().min(1).max(200).optional() },
  },
  {
    tool: 'comms_find_contact', method: 'commsFindContact', http: 'GET', route: '/comm-api/api/recipients', read: true,
    title: 'Find a contact by address (masked)', annotations: READ,
    description: 'Look up ONE contact by the exact address the person gave you (GET /comm-api/api/recipients): id, status (new, sent, delivered, engaged, bounced, '
      + 'unsubscribed, complained), suppression reason, consent kind and how many lists they are on. The address is returned masked. Not found means nobody in '
      + 'this workspace has that exact address. Use it before comms_unsubscribe_contact or comms_add_suppression.',
    input: { email },
  },
  {
    tool: 'comms_import_contacts', method: 'commsImportContacts', http: 'POST', route: '/comm-api/api/lists/{id}/contacts/bulk',
    title: 'Import contacts into a list', annotations: WRITE({ idempotentHint: true }),
    description: 'Add up to ' + MAX_IMPORT_ROWS + ' contacts to a list from rows you were given (POST /comm-api/api/lists/{id}/contacts/bulk). Clean messy rows yourself first. A bigger list, or a contact file, is not sent through chat: the person uploads it in the Motorical dashboard (Comm, Lists, the "Import Contacts (CSV)" card, on a computer), which keeps the file between them and Motorical. DRY RUN by default: every row gets its own '
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
    },
  },
  {
    tool: 'comms_remove_from_list', method: 'commsRemoveFromList', http: 'POST', route: '/comm-api/api/lists/{id}/contacts/bulk-remove',
    title: 'Remove contacts from a list', annotations: WRITE({ idempotentHint: true }),
    description: 'Take up to 100 contacts, by id, off ONE list (POST /comm-api/api/lists/{id}/contacts/bulk-remove). The contacts themselves are NOT deleted and stay on '
      + 'other lists; they can be added again. DRY RUN by default: names the list and how many ids it would try to remove. There is no "remove everyone matching" '
      + 'mode. Get the ids from comms_list_list_contacts.',
    input: { listId: uuid('The list.'), contactIds: z.array(z.string().uuid()).min(1).max(MAX_REMOVE_IDS) },
  },
  {
    tool: 'comms_derive_list', method: 'commsDeriveList', http: 'POST', route: '/comm-api/api/lists/derive', create: true,
    title: 'Derive a list from other lists', annotations: WRITE(),
    description: 'Make a NEW list from other lists (POST /comm-api/api/lists/derive): union, intersection (needs two or more sources) or difference (sources minus '
      + 'excludeListIds), up to 10 sources. The result is a one-time SNAPSHOT, not live; it records its sources. DRY RUN by default: returns the counts and creates '
      + 'nothing. A description is required. Only active, not-suppressed members are copied. A retry never creates a second list.',
    input: {
      name: z.string().min(1).max(200), description: z.string().min(1).max(1000).describe('What the list is for. Required.'),
      operation: z.enum(DERIVE_OPERATIONS), sourceListIds: z.array(z.string().uuid()).min(1).max(10), excludeListIds: z.array(z.string().uuid()).max(10).optional(),
      sourceLabel: z.string().max(200).optional(),
    },
  },
  {
    tool: 'comms_unsubscribe_contact', method: 'commsUnsubscribeContact', http: 'POST', route: '/comm-api/api/contacts/{id}/unsubscribe',
    title: 'Unsubscribe a contact', annotations: WRITE({ idempotentHint: true }),
    description: 'Honour a request to stop emailing one person (POST /comm-api/api/contacts/{id}/unsubscribe), found by the exact address they gave. DRY RUN by default: '
      + 'shows the contact (masked) and its status. Do the dry run, tell the person who you found, and get a clear yes in chat BEFORE dryRun:false. You cannot undo '
      + 'it from here: there is no resubscribe tool, because only the person (or the account owner in the dashboard) may opt someone back in. Someone already '
      + 'unsubscribed, bounced or complained is reported as no change.',
    input: { email },
  },
  {
    tool: 'comms_add_suppression', method: 'commsAddSuppression', http: 'POST', route: '/comm-api/api/suppressions',
    title: 'Suppress an address', annotations: WRITE({ idempotentHint: true }),
    description: 'Stop all marketing email to an address (POST /comm-api/api/suppressions). The suppression is ACCOUNT-WIDE: it applies to every workspace of this '
      + 'account, not just this one. Reasons: manual (the person asked), complaint (they reported spam), unsubscribe. Bounces are recorded automatically. DRY RUN by '
      + 'default: says what would be added, and the contact (masked) if there is one. One address at a time: for many addresses (for example a previous tool\'s unsubscribed list) the person uses Comm, Suppressions, Bulk Import in the dashboard instead. Get the person\'s clear yes in chat BEFORE dryRun:false. It cannot be removed '
      + 'from here; only the account owner can, in the dashboard.',
    input: { email, reason: z.enum(SUPPRESSION_REASONS) },
  },
];

/** The registry entry for one table row. Reads take no dryRun; writes do; derive also takes an idempotencyKey. */
export function contactRegistryEntry(row) {
  return {
    name: row.tool,
    description: row.description,
    inputSchema: { workspaceId, ...(row.read ? {} : { dryRun }), ...row.input, ...(row.create ? { idempotencyKey } : {}) },
    annotations: { title: row.title, ...row.annotations },
    handler: (client) => async (args) => client[row.method](args),
  };
}
