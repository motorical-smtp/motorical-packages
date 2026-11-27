// GENERATED from docs-site/static/openapi.json by packages/sdk-generator/generate.js. Do not edit.
// OpenAPI 1.11.0. Arguments: path, query and header parameters by name, the request body as `body`,
// and for Communications calls `workspaceId`. Every method resolves to the parsed JSON response.
export interface MotoricalConfig {
  /** Motor Block API key (mk_live_...) for the Send API. */ apiKey?: string;
  /** Account API key (ak_live_...) for token minting and the Communications API. */ accountKey?: string;
  /** Public API bearer token (or an OAuth access token) for /api/public/v1. */ bearerToken?: string;
  /** Dashboard session JWT (onboarding, sandbox, token minting). */ dashboardToken?: string;
  /** Default Communications workspace (X-Tenant-Id). */ workspaceId?: string;
  /** Defaults to https://api.motorical.com. */ baseUrl?: string;
  /** Overrides the Communications API host (https://motorical.com). */ commsBaseUrl?: string;
  fetch?: typeof fetch; userAgent?: string;
}
export type Args = Record<string, unknown> & { body?: unknown; workspaceId?: string };
export declare class MotoricalError extends Error { status: number; code: string | null; requestId: string | null; body: unknown; }
export declare class Motorical {
  constructor(config?: MotoricalConfig);
  /** POST /api/public/v1/domains: Add a customer domain (account-wide, OAuth/MCP-capable) */
  addDomain(args: Args): Promise<any>;
  /** POST /api/domains: Add a customer domain */
  addDomainDashboard(args: Args): Promise<any>;
  /** POST /api/public/v1/account/free-recipients: Ask a recipient to allow test email (OAuth/Public API bearer) */
  addFreeRecipient(args: Args): Promise<any>;
  /** POST /api/public/v1/account/motor-blocks/{id}/assign-domain: Assign a verified domain to a Motor Block */
  assignMotorBlockDomain(args: Args): Promise<any>;
  /** PATCH /api/public/v1/account/motor-blocks/{id}/type: Switch a Motor Block between transactional and general_purpose */
  changeMotorBlockType(args: Args): Promise<any>;
  /** POST /api/public/v1/domains/{id}/check-dns: Check DKIM/SPF/DMARC and persist send-readiness flags (account-wide, OAuth/MCP-capable) */
  checkDomainDns(args: Args): Promise<any>;
  /** POST /api/domains/{id}/check-dns: Check DKIM/SPF/DMARC and persist send-readiness flags */
  checkDomainDnsDashboard(args: Args): Promise<any>;
  /** GET /api/public/v1/account/authorization/motor-blocks/{id}: Live grant-coverage check for one Motor Block (infrastructure) */
  checkMotorBlockAuthorization(args: Args): Promise<any>;
  /** POST /comm-api/api/lists/{id}/contacts: Add contacts to a list */
  commsAddListContact(args: Args): Promise<any>;
  /** POST /comm-api/api/lists/{id}/contacts/bulk: Add up to 1001 contacts as JSON, with a dry run and a result for every row */
  commsAddListContacts(args: Args): Promise<any>;
  /** POST /comm-api/api/workspaces/{id}/motor-blocks/from-domain: Resolve a sending domain to a companion marketing Motor Block */
  commsAddSendingIdentity(args: Args): Promise<any>;
  /** POST /comm-api/api/suppressions: Add a suppression */
  commsAddSuppression(args?: Args): Promise<any>;
  /** POST /comm-api/api/suppressions/bulk: Bulk import suppressions */
  commsAddSuppressions(args?: Args): Promise<any>;
  /** POST /comm-api/api/templates/fix: Apply the safe fixes to a template in memory */
  commsApplyTemplateFixes(args?: Args): Promise<any>;
  /** POST /comm-api/api/lists/{id}/archive: Archive a list (hidden from the default list view, refused by campaigns) */
  commsArchiveList(args: Args): Promise<any>;
  /** POST /comm-api/api/recipients/summary: Counts for the whole audience or a filter: by status, consent, engagement, domain and list; no addresses */
  commsAudienceSummary(args?: Args): Promise<any>;
  /** POST /comm-api/api/recipients/bulk-delete: Bulk delete recipients */
  commsBulkDeleteRecipients(args?: Args): Promise<any>;
  /** POST /comm-api/api/recipients/bulk-delete-by-filter: Bulk delete recipients matching a filter */
  commsBulkDeleteRecipientsByFilter(args?: Args): Promise<any>;
  /** POST /comm-api/api/recipients/bulk-move: Bulk move recipients */
  commsBulkMoveRecipients(args?: Args): Promise<any>;
  /** POST /comm-api/api/recipients/bulk-permanent-delete: Permanently delete several deleted recipients at once */
  commsBulkPermanentlyDeleteRecipients(args?: Args): Promise<any>;
  /** POST /comm-api/api/campaigns/{id}/cancel: Cancel a draft, scheduled or sending campaign (final) */
  commsCancelCampaign(args: Args): Promise<any>;
  /** POST /comm-api/api/templates/check-links: Check every link of a template */
  commsCheckLinks(args?: Args): Promise<any>;
  /** POST /comm-api/api/contacts/cleanup-orphans: Delete contacts that are on no list, with a dry run */
  commsCleanupOrphanContacts(args?: Args): Promise<any>;
  /** GET /comm-api/api/lists/compare: Compare two lists: who is only in one, who is in both */
  commsCompareLists(args: Args): Promise<any>;
  /** POST /comm-api/api/campaigns/{id}/compile: Preview-compile a draft campaign (optional: scheduling compiles by itself) */
  commsCompileCampaign(args: Args): Promise<any>;
  /** POST /comm-api/api/campaigns: Create a campaign */
  commsCreateCampaign(args?: Args): Promise<any>;
  /** POST /comm-api/api/gdpr/export: Email a contact their GDPR data export */
  commsCreateGdprExport(args?: Args): Promise<any>;
  /** POST /comm-api/api/lists: Create a contact list */
  commsCreateList(args?: Args): Promise<any>;
  /** POST /comm-api/api/lists/from-filter: Create a smart list from filters */
  commsCreateListFromFilter(args?: Args): Promise<any>;
  /** POST /comm-api/api/templates: Create a template */
  commsCreateTemplate(args?: Args): Promise<any>;
  /** POST /comm-api/api/templates/from-starter: Create a template from a starter and the brand kit */
  commsCreateTemplateFromStarter(args?: Args): Promise<any>;
  /** POST /comm-api/api/workspaces/{id}/webhooks: Create a workspace webhook */
  commsCreateWebhook(args: Args): Promise<any>;
  /** POST /comm-api/api/workspaces: Create a Communications workspace */
  commsCreateWorkspace(args?: Args): Promise<any>;
  /** DELETE /comm-api/api/campaigns/{id}: Delete a campaign */
  commsDeleteCampaign(args: Args): Promise<any>;
  /** DELETE /comm-api/api/contacts/{id}: Delete a contact */
  commsDeleteContact(args: Args): Promise<any>;
  /** DELETE /comm-api/api/lists/{id}: Delete a contact list */
  commsDeleteList(args: Args): Promise<any>;
  /** DELETE /comm-api/api/lists: Bulk delete contact lists */
  commsDeleteLists(args?: Args): Promise<any>;
  /** DELETE /comm-api/api/suppressions/{id}: Remove a suppression (a spam-complaint one needs acknowledge_complaint=true) */
  commsDeleteSuppression(args: Args): Promise<any>;
  /** DELETE /comm-api/api/templates/{id}: Delete a template */
  commsDeleteTemplate(args: Args): Promise<any>;
  /** DELETE /comm-api/api/templates: Bulk delete templates */
  commsDeleteTemplates(args?: Args): Promise<any>;
  /** DELETE /comm-api/api/workspaces/{id}/webhooks/{webhookId}: Delete a workspace webhook */
  commsDeleteWebhook(args: Args): Promise<any>;
  /** DELETE /comm-api/api/workspaces/{id}: Delete a Communications workspace and everything in it (irreversible) */
  commsDeleteWorkspace(args: Args): Promise<any>;
  /** POST /comm-api/api/lists/derive: Make a new list from other lists (union, intersection or difference) or from an audience filter (operation filter) */
  commsDeriveList(args?: Args): Promise<any>;
  /** POST /comm-api/api/campaigns/{id}/duplicate: Duplicate a campaign into a new draft */
  commsDuplicateCampaign(args: Args): Promise<any>;
  /** POST /comm-api/api/templates/{id}/duplicate: Duplicate a template */
  commsDuplicateTemplate(args: Args): Promise<any>;
  /** GET /comm-api/api/lists/{id}/contacts/export: Export list contacts */
  commsExportListContacts(args: Args): Promise<any>;
  /** POST /comm-api/api/recipients/export: Export recipients */
  commsExportRecipients(args?: Args): Promise<any>;
  /** GET /comm-api/api/tracking/export: Export tracking events */
  commsExportTrackingEvents(args?: Args): Promise<any>;
  /** POST /comm-api/api/recipients/filter: Filter recipients */
  commsFilterRecipients(args?: Args): Promise<any>;
  /** GET /comm-api/api/analytics/overview: Get Communications analytics overview */
  commsGetAnalyticsOverview(args?: Args): Promise<any>;
  /** GET /comm-api/api/settings/brand-kit: Get the workspace brand kit */
  commsGetBrandKit(args?: Args): Promise<any>;
  /** GET /comm-api/api/campaigns/{id}: Get campaign details */
  commsGetCampaign(args: Args): Promise<any>;
  /** GET /comm-api/api/campaigns/{id}/analytics: Get campaign analytics */
  commsGetCampaignAnalytics(args: Args): Promise<any>;
  /** GET /comm-api/api/campaigns/{id}/click-breakdown: Get click breakdown */
  commsGetCampaignClickBreakdown(args: Args): Promise<any>;
  /** GET /comm-api/api/campaigns/{id}/recipient-consent: Get campaign recipient consent status */
  commsGetCampaignRecipientConsent(args: Args): Promise<any>;
  /** GET /comm-api/api/campaigns/{id}/report: Get the per-recipient delivery report for a campaign */
  commsGetCampaignReport(args: Args): Promise<any>;
  /** GET /comm-api/api/campaigns/{id}/stats: Get campaign stats */
  commsGetCampaignStats(args: Args): Promise<any>;
  /** GET /comm-api/api/consent-events/analytics: Get consent-event analytics */
  commsGetConsentAnalytics(args?: Args): Promise<any>;
  /** GET /comm-api/api/settings/consent: Get current workspace consent settings */
  commsGetConsentSettings(args?: Args): Promise<any>;
  /** GET /comm-api/api/contacts/{id}/erase-impact: What erasing a contact would remove (lists, campaign statistics, consent records), before you confirm */
  commsGetContactEraseImpact(args: Args): Promise<any>;
  /** GET /comm-api/api/gdpr/export: Email a contact their GDPR data export (deprecated: use POST) @deprecated */
  commsGetGdprExport(args?: Args): Promise<any>;
  /** GET /comm-api/api/lists/{id}: Get one contact list as a card */
  commsGetList(args: Args): Promise<any>;
  /** GET /comm-api/api/lists/{id}/relations: Where a list came from and what was made from it */
  commsGetListRelations(args: Args): Promise<any>;
  /** GET /comm-api/api/map: The workspace at a glance: lists, campaigns, templates and how they connect */
  commsGetMap(args?: Args): Promise<any>;
  /** GET /comm-api/api/settings/open-tracking: Get current workspace open-tracking settings */
  commsGetOpenTrackingSettings(args?: Args): Promise<any>;
  /** GET /comm-api/api/readiness: What is still missing before a campaign can be sent */
  commsGetReadiness(args?: Args): Promise<any>;
  /** GET /comm-api/api/recipients/facets: List recipient filter facets */
  commsGetRecipientFacets(args?: Args): Promise<any>;
  /** GET /comm-api/api/templates/starters/{key}: Get one template starter */
  commsGetStarter(args: Args): Promise<any>;
  /** GET /comm-api/api/suppressions/stats: Get suppression stats */
  commsGetSuppressionStats(args?: Args): Promise<any>;
  /** GET /comm-api/api/templates/{id}: Get a template */
  commsGetTemplate(args: Args): Promise<any>;
  /** GET /comm-api/api/templates/rules: The template rulebook */
  commsGetTemplateRules(args?: Args): Promise<any>;
  /** GET /comm-api/api/tracking/stats: Get tracking stats */
  commsGetTrackingStats(args?: Args): Promise<any>;
  /** GET /comm-api/api/unsubscribe-analytics: Get unsubscribe analytics */
  commsGetUnsubscribeAnalytics(args?: Args): Promise<any>;
  /** GET /comm-api/api/settings/unsubscribe: Get the current workspace unsubscribe landing page */
  commsGetUnsubscribeSettings(args?: Args): Promise<any>;
  /** GET /comm-api/api/unsubscribe-trends: Get unsubscribe trends */
  commsGetUnsubscribeTrends(args?: Args): Promise<any>;
  /** GET /comm-api/api/workspaces/{id}/settings/consent: Get workspace consent settings */
  commsGetWorkspaceConsentSettings(args: Args): Promise<any>;
  /** GET /comm-api/api/workspaces/{id}/settings/open-tracking: Get workspace open-tracking settings */
  commsGetWorkspaceOpenTrackingSettings(args: Args): Promise<any>;
  /** GET /comm-api/api/workspaces/{id}/settings/unsubscribe: Get workspace unsubscribe landing page */
  commsGetWorkspaceUnsubscribeSettings(args: Args): Promise<any>;
  /** GET /comm-api/api/health: Communications API health */
  commsHealth(args?: Args): Promise<any>;
  /** POST /comm-api/api/suppressions/import-bounces: Import bounces into suppressions */
  commsImportBounceSuppressions(args?: Args): Promise<any>;
  /** POST /comm-api/api/lists/{id}/contacts/import: Import list contacts from CSV */
  commsImportContacts(args: Args): Promise<any>;
  /** POST /comm-api/api/templates/lint: Check a template against the rulebook */
  commsLintTemplate(args?: Args): Promise<any>;
  /** GET /comm-api/api/campaigns/{id}/clicks: List campaign clicks */
  commsListCampaignClicks(args: Args): Promise<any>;
  /** GET /comm-api/api/campaigns/{id}/events: List campaign events */
  commsListCampaignEvents(args: Args): Promise<any>;
  /** GET /comm-api/api/campaigns/{id}/recipients: List campaign recipients */
  commsListCampaignRecipients(args: Args): Promise<any>;
  /** GET /comm-api/api/campaigns: List campaigns */
  commsListCampaigns(args?: Args): Promise<any>;
  /** GET /comm-api/api/consent-events: List consent events */
  commsListConsentEvents(args?: Args): Promise<any>;
  /** GET /comm-api/api/campaigns/deleted: List deleted campaigns */
  commsListDeletedCampaigns(args?: Args): Promise<any>;
  /** GET /comm-api/api/recipients/deleted: List deleted recipients */
  commsListDeletedRecipients(args?: Args): Promise<any>;
  /** GET /comm-api/api/lists/{id}/imports: The import batches of a list */
  commsListImports(args: Args): Promise<any>;
  /** GET /comm-api/api/lists/{id}/contacts: List contacts in a list */
  commsListListContacts(args: Args): Promise<any>;
  /** GET /comm-api/api/lists: List contact lists */
  commsListLists(args?: Args): Promise<any>;
  /** GET /comm-api/api/workspaces/current/motor-blocks: List marketing Motor Blocks assigned to the workspace */
  commsListMarketingBlocks(args?: Args): Promise<any>;
  /** GET /comm-api/api/recipients/campaigns: List recipient campaign groupings */
  commsListRecipientCampaigns(args?: Args): Promise<any>;
  /** GET /comm-api/api/recipients: Search recipients */
  commsListRecipients(args?: Args): Promise<any>;
  /** GET /comm-api/api/templates/starters: List the template starters */
  commsListStarters(args?: Args): Promise<any>;
  /** GET /comm-api/api/suppressions: List suppressions */
  commsListSuppressions(args?: Args): Promise<any>;
  /** GET /comm-api/api/templates: List templates */
  commsListTemplates(args?: Args): Promise<any>;
  /** GET /comm-api/api/tracking/events: Search tracking events */
  commsListTrackingEvents(args?: Args): Promise<any>;
  /** GET /comm-api/api/unsubscribe-events: List unsubscribe events */
  commsListUnsubscribeEvents(args?: Args): Promise<any>;
  /** GET /comm-api/api/workspaces/{id}/webhooks: List the webhooks of a workspace */
  commsListWebhooks(args: Args): Promise<any>;
  /** GET /comm-api/api/workspaces/{id}/motor-blocks: List Motor Blocks assigned to a workspace */
  commsListWorkspaceMotorBlocks(args: Args): Promise<any>;
  /** GET /comm-api/api/workspaces: List Communications workspaces */
  commsListWorkspaces(args?: Args): Promise<any>;
  /** DELETE /comm-api/api/campaigns/{id}/permanent: Permanently delete a campaign */
  commsPermanentlyDeleteCampaign(args: Args): Promise<any>;
  /** DELETE /comm-api/api/recipients/{id}/permanent: Permanently delete a recipient */
  commsPermanentlyDeleteRecipient(args: Args): Promise<any>;
  /** POST /comm-api/api/templates/preview: Render a template for a contact or a sample */
  commsPreviewTemplate(args?: Args): Promise<any>;
  /** DELETE /comm-api/api/campaigns/cleanup: Cleanup deleted campaigns */
  commsPurgeDeletedCampaigns(args?: Args): Promise<any>;
  /** DELETE /comm-api/api/recipients/cleanup: Cleanup deleted recipients */
  commsPurgeDeletedRecipients(args?: Args): Promise<any>;
  /** DELETE /comm-api/api/lists/{id}/contacts/{contactId}: Remove a contact from a list */
  commsRemoveFromList(args: Args): Promise<any>;
  /** POST /comm-api/api/templates/starters/{key}/render: Render a starter with a brand kit, without saving */
  commsRenderStarter(args: Args): Promise<any>;
  /** PATCH /comm-api/api/campaigns/{id}/restore: Restore a campaign */
  commsRestoreCampaign(args: Args): Promise<any>;
  /** PATCH /comm-api/api/recipients/{id}/restore: Restore a recipient */
  commsRestoreRecipient(args: Args): Promise<any>;
  /** POST /comm-api/api/recipients/restore: Restore recipients */
  commsRestoreRecipients(args?: Args): Promise<any>;
  /** PUT /comm-api/api/contacts/{id}/resubscribe: Resubscribe a contact */
  commsResubscribeContact(args: Args): Promise<any>;
  /** POST /comm-api/api/campaigns/{id}/schedule: Schedule a draft campaign: compiles it, then sends now or at scheduled_at */
  commsScheduleCampaign(args: Args): Promise<any>;
  /** POST /comm-api/api/recipients/search: Search the whole audience with a structured filter (domain, status, campaign, import batch, dates, on no list, not on these lists); returns each person with the lists they are on */
  commsSearchAudience(args?: Args): Promise<any>;
  /** POST /comm-api/api/campaigns/{id}/test-send: Send the campaign as a test to the account owner only */
  commsSendCampaignTest(args: Args): Promise<any>;
  /** POST /comm-api/api/templates/{id}/test-send: Send a template as a test to the account owner only, without a campaign */
  commsSendTemplateTest(args: Args): Promise<any>;
  /** PATCH /comm-api/api/settings/brand-kit: Update the workspace brand kit */
  commsSetBrandKit(args?: Args): Promise<any>;
  /** PUT /comm-api/api/workspaces/{id}/motor-blocks: Replace workspace Motor Block assignments */
  commsSetWorkspaceMotorBlocks(args: Args): Promise<any>;
  /** GET /comm-api/api/suppressions/lookup: Is one address suppressed: the reason, the source and since when (account-wide) */
  commsSuppressionInfo(args: Args): Promise<any>;
  /** POST /comm-api/api/workspaces/{id}/webhooks/{webhookId}/test: Queue a test event for a workspace webhook */
  commsTestWebhook(args: Args): Promise<any>;
  /** POST /comm-api/api/lists/{id}/unarchive: Restore an archived list */
  commsUnarchiveList(args: Args): Promise<any>;
  /** POST /comm-api/api/lists/{id}/imports/{batchId}/undo: Undo one import batch, with a dry run */
  commsUndoImport(args: Args): Promise<any>;
  /** POST /comm-api/api/contacts/{id}/unsubscribe: Unsubscribe a contact */
  commsUnsubscribeContact(args: Args): Promise<any>;
  /** PATCH /comm-api/api/campaigns/{id}/settings: Update campaign settings (what can change depends on the status) */
  commsUpdateCampaign(args: Args): Promise<any>;
  /** PATCH /comm-api/api/settings/consent: Update current workspace consent settings */
  commsUpdateConsentSettings(args?: Args): Promise<any>;
  /** PATCH /comm-api/api/lists/{id}: Update a contact list */
  commsUpdateList(args: Args): Promise<any>;
  /** PATCH /comm-api/api/settings/open-tracking: Update current workspace open-tracking settings */
  commsUpdateOpenTrackingSettings(args?: Args): Promise<any>;
  /** PATCH /comm-api/api/templates/{id}: Update a template */
  commsUpdateTemplate(args: Args): Promise<any>;
  /** PATCH /comm-api/api/settings/unsubscribe: Set or clear the current workspace unsubscribe landing page */
  commsUpdateUnsubscribeSettings(args?: Args): Promise<any>;
  /** PATCH /comm-api/api/workspaces/{id}/webhooks/{webhookId}: Update a workspace webhook */
  commsUpdateWebhook(args: Args): Promise<any>;
  /** PATCH /comm-api/api/workspaces/{id}: Update a Communications workspace */
  commsUpdateWorkspace(args: Args): Promise<any>;
  /** PATCH /comm-api/api/workspaces/{id}/settings/consent: Update workspace consent settings */
  commsUpdateWorkspaceConsentSettings(args: Args): Promise<any>;
  /** PATCH /comm-api/api/workspaces/{id}/settings/open-tracking: Update workspace open-tracking settings */
  commsUpdateWorkspaceOpenTrackingSettings(args: Args): Promise<any>;
  /** PATCH /comm-api/api/workspaces/{id}/settings/unsubscribe: Update workspace unsubscribe landing page */
  commsUpdateWorkspaceUnsubscribeSettings(args: Args): Promise<any>;
  /** POST /comm-api/api/contacts/upsert: Create or update a contact */
  commsUpsertContact(args?: Args): Promise<any>;
  /** POST /comm-api/api/templates/validate: Validate a template without saving */
  commsValidateTemplate(args?: Args): Promise<any>;
  /** POST /api/public/v1/account/sandbox/convert: Convert account sandbox to a verified production domain (OAuth/Public API bearer) */
  convertSandbox(args: Args): Promise<any>;
  /** POST /api/developer/sandbox/convert: Convert sandbox Motor Block to a verified production domain */
  convertSandboxDashboard(args: Args): Promise<any>;
  /** POST /api/public/v1/motor-blocks/{id}/exports: Create export job */
  createExport(args: Args): Promise<any>;
  /** POST /api/public/v1/account/motor-blocks: Create a production Motor Block (OAuth/Public API bearer) */
  createMotorBlock(args: Args): Promise<any>;
  /** POST /api/auth/web-handoff: Mint a one-time browser handoff URL */
  createWebHandoff(args?: Args): Promise<any>;
  /** POST /api/public/v1/motor-blocks/{id}/webhooks: Create webhook */
  createWebhook(args: Args): Promise<any>;
  /** POST /api/public/v1/account/motor-blocks/{id}/deactivate: Deactivate (pause) a Motor Block — reversible */
  deactivateMotorBlock(args: Args): Promise<any>;
  /** DELETE /api/public/v1/account/motor-blocks/{id}: Permanently delete a Motor Block — asynchronous and irrecoverable */
  deleteMotorBlock(args: Args): Promise<any>;
  /** DELETE /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}: Delete webhook */
  deleteWebhook(args: Args): Promise<any>;
  /** GET /api/public/v1/exports/{jobId}/download: Download export file (signed token, single-use) */
  downloadExport(args: Args): Promise<any>;
  /** GET /api/public/v1/account/rate-limits: Account-wide rate limits */
  getAccountRateLimits(args?: Args): Promise<any>;
  /** GET /api/public/v1/account/state: Composed account state */
  getAccountState(args?: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/anomalies: Anomaly detection (bounce spikes) */
  getAnomalies(args: Args): Promise<any>;
  /** GET /api/comm/tenant: Discover or provision Communications workspaces */
  getCommsTenant(args?: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/config: Motor Block config snapshot */
  getConfig(args: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/daily-summary: Daily summary */
  getDailySummary(args: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/deliverability: Deliverability by recipient domain */
  getDeliverability(args: Args): Promise<any>;
  /** GET /api/public/v1/domains/{id}: One sending domain */
  getDomain(args: Args): Promise<any>;
  /** GET /api/public/v1/domains/{id}/dns-records: DNS records to publish for one domain */
  getDomainDnsRecords(args: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/domain-health: Domain health (SPF/DKIM/DMARC): a set-up status, not a score */
  getDomainHealth(args: Args): Promise<any>;
  /** GET /api/public/v1/domains/{id}/health: Email-authentication health of one domain */
  getDomainHealthById(args: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/error-codes: SMTP error code diagnostics */
  getErrorCodes(args: Args): Promise<any>;
  /** GET /api/public/v1/exports/{jobId}: Get export job status */
  getExport(args: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/logs: Search logs with cursor pagination */
  getLogs(args: Args): Promise<any>;
  /** GET /api/public/v1/messages/{id}: Get message by send id (UUID) */
  getMessage(args: Args): Promise<any>;
  /** GET /api/public/v1/messages/{id}/events: Get message event timeline */
  getMessageEvents(args: Args): Promise<any>;
  /** GET /api/public/v1/messages/{id}/recipients: Per-recipient outcomes for a multi-recipient send */
  getMessageRecipients(args: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/metrics: Metrics series and totals */
  getMetrics(args: Args): Promise<any>;
  /** GET /api/public/v1/account/motor-block-deletions/{jobId}: Poll a permanent-deletion job */
  getMotorBlockDeletionStatus(args: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/overview: Motor Block overview */
  getOverview(args: Args): Promise<any>;
  /** GET /api/system/public-status: Platform status (overall and per component) */
  getPlatformStatus(args?: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/providers: Provider breakdown (gmail, outlook, yahoo, other) */
  getProviders(args: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/rate-limits: Motor Block rate limits */
  getRateLimits(args: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/reputation: Delivery reputation score */
  getReputation(args: Args): Promise<any>;
  /** GET /api/developer/sandbox: Get developer sandbox status */
  getSandboxDashboard(args?: Args): Promise<any>;
  /** GET /api/public/v1/account/sandbox: Get account sandbox status (OAuth/Public API bearer) */
  getSandboxStatus(args?: Args): Promise<any>;
  /** GET /v1/status: Get HTTP Send API service status */
  getSendStatus(args?: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/deliveries: Webhook delivery history */
  getWebhookDeliveries(args: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/stats: Webhook delivery stats */
  getWebhookStats(args: Args): Promise<any>;
  /** GET /api/public/v1/domains: List domains on the account */
  listDomains(args?: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/exports: List recent export jobs */
  listExports(args: Args): Promise<any>;
  /** GET /api/public/v1/account/free-recipients: List Free-account recipients (OAuth/Public API bearer) */
  listFreeRecipients(args?: Args): Promise<any>;
  /** GET /api/public/v1/account/motor-blocks: List the account's production Motor Blocks (OAuth/Public API bearer) */
  listManagedMotorBlocks(args?: Args): Promise<any>;
  /** GET /api/public/v1/messages: Lookup message by RFC Message-ID header */
  listMessages(args: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks: List motor blocks bound to the token */
  listMotorBlocks(args?: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/webhooks: List webhooks */
  listWebhooks(args: Args): Promise<any>;
  /** POST /api/auth/login: Password login (returns JWT + refreshToken) */
  login(args: Args): Promise<any>;
  /** POST /api/public/token: Mint a Public Analytics API token with a dashboard JWT */
  mintPublicToken(args: Args): Promise<any>;
  /** POST /api/public/token/account-key: Mint a Public Analytics API token with an Account API Key */
  mintPublicTokenFromAccountKey(args: Args): Promise<any>;
  /** GET /api/oauth2/authorize: OAuth 2.0 authorization endpoint (consent HTML) */
  oauthAuthorize(args: Args): Promise<any>;
  /** POST /api/oauth2/token: OAuth 2.0 token endpoint */
  oauthToken(args: Args): Promise<any>;
  /** GET /api/oauth2/validate: Validate an OAuth access token */
  oauthValidateToken(args?: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/exports/preview: Preview recent logs (no job creation) */
  previewExport(args: Args): Promise<any>;
  /** POST /api/public/v1/account/sandbox/provision: Provision account sandbox (OAuth/Public API bearer) */
  provisionSandbox(args?: Args): Promise<any>;
  /** POST /api/developer/sandbox/provision: Provision unpaid developer sandbox */
  provisionSandboxDashboard(args?: Args): Promise<any>;
  /** POST /api/public/v1/account/motor-blocks/{id}/reactivate: Reactivate a deactivated Motor Block */
  reactivateMotorBlock(args: Args): Promise<any>;
  /** POST /api/auth/refresh: Rotate refresh token; issue new access JWT (non-interactive) */
  refreshSession(args?: Args): Promise<any>;
  /** POST /api/auth/register: Start agent signup (email verification code) */
  register(args: Args): Promise<any>;
  /** DELETE /api/public/v1/account/free-recipients/{id}: Remove a Free-account recipient (OAuth/Public API bearer) */
  removeFreeRecipient(args: Args): Promise<any>;
  /** PATCH /api/public/v1/account/motor-blocks/{id}/name: Rename a Motor Block (display name only) */
  renameMotorBlock(args: Args): Promise<any>;
  /** POST /v1/send: Send or validate an email */
  sendEmail(args: Args): Promise<any>;
  /** POST /v1/test-email: Test SMTP setup parameters */
  sendTestEmail(args: Args): Promise<any>;
  /** POST /api/auth/set-password: Set password after email verification (returns JWT + refreshToken) */
  setPassword(args: Args): Promise<any>;
  /** PATCH /api/developer/sandbox/outbound: Update sandbox outbound lock / allowlist */
  setSandboxOutboundDashboard(args?: Args): Promise<any>;
  /** GET /api/public/v1/motor-blocks/{id}/events/stream: Event stream (SSE) */
  streamEvents(args: Args): Promise<any>;
  /** POST /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/test: Enqueue a test webhook delivery */
  testWebhook(args: Args): Promise<any>;
  /** PUT /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}: Update webhook */
  updateWebhook(args: Args): Promise<any>;
  /** POST /api/public/v1/domains/{id}/verify: Verify ownership and refresh DKIM/SPF send-readiness (account-wide, OAuth/MCP-capable) */
  verifyDomain(args: Args): Promise<any>;
  /** POST /api/domains/{id}/verify: Verify ownership and refresh DKIM/SPF send-readiness */
  verifyDomainDashboard(args: Args): Promise<any>;
  /** POST /api/auth/verify-code: Verify email with 6-digit code */
  verifySignupCode(args: Args): Promise<any>;
  /** GET /api/public/v1/account/whoami: Account identity, plan and grant */
  whoami(args?: Args): Promise<any>;
}
export declare const OPENAPI_VERSION: "1.11.0";
