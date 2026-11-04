/**
 * The Communications reporting reads (Comms MCP M3-6): five read-only tools that answer "how did it go?". Declared once; the client methods
 * live in commsReports.js. Every tool needs `read:comms` and nothing else.
 *
 * Rules built in:
 * - nothing here returns a recipient address, an IP address or a user agent (masked or stripped, and the Comms Block redacts events on its side too);
 * - the report always carries its basis (open counts are estimates) and the time the numbers are from;
 * - a campaign that has not sent says "no data yet", never a row of zero rates;
 * - events are paged at 50 and are for answering one specific question, not for reading everything.
 */

import { z } from 'zod';

export const EVENT_TYPES = ['queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'blocked', 'opened', 'clicked', 'unsubscribed'];
export const MAX_EVENTS_PAGE = 50;

const workspaceId = z.string().uuid().optional()
  .describe('The Communications workspace. Optional when the authorization covers exactly one; otherwise required (the error lists the choices, the account default first).');
const uuid = (what) => z.string().uuid().describe(what);
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const COMMS_REPORT_TOOLS = [
  {
    tool: 'comms_get_campaign_report', method: 'commsGetCampaignReport', http: 'GET', route: '/comm-api/api/campaigns/{id}/report', ids: ['id'],
    title: 'How a campaign did',
    description: 'The result of one campaign (GET /comm-api/api/campaigns/{id}/report): handed off, accepted, delivered, bounced, failed, complained, '
      + 'opened and clicked, per recipient, with rates and the denominator of each, the time the numbers are from, and whether delivery outcomes '
      + 'are still syncing. The plain array has the same numbers as sentences with the denominators written out; quote those. Open counts are '
      + 'ESTIMATES (Apple Mail Privacy Protection and the Gmail image proxy inflate them): always say so when you quote one, and prefer clicks. '
      + 'A campaign that has not sent returns sent:false and no rates; say there is no data yet. Read-only.',
    input: { id: uuid('The campaign id.') },
  },
  {
    tool: 'comms_get_campaign_links', method: 'commsGetCampaignLinks', http: 'GET', route: '/comm-api/api/campaigns/{id}/click-breakdown', ids: ['id'],
    title: 'Which links were clicked',
    description: 'Clicks per link for one campaign (GET /comm-api/api/campaigns/{id}/click-breakdown): total and unique clicks, most clicked first. '
      + 'The query string and fragment of every link are replaced with ... because they can carry personal tokens; the path is enough to tell links apart. Read-only.',
    input: { id: uuid('The campaign id.') },
  },
  {
    tool: 'comms_get_campaign_timeline', method: 'commsGetCampaignTimeline', http: 'GET', route: '/comm-api/api/campaigns/{id}/analytics', ids: ['id'],
    title: 'A campaign day by day',
    description: 'A campaign activity per day for the last days (GET /comm-api/api/campaigns/{id}/analytics?days=): a summary, a daily breakdown and the '
      + '25 most recent events. Recipient addresses in the recent events are masked (j***@example.com). days is 1 to 30, default 7. Use it to answer '
      + '"when did people open?" or "is it still moving?". Read-only.',
    input: { id: uuid('The campaign id.'), days: z.number().int().min(1).max(30).optional().describe('How many days back (1 to 30, default 7).') },
  },
  {
    tool: 'comms_list_campaign_events', method: 'commsListCampaignEvents', http: 'GET', route: '/comm-api/api/campaigns/{id}/events', ids: ['id'],
    title: 'Campaign events',
    description: 'Individual events of one campaign (GET /comm-api/api/campaigns/{id}/events), newest first, at most 50 per page: type, time and the '
      + 'contact as an id. Never an address, an IP address or a user agent. Use it only to answer a specific question (for example the bounces); for '
      + 'the overall result use comms_get_campaign_report. Filter with type; read the next page with page. Read-only.',
    input: {
      id: uuid('The campaign id.'),
      type: z.enum(EVENT_TYPES).optional().describe('Only events of this type.'),
      page: z.number().int().min(1).optional().describe('Page number, starting at 1 (default 1).'),
      pageSize: z.number().int().min(1).max(MAX_EVENTS_PAGE).optional().describe(`Events per page (default ${MAX_EVENTS_PAGE}, at most ${MAX_EVENTS_PAGE}).`),
    },
  },
  {
    tool: 'comms_get_analytics_overview', method: 'commsGetAnalyticsOverview', http: 'GET', route: '/comm-api/api/analytics/overview',
    title: 'Results across all campaigns',
    description: 'The workspace event totals and its top campaigns for the last days (GET /comm-api/api/analytics/overview?days=): events by type with '
      + 'the number of campaigns and unique recipients, and the ten campaigns with the most clicks. days is 1 to 365, default 30. Open counts are '
      + 'estimates. For one campaign use comms_get_campaign_report. Read-only.',
    input: { days: z.number().int().min(1).max(365).optional().describe('How many days back (1 to 365, default 30).') },
  },
];

/** The registry entry for one table row. */
export function reportRegistryEntry(row) {
  return {
    name: row.tool,
    description: row.description,
    inputSchema: { workspaceId, ...row.input },
    annotations: { title: row.title, ...READ_ONLY },
    handler: (client) => async (args) => client[row.method](args),
  };
}
