# GENERATED from docs-site/static/openapi.json by packages/sdk-generator/generate.js. Do not edit.
from ._core import BaseClient


class Motorical(BaseClient):
    """Motorical API client. Each method takes path, query and header parameters as keyword arguments,
    the request body as ``body``, and for Communications calls ``workspace_id``."""

    def add_domain(self, **kwargs):
        """POST /api/public/v1/domains: Add a customer domain (account-wide, OAuth/MCP-capable)"""
        return self._call("addDomain", kwargs)

    def add_domain_dashboard(self, **kwargs):
        """POST /api/domains: Add a customer domain"""
        return self._call("addDomainDashboard", kwargs)

    def add_free_recipient(self, **kwargs):
        """POST /api/public/v1/account/free-recipients: Ask a recipient to allow test email (OAuth/Public API bearer)"""
        return self._call("addFreeRecipient", kwargs)

    def assign_motor_block_domain(self, **kwargs):
        """POST /api/public/v1/account/motor-blocks/{id}/assign-domain: Assign a verified domain to a Motor Block"""
        return self._call("assignMotorBlockDomain", kwargs)

    def change_motor_block_type(self, **kwargs):
        """PATCH /api/public/v1/account/motor-blocks/{id}/type: Switch a Motor Block between transactional and general_purpose"""
        return self._call("changeMotorBlockType", kwargs)

    def check_domain_dns(self, **kwargs):
        """POST /api/public/v1/domains/{id}/check-dns: Check DKIM/SPF/DMARC and persist send-readiness flags (account-wide, OAuth/MCP-capable)"""
        return self._call("checkDomainDns", kwargs)

    def check_domain_dns_dashboard(self, **kwargs):
        """POST /api/domains/{id}/check-dns: Check DKIM/SPF/DMARC and persist send-readiness flags"""
        return self._call("checkDomainDnsDashboard", kwargs)

    def check_motor_block_authorization(self, **kwargs):
        """GET /api/public/v1/account/authorization/motor-blocks/{id}: Live grant-coverage check for one Motor Block (infrastructure)"""
        return self._call("checkMotorBlockAuthorization", kwargs)

    def comms_add_list_contact(self, **kwargs):
        """POST /comm-api/api/lists/{id}/contacts: Add contacts to a list"""
        return self._call("commsAddListContact", kwargs)

    def comms_add_list_contacts(self, **kwargs):
        """POST /comm-api/api/lists/{id}/contacts/bulk: Add up to 1001 contacts as JSON, with a dry run and a result for every row"""
        return self._call("commsAddListContacts", kwargs)

    def comms_add_sending_identity(self, **kwargs):
        """POST /comm-api/api/workspaces/{id}/motor-blocks/from-domain: Resolve a sending domain to a companion marketing Motor Block"""
        return self._call("commsAddSendingIdentity", kwargs)

    def comms_add_suppression(self, **kwargs):
        """POST /comm-api/api/suppressions: Add a suppression"""
        return self._call("commsAddSuppression", kwargs)

    def comms_add_suppressions(self, **kwargs):
        """POST /comm-api/api/suppressions/bulk: Bulk import suppressions"""
        return self._call("commsAddSuppressions", kwargs)

    def comms_apply_template_fixes(self, **kwargs):
        """POST /comm-api/api/templates/fix: Apply the safe fixes to a template in memory"""
        return self._call("commsApplyTemplateFixes", kwargs)

    def comms_archive_list(self, **kwargs):
        """POST /comm-api/api/lists/{id}/archive: Archive a list (hidden from the default list view, refused by campaigns)"""
        return self._call("commsArchiveList", kwargs)

    def comms_audience_summary(self, **kwargs):
        """POST /comm-api/api/recipients/summary: Counts for the whole audience or a filter: by status, consent, engagement, domain and list; no addresses"""
        return self._call("commsAudienceSummary", kwargs)

    def comms_bulk_delete_recipients(self, **kwargs):
        """POST /comm-api/api/recipients/bulk-delete: Bulk delete recipients"""
        return self._call("commsBulkDeleteRecipients", kwargs)

    def comms_bulk_delete_recipients_by_filter(self, **kwargs):
        """POST /comm-api/api/recipients/bulk-delete-by-filter: Bulk delete recipients matching a filter"""
        return self._call("commsBulkDeleteRecipientsByFilter", kwargs)

    def comms_bulk_move_recipients(self, **kwargs):
        """POST /comm-api/api/recipients/bulk-move: Bulk move recipients"""
        return self._call("commsBulkMoveRecipients", kwargs)

    def comms_bulk_permanently_delete_recipients(self, **kwargs):
        """POST /comm-api/api/recipients/bulk-permanent-delete: Permanently delete several deleted recipients at once"""
        return self._call("commsBulkPermanentlyDeleteRecipients", kwargs)

    def comms_cancel_campaign(self, **kwargs):
        """POST /comm-api/api/campaigns/{id}/cancel: Cancel a draft, scheduled or sending campaign (final)"""
        return self._call("commsCancelCampaign", kwargs)

    def comms_check_links(self, **kwargs):
        """POST /comm-api/api/templates/check-links: Check every link of a template"""
        return self._call("commsCheckLinks", kwargs)

    def comms_cleanup_orphan_contacts(self, **kwargs):
        """POST /comm-api/api/contacts/cleanup-orphans: Delete contacts that are on no list, with a dry run"""
        return self._call("commsCleanupOrphanContacts", kwargs)

    def comms_compare_lists(self, **kwargs):
        """GET /comm-api/api/lists/compare: Compare two lists: who is only in one, who is in both"""
        return self._call("commsCompareLists", kwargs)

    def comms_compile_campaign(self, **kwargs):
        """POST /comm-api/api/campaigns/{id}/compile: Preview-compile a draft campaign (optional: scheduling compiles by itself)"""
        return self._call("commsCompileCampaign", kwargs)

    def comms_create_campaign(self, **kwargs):
        """POST /comm-api/api/campaigns: Create a campaign"""
        return self._call("commsCreateCampaign", kwargs)

    def comms_create_gdpr_export(self, **kwargs):
        """POST /comm-api/api/gdpr/export: Email a contact their GDPR data export"""
        return self._call("commsCreateGdprExport", kwargs)

    def comms_create_list(self, **kwargs):
        """POST /comm-api/api/lists: Create a contact list"""
        return self._call("commsCreateList", kwargs)

    def comms_create_list_from_filter(self, **kwargs):
        """POST /comm-api/api/lists/from-filter: Create a smart list from filters"""
        return self._call("commsCreateListFromFilter", kwargs)

    def comms_create_template(self, **kwargs):
        """POST /comm-api/api/templates: Create a template"""
        return self._call("commsCreateTemplate", kwargs)

    def comms_create_template_from_starter(self, **kwargs):
        """POST /comm-api/api/templates/from-starter: Create a template from a starter and the brand kit"""
        return self._call("commsCreateTemplateFromStarter", kwargs)

    def comms_create_webhook(self, **kwargs):
        """POST /comm-api/api/workspaces/{id}/webhooks: Create a workspace webhook"""
        return self._call("commsCreateWebhook", kwargs)

    def comms_create_workspace(self, **kwargs):
        """POST /comm-api/api/workspaces: Create a Communications workspace"""
        return self._call("commsCreateWorkspace", kwargs)

    def comms_delete_campaign(self, **kwargs):
        """DELETE /comm-api/api/campaigns/{id}: Delete a campaign"""
        return self._call("commsDeleteCampaign", kwargs)

    def comms_delete_contact(self, **kwargs):
        """DELETE /comm-api/api/contacts/{id}: Delete a contact"""
        return self._call("commsDeleteContact", kwargs)

    def comms_delete_list(self, **kwargs):
        """DELETE /comm-api/api/lists/{id}: Delete a contact list"""
        return self._call("commsDeleteList", kwargs)

    def comms_delete_lists(self, **kwargs):
        """DELETE /comm-api/api/lists: Bulk delete contact lists"""
        return self._call("commsDeleteLists", kwargs)

    def comms_delete_suppression(self, **kwargs):
        """DELETE /comm-api/api/suppressions/{id}: Remove a suppression (a spam-complaint one needs acknowledge_complaint=true)"""
        return self._call("commsDeleteSuppression", kwargs)

    def comms_delete_template(self, **kwargs):
        """DELETE /comm-api/api/templates/{id}: Delete a template"""
        return self._call("commsDeleteTemplate", kwargs)

    def comms_delete_templates(self, **kwargs):
        """DELETE /comm-api/api/templates: Bulk delete templates"""
        return self._call("commsDeleteTemplates", kwargs)

    def comms_delete_webhook(self, **kwargs):
        """DELETE /comm-api/api/workspaces/{id}/webhooks/{webhookId}: Delete a workspace webhook"""
        return self._call("commsDeleteWebhook", kwargs)

    def comms_delete_workspace(self, **kwargs):
        """DELETE /comm-api/api/workspaces/{id}: Delete a Communications workspace and everything in it (irreversible)"""
        return self._call("commsDeleteWorkspace", kwargs)

    def comms_derive_list(self, **kwargs):
        """POST /comm-api/api/lists/derive: Make a new list from other lists (union, intersection or difference) or from an audience filter (operation filter)"""
        return self._call("commsDeriveList", kwargs)

    def comms_duplicate_campaign(self, **kwargs):
        """POST /comm-api/api/campaigns/{id}/duplicate: Duplicate a campaign into a new draft"""
        return self._call("commsDuplicateCampaign", kwargs)

    def comms_duplicate_template(self, **kwargs):
        """POST /comm-api/api/templates/{id}/duplicate: Duplicate a template"""
        return self._call("commsDuplicateTemplate", kwargs)

    def comms_export_list_contacts(self, **kwargs):
        """GET /comm-api/api/lists/{id}/contacts/export: Export list contacts"""
        return self._call("commsExportListContacts", kwargs)

    def comms_export_recipients(self, **kwargs):
        """POST /comm-api/api/recipients/export: Export recipients"""
        return self._call("commsExportRecipients", kwargs)

    def comms_export_tracking_events(self, **kwargs):
        """GET /comm-api/api/tracking/export: Export tracking events"""
        return self._call("commsExportTrackingEvents", kwargs)

    def comms_filter_recipients(self, **kwargs):
        """POST /comm-api/api/recipients/filter: Filter recipients"""
        return self._call("commsFilterRecipients", kwargs)

    def comms_get_analytics_overview(self, **kwargs):
        """GET /comm-api/api/analytics/overview: Get Communications analytics overview"""
        return self._call("commsGetAnalyticsOverview", kwargs)

    def comms_get_brand_kit(self, **kwargs):
        """GET /comm-api/api/settings/brand-kit: Get the workspace brand kit"""
        return self._call("commsGetBrandKit", kwargs)

    def comms_get_campaign(self, **kwargs):
        """GET /comm-api/api/campaigns/{id}: Get campaign details"""
        return self._call("commsGetCampaign", kwargs)

    def comms_get_campaign_analytics(self, **kwargs):
        """GET /comm-api/api/campaigns/{id}/analytics: Get campaign analytics"""
        return self._call("commsGetCampaignAnalytics", kwargs)

    def comms_get_campaign_click_breakdown(self, **kwargs):
        """GET /comm-api/api/campaigns/{id}/click-breakdown: Get click breakdown"""
        return self._call("commsGetCampaignClickBreakdown", kwargs)

    def comms_get_campaign_recipient_consent(self, **kwargs):
        """GET /comm-api/api/campaigns/{id}/recipient-consent: Get campaign recipient consent status"""
        return self._call("commsGetCampaignRecipientConsent", kwargs)

    def comms_get_campaign_report(self, **kwargs):
        """GET /comm-api/api/campaigns/{id}/report: Get the per-recipient delivery report for a campaign"""
        return self._call("commsGetCampaignReport", kwargs)

    def comms_get_campaign_stats(self, **kwargs):
        """GET /comm-api/api/campaigns/{id}/stats: Get campaign stats"""
        return self._call("commsGetCampaignStats", kwargs)

    def comms_get_consent_analytics(self, **kwargs):
        """GET /comm-api/api/consent-events/analytics: Get consent-event analytics"""
        return self._call("commsGetConsentAnalytics", kwargs)

    def comms_get_consent_settings(self, **kwargs):
        """GET /comm-api/api/settings/consent: Get current workspace consent settings"""
        return self._call("commsGetConsentSettings", kwargs)

    def comms_get_contact_erase_impact(self, **kwargs):
        """GET /comm-api/api/contacts/{id}/erase-impact: What erasing a contact would remove (lists, campaign statistics, consent records), before you confirm"""
        return self._call("commsGetContactEraseImpact", kwargs)

    def comms_get_gdpr_export(self, **kwargs):
        """GET /comm-api/api/gdpr/export: Email a contact their GDPR data export (deprecated: use POST) (deprecated)"""
        return self._call("commsGetGdprExport", kwargs)

    def comms_get_list(self, **kwargs):
        """GET /comm-api/api/lists/{id}: Get one contact list as a card"""
        return self._call("commsGetList", kwargs)

    def comms_get_list_relations(self, **kwargs):
        """GET /comm-api/api/lists/{id}/relations: Where a list came from and what was made from it"""
        return self._call("commsGetListRelations", kwargs)

    def comms_get_map(self, **kwargs):
        """GET /comm-api/api/map: The workspace at a glance: lists, campaigns, templates and how they connect"""
        return self._call("commsGetMap", kwargs)

    def comms_get_open_tracking_settings(self, **kwargs):
        """GET /comm-api/api/settings/open-tracking: Get current workspace open-tracking settings"""
        return self._call("commsGetOpenTrackingSettings", kwargs)

    def comms_get_readiness(self, **kwargs):
        """GET /comm-api/api/readiness: What is still missing before a campaign can be sent"""
        return self._call("commsGetReadiness", kwargs)

    def comms_get_recipient_facets(self, **kwargs):
        """GET /comm-api/api/recipients/facets: List recipient filter facets"""
        return self._call("commsGetRecipientFacets", kwargs)

    def comms_get_starter(self, **kwargs):
        """GET /comm-api/api/templates/starters/{key}: Get one template starter"""
        return self._call("commsGetStarter", kwargs)

    def comms_get_suppression_stats(self, **kwargs):
        """GET /comm-api/api/suppressions/stats: Get suppression stats"""
        return self._call("commsGetSuppressionStats", kwargs)

    def comms_get_template(self, **kwargs):
        """GET /comm-api/api/templates/{id}: Get a template"""
        return self._call("commsGetTemplate", kwargs)

    def comms_get_template_rules(self, **kwargs):
        """GET /comm-api/api/templates/rules: The template rulebook"""
        return self._call("commsGetTemplateRules", kwargs)

    def comms_get_tracking_stats(self, **kwargs):
        """GET /comm-api/api/tracking/stats: Get tracking stats"""
        return self._call("commsGetTrackingStats", kwargs)

    def comms_get_unsubscribe_analytics(self, **kwargs):
        """GET /comm-api/api/unsubscribe-analytics: Get unsubscribe analytics"""
        return self._call("commsGetUnsubscribeAnalytics", kwargs)

    def comms_get_unsubscribe_settings(self, **kwargs):
        """GET /comm-api/api/settings/unsubscribe: Get the current workspace unsubscribe landing page"""
        return self._call("commsGetUnsubscribeSettings", kwargs)

    def comms_get_unsubscribe_trends(self, **kwargs):
        """GET /comm-api/api/unsubscribe-trends: Get unsubscribe trends"""
        return self._call("commsGetUnsubscribeTrends", kwargs)

    def comms_get_workspace_consent_settings(self, **kwargs):
        """GET /comm-api/api/workspaces/{id}/settings/consent: Get workspace consent settings"""
        return self._call("commsGetWorkspaceConsentSettings", kwargs)

    def comms_get_workspace_open_tracking_settings(self, **kwargs):
        """GET /comm-api/api/workspaces/{id}/settings/open-tracking: Get workspace open-tracking settings"""
        return self._call("commsGetWorkspaceOpenTrackingSettings", kwargs)

    def comms_get_workspace_unsubscribe_settings(self, **kwargs):
        """GET /comm-api/api/workspaces/{id}/settings/unsubscribe: Get workspace unsubscribe landing page"""
        return self._call("commsGetWorkspaceUnsubscribeSettings", kwargs)

    def comms_health(self, **kwargs):
        """GET /comm-api/api/health: Communications API health"""
        return self._call("commsHealth", kwargs)

    def comms_import_bounce_suppressions(self, **kwargs):
        """POST /comm-api/api/suppressions/import-bounces: Import bounces into suppressions"""
        return self._call("commsImportBounceSuppressions", kwargs)

    def comms_import_contacts(self, **kwargs):
        """POST /comm-api/api/lists/{id}/contacts/import: Import list contacts from CSV"""
        return self._call("commsImportContacts", kwargs)

    def comms_lint_template(self, **kwargs):
        """POST /comm-api/api/templates/lint: Check a template against the rulebook"""
        return self._call("commsLintTemplate", kwargs)

    def comms_list_campaign_clicks(self, **kwargs):
        """GET /comm-api/api/campaigns/{id}/clicks: List campaign clicks"""
        return self._call("commsListCampaignClicks", kwargs)

    def comms_list_campaign_events(self, **kwargs):
        """GET /comm-api/api/campaigns/{id}/events: List campaign events"""
        return self._call("commsListCampaignEvents", kwargs)

    def comms_list_campaign_recipients(self, **kwargs):
        """GET /comm-api/api/campaigns/{id}/recipients: List campaign recipients"""
        return self._call("commsListCampaignRecipients", kwargs)

    def comms_list_campaigns(self, **kwargs):
        """GET /comm-api/api/campaigns: List campaigns"""
        return self._call("commsListCampaigns", kwargs)

    def comms_list_consent_events(self, **kwargs):
        """GET /comm-api/api/consent-events: List consent events"""
        return self._call("commsListConsentEvents", kwargs)

    def comms_list_deleted_campaigns(self, **kwargs):
        """GET /comm-api/api/campaigns/deleted: List deleted campaigns"""
        return self._call("commsListDeletedCampaigns", kwargs)

    def comms_list_deleted_recipients(self, **kwargs):
        """GET /comm-api/api/recipients/deleted: List deleted recipients"""
        return self._call("commsListDeletedRecipients", kwargs)

    def comms_list_imports(self, **kwargs):
        """GET /comm-api/api/lists/{id}/imports: The import batches of a list"""
        return self._call("commsListImports", kwargs)

    def comms_list_list_contacts(self, **kwargs):
        """GET /comm-api/api/lists/{id}/contacts: List contacts in a list"""
        return self._call("commsListListContacts", kwargs)

    def comms_list_lists(self, **kwargs):
        """GET /comm-api/api/lists: List contact lists"""
        return self._call("commsListLists", kwargs)

    def comms_list_marketing_blocks(self, **kwargs):
        """GET /comm-api/api/workspaces/current/motor-blocks: List marketing Motor Blocks assigned to the workspace"""
        return self._call("commsListMarketingBlocks", kwargs)

    def comms_list_recipient_campaigns(self, **kwargs):
        """GET /comm-api/api/recipients/campaigns: List recipient campaign groupings"""
        return self._call("commsListRecipientCampaigns", kwargs)

    def comms_list_recipients(self, **kwargs):
        """GET /comm-api/api/recipients: Search recipients"""
        return self._call("commsListRecipients", kwargs)

    def comms_list_starters(self, **kwargs):
        """GET /comm-api/api/templates/starters: List the template starters"""
        return self._call("commsListStarters", kwargs)

    def comms_list_suppressions(self, **kwargs):
        """GET /comm-api/api/suppressions: List suppressions"""
        return self._call("commsListSuppressions", kwargs)

    def comms_list_templates(self, **kwargs):
        """GET /comm-api/api/templates: List templates"""
        return self._call("commsListTemplates", kwargs)

    def comms_list_tracking_events(self, **kwargs):
        """GET /comm-api/api/tracking/events: Search tracking events"""
        return self._call("commsListTrackingEvents", kwargs)

    def comms_list_unsubscribe_events(self, **kwargs):
        """GET /comm-api/api/unsubscribe-events: List unsubscribe events"""
        return self._call("commsListUnsubscribeEvents", kwargs)

    def comms_list_webhooks(self, **kwargs):
        """GET /comm-api/api/workspaces/{id}/webhooks: List the webhooks of a workspace"""
        return self._call("commsListWebhooks", kwargs)

    def comms_list_workspace_motor_blocks(self, **kwargs):
        """GET /comm-api/api/workspaces/{id}/motor-blocks: List Motor Blocks assigned to a workspace"""
        return self._call("commsListWorkspaceMotorBlocks", kwargs)

    def comms_list_workspaces(self, **kwargs):
        """GET /comm-api/api/workspaces: List Communications workspaces"""
        return self._call("commsListWorkspaces", kwargs)

    def comms_permanently_delete_campaign(self, **kwargs):
        """DELETE /comm-api/api/campaigns/{id}/permanent: Permanently delete a campaign"""
        return self._call("commsPermanentlyDeleteCampaign", kwargs)

    def comms_permanently_delete_recipient(self, **kwargs):
        """DELETE /comm-api/api/recipients/{id}/permanent: Permanently delete a recipient"""
        return self._call("commsPermanentlyDeleteRecipient", kwargs)

    def comms_preview_template(self, **kwargs):
        """POST /comm-api/api/templates/preview: Render a template for a contact or a sample"""
        return self._call("commsPreviewTemplate", kwargs)

    def comms_purge_deleted_campaigns(self, **kwargs):
        """DELETE /comm-api/api/campaigns/cleanup: Cleanup deleted campaigns"""
        return self._call("commsPurgeDeletedCampaigns", kwargs)

    def comms_purge_deleted_recipients(self, **kwargs):
        """DELETE /comm-api/api/recipients/cleanup: Cleanup deleted recipients"""
        return self._call("commsPurgeDeletedRecipients", kwargs)

    def comms_remove_from_list(self, **kwargs):
        """DELETE /comm-api/api/lists/{id}/contacts/{contactId}: Remove a contact from a list"""
        return self._call("commsRemoveFromList", kwargs)

    def comms_render_starter(self, **kwargs):
        """POST /comm-api/api/templates/starters/{key}/render: Render a starter with a brand kit, without saving"""
        return self._call("commsRenderStarter", kwargs)

    def comms_restore_campaign(self, **kwargs):
        """PATCH /comm-api/api/campaigns/{id}/restore: Restore a campaign"""
        return self._call("commsRestoreCampaign", kwargs)

    def comms_restore_recipient(self, **kwargs):
        """PATCH /comm-api/api/recipients/{id}/restore: Restore a recipient"""
        return self._call("commsRestoreRecipient", kwargs)

    def comms_restore_recipients(self, **kwargs):
        """POST /comm-api/api/recipients/restore: Restore recipients"""
        return self._call("commsRestoreRecipients", kwargs)

    def comms_resubscribe_contact(self, **kwargs):
        """PUT /comm-api/api/contacts/{id}/resubscribe: Resubscribe a contact"""
        return self._call("commsResubscribeContact", kwargs)

    def comms_schedule_campaign(self, **kwargs):
        """POST /comm-api/api/campaigns/{id}/schedule: Schedule a draft campaign: compiles it, then sends now or at scheduled_at"""
        return self._call("commsScheduleCampaign", kwargs)

    def comms_search_audience(self, **kwargs):
        """POST /comm-api/api/recipients/search: Search the whole audience with a structured filter (domain, status, campaign, import batch, dates, on no list, not on these lists); returns each person with the lists they are on"""
        return self._call("commsSearchAudience", kwargs)

    def comms_send_campaign_test(self, **kwargs):
        """POST /comm-api/api/campaigns/{id}/test-send: Send the campaign as a test to the account owner only"""
        return self._call("commsSendCampaignTest", kwargs)

    def comms_send_template_test(self, **kwargs):
        """POST /comm-api/api/templates/{id}/test-send: Send a template as a test to the account owner only, without a campaign"""
        return self._call("commsSendTemplateTest", kwargs)

    def comms_set_brand_kit(self, **kwargs):
        """PATCH /comm-api/api/settings/brand-kit: Update the workspace brand kit"""
        return self._call("commsSetBrandKit", kwargs)

    def comms_set_workspace_motor_blocks(self, **kwargs):
        """PUT /comm-api/api/workspaces/{id}/motor-blocks: Replace workspace Motor Block assignments"""
        return self._call("commsSetWorkspaceMotorBlocks", kwargs)

    def comms_suppression_info(self, **kwargs):
        """GET /comm-api/api/suppressions/lookup: Is one address suppressed: the reason, the source and since when (account-wide)"""
        return self._call("commsSuppressionInfo", kwargs)

    def comms_test_webhook(self, **kwargs):
        """POST /comm-api/api/workspaces/{id}/webhooks/{webhookId}/test: Queue a test event for a workspace webhook"""
        return self._call("commsTestWebhook", kwargs)

    def comms_unarchive_list(self, **kwargs):
        """POST /comm-api/api/lists/{id}/unarchive: Restore an archived list"""
        return self._call("commsUnarchiveList", kwargs)

    def comms_undo_import(self, **kwargs):
        """POST /comm-api/api/lists/{id}/imports/{batchId}/undo: Undo one import batch, with a dry run"""
        return self._call("commsUndoImport", kwargs)

    def comms_unsubscribe_contact(self, **kwargs):
        """POST /comm-api/api/contacts/{id}/unsubscribe: Unsubscribe a contact"""
        return self._call("commsUnsubscribeContact", kwargs)

    def comms_update_campaign(self, **kwargs):
        """PATCH /comm-api/api/campaigns/{id}/settings: Update campaign settings (what can change depends on the status)"""
        return self._call("commsUpdateCampaign", kwargs)

    def comms_update_consent_settings(self, **kwargs):
        """PATCH /comm-api/api/settings/consent: Update current workspace consent settings"""
        return self._call("commsUpdateConsentSettings", kwargs)

    def comms_update_list(self, **kwargs):
        """PATCH /comm-api/api/lists/{id}: Update a contact list"""
        return self._call("commsUpdateList", kwargs)

    def comms_update_open_tracking_settings(self, **kwargs):
        """PATCH /comm-api/api/settings/open-tracking: Update current workspace open-tracking settings"""
        return self._call("commsUpdateOpenTrackingSettings", kwargs)

    def comms_update_template(self, **kwargs):
        """PATCH /comm-api/api/templates/{id}: Update a template"""
        return self._call("commsUpdateTemplate", kwargs)

    def comms_update_unsubscribe_settings(self, **kwargs):
        """PATCH /comm-api/api/settings/unsubscribe: Set or clear the current workspace unsubscribe landing page"""
        return self._call("commsUpdateUnsubscribeSettings", kwargs)

    def comms_update_webhook(self, **kwargs):
        """PATCH /comm-api/api/workspaces/{id}/webhooks/{webhookId}: Update a workspace webhook"""
        return self._call("commsUpdateWebhook", kwargs)

    def comms_update_workspace(self, **kwargs):
        """PATCH /comm-api/api/workspaces/{id}: Update a Communications workspace"""
        return self._call("commsUpdateWorkspace", kwargs)

    def comms_update_workspace_consent_settings(self, **kwargs):
        """PATCH /comm-api/api/workspaces/{id}/settings/consent: Update workspace consent settings"""
        return self._call("commsUpdateWorkspaceConsentSettings", kwargs)

    def comms_update_workspace_open_tracking_settings(self, **kwargs):
        """PATCH /comm-api/api/workspaces/{id}/settings/open-tracking: Update workspace open-tracking settings"""
        return self._call("commsUpdateWorkspaceOpenTrackingSettings", kwargs)

    def comms_update_workspace_unsubscribe_settings(self, **kwargs):
        """PATCH /comm-api/api/workspaces/{id}/settings/unsubscribe: Update workspace unsubscribe landing page"""
        return self._call("commsUpdateWorkspaceUnsubscribeSettings", kwargs)

    def comms_upsert_contact(self, **kwargs):
        """POST /comm-api/api/contacts/upsert: Create or update a contact"""
        return self._call("commsUpsertContact", kwargs)

    def comms_validate_template(self, **kwargs):
        """POST /comm-api/api/templates/validate: Validate a template without saving"""
        return self._call("commsValidateTemplate", kwargs)

    def convert_sandbox(self, **kwargs):
        """POST /api/public/v1/account/sandbox/convert: Convert account sandbox to a verified production domain (OAuth/Public API bearer)"""
        return self._call("convertSandbox", kwargs)

    def convert_sandbox_dashboard(self, **kwargs):
        """POST /api/developer/sandbox/convert: Convert sandbox Motor Block to a verified production domain"""
        return self._call("convertSandboxDashboard", kwargs)

    def create_export(self, **kwargs):
        """POST /api/public/v1/motor-blocks/{id}/exports: Create export job"""
        return self._call("createExport", kwargs)

    def create_motor_block(self, **kwargs):
        """POST /api/public/v1/account/motor-blocks: Create a production Motor Block (OAuth/Public API bearer)"""
        return self._call("createMotorBlock", kwargs)

    def create_web_handoff(self, **kwargs):
        """POST /api/auth/web-handoff: Mint a one-time browser handoff URL"""
        return self._call("createWebHandoff", kwargs)

    def create_webhook(self, **kwargs):
        """POST /api/public/v1/motor-blocks/{id}/webhooks: Create webhook"""
        return self._call("createWebhook", kwargs)

    def deactivate_motor_block(self, **kwargs):
        """POST /api/public/v1/account/motor-blocks/{id}/deactivate: Deactivate (pause) a Motor Block — reversible"""
        return self._call("deactivateMotorBlock", kwargs)

    def delete_motor_block(self, **kwargs):
        """DELETE /api/public/v1/account/motor-blocks/{id}: Permanently delete a Motor Block — asynchronous and irrecoverable"""
        return self._call("deleteMotorBlock", kwargs)

    def delete_webhook(self, **kwargs):
        """DELETE /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}: Delete webhook"""
        return self._call("deleteWebhook", kwargs)

    def download_export(self, **kwargs):
        """GET /api/public/v1/exports/{jobId}/download: Download export file (signed token, single-use)"""
        return self._call("downloadExport", kwargs)

    def get_account_rate_limits(self, **kwargs):
        """GET /api/public/v1/account/rate-limits: Account-wide rate limits"""
        return self._call("getAccountRateLimits", kwargs)

    def get_account_state(self, **kwargs):
        """GET /api/public/v1/account/state: Composed account state"""
        return self._call("getAccountState", kwargs)

    def get_anomalies(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/anomalies: Anomaly detection (bounce spikes)"""
        return self._call("getAnomalies", kwargs)

    def get_comms_tenant(self, **kwargs):
        """GET /api/comm/tenant: Discover or provision Communications workspaces"""
        return self._call("getCommsTenant", kwargs)

    def get_config(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/config: Motor Block config snapshot"""
        return self._call("getConfig", kwargs)

    def get_daily_summary(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/daily-summary: Daily summary"""
        return self._call("getDailySummary", kwargs)

    def get_deliverability(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/deliverability: Deliverability by recipient domain"""
        return self._call("getDeliverability", kwargs)

    def get_domain(self, **kwargs):
        """GET /api/public/v1/domains/{id}: One sending domain"""
        return self._call("getDomain", kwargs)

    def get_domain_dns_records(self, **kwargs):
        """GET /api/public/v1/domains/{id}/dns-records: DNS records to publish for one domain"""
        return self._call("getDomainDnsRecords", kwargs)

    def get_domain_health(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/domain-health: Domain health (SPF/DKIM/DMARC): a set-up status, not a score"""
        return self._call("getDomainHealth", kwargs)

    def get_domain_health_by_id(self, **kwargs):
        """GET /api/public/v1/domains/{id}/health: Email-authentication health of one domain"""
        return self._call("getDomainHealthById", kwargs)

    def get_error_codes(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/error-codes: SMTP error code diagnostics"""
        return self._call("getErrorCodes", kwargs)

    def get_export(self, **kwargs):
        """GET /api/public/v1/exports/{jobId}: Get export job status"""
        return self._call("getExport", kwargs)

    def get_logs(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/logs: Search logs with cursor pagination"""
        return self._call("getLogs", kwargs)

    def get_message(self, **kwargs):
        """GET /api/public/v1/messages/{id}: Get message by send id (UUID)"""
        return self._call("getMessage", kwargs)

    def get_message_events(self, **kwargs):
        """GET /api/public/v1/messages/{id}/events: Get message event timeline"""
        return self._call("getMessageEvents", kwargs)

    def get_message_recipients(self, **kwargs):
        """GET /api/public/v1/messages/{id}/recipients: Per-recipient outcomes for a multi-recipient send"""
        return self._call("getMessageRecipients", kwargs)

    def get_metrics(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/metrics: Metrics series and totals"""
        return self._call("getMetrics", kwargs)

    def get_motor_block_deletion_status(self, **kwargs):
        """GET /api/public/v1/account/motor-block-deletions/{jobId}: Poll a permanent-deletion job"""
        return self._call("getMotorBlockDeletionStatus", kwargs)

    def get_overview(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/overview: Motor Block overview"""
        return self._call("getOverview", kwargs)

    def get_platform_status(self, **kwargs):
        """GET /api/system/public-status: Platform status (overall and per component)"""
        return self._call("getPlatformStatus", kwargs)

    def get_providers(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/providers: Provider breakdown (gmail, outlook, yahoo, other)"""
        return self._call("getProviders", kwargs)

    def get_rate_limits(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/rate-limits: Motor Block rate limits"""
        return self._call("getRateLimits", kwargs)

    def get_reputation(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/reputation: Delivery reputation score"""
        return self._call("getReputation", kwargs)

    def get_sandbox_dashboard(self, **kwargs):
        """GET /api/developer/sandbox: Get developer sandbox status"""
        return self._call("getSandboxDashboard", kwargs)

    def get_sandbox_status(self, **kwargs):
        """GET /api/public/v1/account/sandbox: Get account sandbox status (OAuth/Public API bearer)"""
        return self._call("getSandboxStatus", kwargs)

    def get_send_status(self, **kwargs):
        """GET /v1/status: Get HTTP Send API service status"""
        return self._call("getSendStatus", kwargs)

    def get_webhook_deliveries(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/deliveries: Webhook delivery history"""
        return self._call("getWebhookDeliveries", kwargs)

    def get_webhook_stats(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/stats: Webhook delivery stats"""
        return self._call("getWebhookStats", kwargs)

    def list_domains(self, **kwargs):
        """GET /api/public/v1/domains: List domains on the account"""
        return self._call("listDomains", kwargs)

    def list_exports(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/exports: List recent export jobs"""
        return self._call("listExports", kwargs)

    def list_free_recipients(self, **kwargs):
        """GET /api/public/v1/account/free-recipients: List Free-account recipients (OAuth/Public API bearer)"""
        return self._call("listFreeRecipients", kwargs)

    def list_managed_motor_blocks(self, **kwargs):
        """GET /api/public/v1/account/motor-blocks: List the account's production Motor Blocks (OAuth/Public API bearer)"""
        return self._call("listManagedMotorBlocks", kwargs)

    def list_messages(self, **kwargs):
        """GET /api/public/v1/messages: Lookup message by RFC Message-ID header"""
        return self._call("listMessages", kwargs)

    def list_motor_blocks(self, **kwargs):
        """GET /api/public/v1/motor-blocks: List motor blocks bound to the token"""
        return self._call("listMotorBlocks", kwargs)

    def list_webhooks(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/webhooks: List webhooks"""
        return self._call("listWebhooks", kwargs)

    def login(self, **kwargs):
        """POST /api/auth/login: Password login (returns JWT + refreshToken)"""
        return self._call("login", kwargs)

    def mint_public_token(self, **kwargs):
        """POST /api/public/token: Mint a Public Analytics API token with a dashboard JWT"""
        return self._call("mintPublicToken", kwargs)

    def mint_public_token_from_account_key(self, **kwargs):
        """POST /api/public/token/account-key: Mint a Public Analytics API token with an Account API Key"""
        return self._call("mintPublicTokenFromAccountKey", kwargs)

    def oauth_authorize(self, **kwargs):
        """GET /api/oauth2/authorize: OAuth 2.0 authorization endpoint (consent HTML)"""
        return self._call("oauthAuthorize", kwargs)

    def oauth_token(self, **kwargs):
        """POST /api/oauth2/token: OAuth 2.0 token endpoint"""
        return self._call("oauthToken", kwargs)

    def oauth_validate_token(self, **kwargs):
        """GET /api/oauth2/validate: Validate an OAuth access token"""
        return self._call("oauthValidateToken", kwargs)

    def preview_export(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/exports/preview: Preview recent logs (no job creation)"""
        return self._call("previewExport", kwargs)

    def provision_sandbox(self, **kwargs):
        """POST /api/public/v1/account/sandbox/provision: Provision account sandbox (OAuth/Public API bearer)"""
        return self._call("provisionSandbox", kwargs)

    def provision_sandbox_dashboard(self, **kwargs):
        """POST /api/developer/sandbox/provision: Provision unpaid developer sandbox"""
        return self._call("provisionSandboxDashboard", kwargs)

    def reactivate_motor_block(self, **kwargs):
        """POST /api/public/v1/account/motor-blocks/{id}/reactivate: Reactivate a deactivated Motor Block"""
        return self._call("reactivateMotorBlock", kwargs)

    def refresh_session(self, **kwargs):
        """POST /api/auth/refresh: Rotate refresh token; issue new access JWT (non-interactive)"""
        return self._call("refreshSession", kwargs)

    def register(self, **kwargs):
        """POST /api/auth/register: Start agent signup (email verification code)"""
        return self._call("register", kwargs)

    def remove_free_recipient(self, **kwargs):
        """DELETE /api/public/v1/account/free-recipients/{id}: Remove a Free-account recipient (OAuth/Public API bearer)"""
        return self._call("removeFreeRecipient", kwargs)

    def rename_motor_block(self, **kwargs):
        """PATCH /api/public/v1/account/motor-blocks/{id}/name: Rename a Motor Block (display name only)"""
        return self._call("renameMotorBlock", kwargs)

    def send_email(self, **kwargs):
        """POST /v1/send: Send or validate an email"""
        return self._call("sendEmail", kwargs)

    def send_test_email(self, **kwargs):
        """POST /v1/test-email: Test SMTP setup parameters"""
        return self._call("sendTestEmail", kwargs)

    def set_password(self, **kwargs):
        """POST /api/auth/set-password: Set password after email verification (returns JWT + refreshToken)"""
        return self._call("setPassword", kwargs)

    def set_sandbox_outbound_dashboard(self, **kwargs):
        """PATCH /api/developer/sandbox/outbound: Update sandbox outbound lock / allowlist"""
        return self._call("setSandboxOutboundDashboard", kwargs)

    def stream_events(self, **kwargs):
        """GET /api/public/v1/motor-blocks/{id}/events/stream: Event stream (SSE)"""
        return self._call("streamEvents", kwargs)

    def test_webhook(self, **kwargs):
        """POST /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/test: Enqueue a test webhook delivery"""
        return self._call("testWebhook", kwargs)

    def update_webhook(self, **kwargs):
        """PUT /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}: Update webhook"""
        return self._call("updateWebhook", kwargs)

    def verify_domain(self, **kwargs):
        """POST /api/public/v1/domains/{id}/verify: Verify ownership and refresh DKIM/SPF send-readiness (account-wide, OAuth/MCP-capable)"""
        return self._call("verifyDomain", kwargs)

    def verify_domain_dashboard(self, **kwargs):
        """POST /api/domains/{id}/verify: Verify ownership and refresh DKIM/SPF send-readiness"""
        return self._call("verifyDomainDashboard", kwargs)

    def verify_signup_code(self, **kwargs):
        """POST /api/auth/verify-code: Verify email with 6-digit code"""
        return self._call("verifySignupCode", kwargs)

    def whoami(self, **kwargs):
        """GET /api/public/v1/account/whoami: Account identity, plan and grant"""
        return self._call("whoami", kwargs)
