/**
 * The Communications management family (Comms MCP M3-7): workspace settings and webhooks. Declared once; the logic is in commsManage.js and the plan is
 * motorical-docs plans/2026-10-27-comms-mcp-m3-7-workspace-and-webhooks.md.
 *
 * - two reads (read:comms), four workspace tools (manage:comms.workspace), three webhook tools (manage:comms.webhooks);
 * - every write is a DRY RUN unless dryRun:false; pointing a webhook somewhere else also needs confirm:true and the signed token of the preview,
 *   because campaign events carry recipient addresses;
 * - a webhook URL is shown as its host only; there is no tool to create a webhook (its signing secret is shown once, to a person), to make a
 *   workspace the default, to replace or remove sending identities, or to delete a workspace.
 */

import { z } from 'zod';
import { workspaceId, dryRun } from './commsWriteTools.js';

export const WEBHOOK_EVENTS = ['campaign.completed', 'message.delivered', 'message.bounced', 'message.complained', 'contact.unsubscribed', 'contact.consent_given'];

const uuid = (what) => z.string().uuid().describe(what);
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = (extra = {}) => ({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, ...extra });
const confirm = z.boolean().optional().describe('true only after the person has said yes to what the dry run showed.');

export const COMMS_MANAGE_TOOLS = [
  {
    tool: 'comms_get_workspace_settings', method: 'commsGetWorkspaceSettings', http: 'GET', route: '/comm-api/api/workspaces/{id}/settings', read: true,
    title: 'Workspace settings', annotations: READ,
    description: 'The three settings of one workspace, each with a plain explanation: whether a click counts as consent '
      + '(click_consent_enabled), whether opens are tracked (open_tracking_enabled), and the page recipients land on after unsubscribing (unsubscribe_landing_url, or null for the '
      + 'default). They are workspace settings: they apply to every campaign and a campaign cannot override them. The person decides each one; never change one on your own. '
      + 'Read this before drafting templates or campaigns, and use the explanations (what it does, what recipients experience, what the person decides) when you talk about them. '
      + 'Note that click consent is separate from a consent-request campaign (the {{consent_url}} button), which works whether click consent is on or off. Read-only.',
    input: {},
  },
  {
    tool: 'comms_list_webhooks', method: 'commsListWebhooks', http: 'GET', route: '/comm-api/api/workspaces/{id}/webhooks', read: true,
    title: 'Webhooks', annotations: READ,
    description: 'The webhooks of one workspace: id, where it sends (host only; the path and query string are hidden because they can hold a '
      + 'token), the events it listens to, whether it is enabled, how many deliveries failed in a row and the status of the last one. Never a signing secret. Read-only.',
    input: {},
  },
  {
    tool: 'comms_create_workspace', method: 'commsCreateWorkspace', http: 'POST', route: '/comm-api/api/workspaces', account: true,
    title: 'Create a workspace', annotations: WRITE({ idempotentHint: false }),
    description: 'Create an additional marketing workspace. Most customers need only their default workspace: create one only when the person asks to keep a '
      + 'brand, client or sender separate. DRY RUN by default. A name that already exists is reported, not created again (so a retry is safe). The account owner is emailed when an '
      + 'assistant creates a workspace. A new workspace has no sending identity: give it one with comms_add_sending_identity (needs a verified domain).',
    input: { name: z.string().min(1).max(100).describe('The workspace name, for example the brand or client.'), slug: z.string().max(48).optional().describe('Optional URL-safe short name.') },
  },
  {
    tool: 'comms_update_workspace', method: 'commsUpdateWorkspace', http: 'PATCH', route: '/comm-api/api/workspaces/{id}', account: true,
    title: 'Rename a workspace', annotations: WRITE(),
    description: 'Rename a workspace or change its short name. DRY RUN by default: shows the previous and new values. Making a workspace the default '
      + 'is not possible here: only a person can do that in the dashboard.',
    input: { id: uuid('The workspace id.'), name: z.string().min(1).max(100).optional(), slug: z.string().max(48).optional() },
  },
  {
    tool: 'comms_update_workspace_settings', method: 'commsUpdateWorkspaceSettings', http: 'PATCH', route: '/comm-api/api/workspaces/{id}/settings/consent',
    title: 'Change workspace settings', annotations: WRITE(),
    description: 'Change the settings of one workspace: clickConsentEnabled (a click on a campaign link counts as the recipient giving consent), openTracking (whether opens are tracked) and '
      + 'unsubscribeLandingUrl (the https page recipients are sent to after they confirm an unsubscribe; null restores the default). DRY RUN by default: shows each setting from and to, '
      + 'with its plain explanation. Show the person every change and what it means for their recipients, and get a clear yes before dryRun:false; click consent in particular affects '
      + 'how consent is recorded for the people you email. A change voids any preflight made before it: preflight again before scheduling. '
      + 'Only the settings you pass are touched; ones already at that value are left alone.',
    input: {
      clickConsentEnabled: z.boolean().optional().describe('true: a click counts as consent. false: it does not.'),
      openTracking: z.boolean().optional().describe('Track opens, or not.'),
      unsubscribeLandingUrl: z.string().max(2000).nullable().optional().describe('An https address on a domain the account owns, or null for the default page.'),
    },
  },
  {
    tool: 'comms_add_sending_identity', method: 'commsAddSendingIdentity', http: 'POST', route: '/comm-api/api/workspaces/{id}/motor-blocks/add',
    title: 'Add a sending identity to a workspace', annotations: WRITE(),
    description: 'Give a workspace the marketing sending identity of a verified domain: finds or creates the sending identity (a '
      + 'marketing Motor Block) for that domain and ADDS it to the workspace. It never replaces or removes anything. The domain must be the account\'s own and verified '
      + '(DOMAIN_NOT_VERIFIED otherwise; add and verify domains with the domain tools). DRY RUN by default. Campaigns of that workspace can then send from addresses on the domain.',
    input: { domainId: uuid('The id of a verified domain of this account.'), name: z.string().max(100).optional().describe('Optional name for a newly created sending identity.') },
  },
  {
    tool: 'comms_update_webhook', method: 'commsUpdateWebhook', http: 'PATCH', route: '/comm-api/api/workspaces/{id}/webhooks/{wid}',
    title: 'Change a webhook', annotations: WRITE(),
    description: 'Change a webhook: its events, whether it is enabled, or where it sends (url, https only). DRY RUN by default. '
      + 'CHANGING WHERE IT SENDS is guarded: campaign events carry recipient email addresses (unsubscribes, consent, bounces, deliveries), so the dry run names the old and new host, '
      + 'warns, and returns a confirmToken; after the person has said yes to that, call again with the same arguments plus dryRun:false, confirm:true and the token. The account owner is '
      + 'emailed about every address change, and if they cannot be emailed the change is refused. Events and pausing need only the dry run and the person\'s yes. You cannot create a webhook '
      + '(its signing secret is shown once, to a person, in the dashboard) and you never see a secret.',
    input: {
      webhookId: uuid('The webhook id (from comms_list_webhooks).'),
      events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional().describe('The events it listens to (replaces the current list).'),
      enabled: z.boolean().optional().describe('false pauses it, true resumes it.'),
      url: z.string().max(2000).optional().describe('A new https address to send to. Needs the confirmed preview.'),
      confirm,
      confirmToken: z.string().max(2000).optional().describe('The confirmToken from the matching dry run (address changes only).'),
    },
  },
  {
    tool: 'comms_delete_webhook', method: 'commsDeleteWebhook', http: 'DELETE', route: '/comm-api/api/workspaces/{id}/webhooks/{wid}',
    title: 'Delete a webhook (final)', annotations: WRITE({ destructiveHint: true }),
    description: 'Delete a webhook for good. It cannot be undone and its signing secret cannot be recovered: re-creating it is done by a '
      + 'person in the dashboard. To stop events without losing it, pause it with comms_update_webhook (enabled:false). DRY RUN by default; the real call needs dryRun:false and confirm:true '
      + 'after a clear yes.',
    input: { webhookId: uuid('The webhook id.'), confirm },
  },
  {
    tool: 'comms_test_webhook', method: 'commsTestWebhook', http: 'POST', route: '/comm-api/api/workspaces/{id}/webhooks/{wid}/test',
    title: 'Send a test event to a webhook', annotations: WRITE({ idempotentHint: false, openWorldHint: true }),
    description: 'Queue one test event to a webhook. The event carries no personal data. DRY RUN by default. It is limited per webhook '
      + 'per hour (WEBHOOK_TEST_LIMIT says when to retry). Use it after creating or changing a webhook to show it works; check the result in the receiving system.',
    input: { webhookId: uuid('The webhook id.') },
  },
];

/** The registry entry for one table row. */
export function manageRegistryEntry(row) {
  return {
    name: row.tool,
    description: row.description,
    inputSchema: { ...(row.account ? {} : { workspaceId }), ...(row.read ? {} : { dryRun }), ...row.input },
    annotations: { title: row.title, ...row.annotations },
    handler: (client) => async (args) => client[row.method](args),
  };
}
