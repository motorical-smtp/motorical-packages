'use strict';
// GENERATED from docs-site/static/openapi.json by packages/sdk-generator/generate.js. Do not edit.
// OpenAPI 1.11.0, 209 operations.
module.exports = {
  OPENAPI_VERSION: "1.11.0",
  OPERATIONS: [
    {
      "id": "addDomain",
      "method": "POST",
      "path": "/api/public/v1/domains",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "addDomainDashboard",
      "method": "POST",
      "path": "/api/domains",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "dashboardToken"
      ],
      "server": null
    },
    {
      "id": "addFreeRecipient",
      "method": "POST",
      "path": "/api/public/v1/account/free-recipients",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "assignMotorBlockDomain",
      "method": "POST",
      "path": "/api/public/v1/account/motor-blocks/{id}/assign-domain",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "changeMotorBlockType",
      "method": "PATCH",
      "path": "/api/public/v1/account/motor-blocks/{id}/type",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "checkDomainDns",
      "method": "POST",
      "path": "/api/public/v1/domains/{id}/check-dns",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "checkDomainDnsDashboard",
      "method": "POST",
      "path": "/api/domains/{id}/check-dns",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "dashboardToken"
      ],
      "server": null
    },
    {
      "id": "checkMotorBlockAuthorization",
      "method": "GET",
      "path": "/api/public/v1/account/authorization/motor-blocks/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "commsAddListContact",
      "method": "POST",
      "path": "/comm-api/api/lists/{id}/contacts",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsAddListContacts",
      "method": "POST",
      "path": "/comm-api/api/lists/{id}/contacts/bulk",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [
        {
          "name": "X-Motorical-Actor",
          "required": false
        }
      ],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsAddSendingIdentity",
      "method": "POST",
      "path": "/comm-api/api/workspaces/{id}/motor-blocks/from-domain",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsAddSuppression",
      "method": "POST",
      "path": "/comm-api/api/suppressions",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsAddSuppressions",
      "method": "POST",
      "path": "/comm-api/api/suppressions/bulk",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsApplyTemplateFixes",
      "method": "POST",
      "path": "/comm-api/api/templates/fix",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsArchiveList",
      "method": "POST",
      "path": "/comm-api/api/lists/{id}/archive",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsAudienceSummary",
      "method": "POST",
      "path": "/comm-api/api/recipients/summary",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsBulkDeleteRecipients",
      "method": "POST",
      "path": "/comm-api/api/recipients/bulk-delete",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsBulkDeleteRecipientsByFilter",
      "method": "POST",
      "path": "/comm-api/api/recipients/bulk-delete-by-filter",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsBulkMoveRecipients",
      "method": "POST",
      "path": "/comm-api/api/recipients/bulk-move",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsBulkPermanentlyDeleteRecipients",
      "method": "POST",
      "path": "/comm-api/api/recipients/bulk-permanent-delete",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsCancelCampaign",
      "method": "POST",
      "path": "/comm-api/api/campaigns/{id}/cancel",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsCheckLinks",
      "method": "POST",
      "path": "/comm-api/api/templates/check-links",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsCleanupOrphanContacts",
      "method": "POST",
      "path": "/comm-api/api/contacts/cleanup-orphans",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsCompareLists",
      "method": "GET",
      "path": "/comm-api/api/lists/compare",
      "pathParams": [],
      "query": [
        {
          "name": "a",
          "required": true
        },
        {
          "name": "b",
          "required": true
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsCompileCampaign",
      "method": "POST",
      "path": "/comm-api/api/campaigns/{id}/compile",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsCreateCampaign",
      "method": "POST",
      "path": "/comm-api/api/campaigns",
      "pathParams": [],
      "query": [],
      "headers": [
        {
          "name": "Idempotency-Key",
          "required": false
        }
      ],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsCreateGdprExport",
      "method": "POST",
      "path": "/comm-api/api/gdpr/export",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsCreateList",
      "method": "POST",
      "path": "/comm-api/api/lists",
      "pathParams": [],
      "query": [],
      "headers": [
        {
          "name": "X-Motorical-Actor",
          "required": false
        }
      ],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsCreateListFromFilter",
      "method": "POST",
      "path": "/comm-api/api/lists/from-filter",
      "pathParams": [],
      "query": [],
      "headers": [
        {
          "name": "X-Motorical-Actor",
          "required": false
        }
      ],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsCreateTemplate",
      "method": "POST",
      "path": "/comm-api/api/templates",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsCreateTemplateFromStarter",
      "method": "POST",
      "path": "/comm-api/api/templates/from-starter",
      "pathParams": [],
      "query": [],
      "headers": [
        {
          "name": "Idempotency-Key",
          "required": false
        }
      ],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsCreateWebhook",
      "method": "POST",
      "path": "/comm-api/api/workspaces/{id}/webhooks",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsCreateWorkspace",
      "method": "POST",
      "path": "/comm-api/api/workspaces",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsDeleteCampaign",
      "method": "DELETE",
      "path": "/comm-api/api/campaigns/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsDeleteContact",
      "method": "DELETE",
      "path": "/comm-api/api/contacts/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsDeleteList",
      "method": "DELETE",
      "path": "/comm-api/api/lists/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsDeleteLists",
      "method": "DELETE",
      "path": "/comm-api/api/lists",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsDeleteSuppression",
      "method": "DELETE",
      "path": "/comm-api/api/suppressions/{id}",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "acknowledge_complaint",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsDeleteTemplate",
      "method": "DELETE",
      "path": "/comm-api/api/templates/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsDeleteTemplates",
      "method": "DELETE",
      "path": "/comm-api/api/templates",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsDeleteWebhook",
      "method": "DELETE",
      "path": "/comm-api/api/workspaces/{id}/webhooks/{webhookId}",
      "pathParams": [
        "id",
        "webhookId"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsDeleteWorkspace",
      "method": "DELETE",
      "path": "/comm-api/api/workspaces/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsDeriveList",
      "method": "POST",
      "path": "/comm-api/api/lists/derive",
      "pathParams": [],
      "query": [],
      "headers": [
        {
          "name": "X-Motorical-Actor",
          "required": false
        }
      ],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsDuplicateCampaign",
      "method": "POST",
      "path": "/comm-api/api/campaigns/{id}/duplicate",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [
        {
          "name": "Idempotency-Key",
          "required": false
        }
      ],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsDuplicateTemplate",
      "method": "POST",
      "path": "/comm-api/api/templates/{id}/duplicate",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [
        {
          "name": "Idempotency-Key",
          "required": false
        }
      ],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsExportListContacts",
      "method": "GET",
      "path": "/comm-api/api/lists/{id}/contacts/export",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsExportRecipients",
      "method": "POST",
      "path": "/comm-api/api/recipients/export",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsExportTrackingEvents",
      "method": "GET",
      "path": "/comm-api/api/tracking/export",
      "pathParams": [],
      "query": [
        {
          "name": "event_type",
          "required": false
        },
        {
          "name": "campaign_id",
          "required": false
        },
        {
          "name": "contact_email",
          "required": false
        },
        {
          "name": "date_from",
          "required": false
        },
        {
          "name": "date_to",
          "required": false
        },
        {
          "name": "view",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsFilterRecipients",
      "method": "POST",
      "path": "/comm-api/api/recipients/filter",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetAnalyticsOverview",
      "method": "GET",
      "path": "/comm-api/api/analytics/overview",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetBrandKit",
      "method": "GET",
      "path": "/comm-api/api/settings/brand-kit",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetCampaign",
      "method": "GET",
      "path": "/comm-api/api/campaigns/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetCampaignAnalytics",
      "method": "GET",
      "path": "/comm-api/api/campaigns/{id}/analytics",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetCampaignClickBreakdown",
      "method": "GET",
      "path": "/comm-api/api/campaigns/{id}/click-breakdown",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetCampaignRecipientConsent",
      "method": "GET",
      "path": "/comm-api/api/campaigns/{id}/recipient-consent",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetCampaignReport",
      "method": "GET",
      "path": "/comm-api/api/campaigns/{id}/report",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetCampaignStats",
      "method": "GET",
      "path": "/comm-api/api/campaigns/{id}/stats",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetConsentAnalytics",
      "method": "GET",
      "path": "/comm-api/api/consent-events/analytics",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetConsentSettings",
      "method": "GET",
      "path": "/comm-api/api/settings/consent",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetContactEraseImpact",
      "method": "GET",
      "path": "/comm-api/api/contacts/{id}/erase-impact",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetGdprExport",
      "method": "GET",
      "path": "/comm-api/api/gdpr/export",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetList",
      "method": "GET",
      "path": "/comm-api/api/lists/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetListRelations",
      "method": "GET",
      "path": "/comm-api/api/lists/{id}/relations",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetMap",
      "method": "GET",
      "path": "/comm-api/api/map",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetOpenTrackingSettings",
      "method": "GET",
      "path": "/comm-api/api/settings/open-tracking",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetReadiness",
      "method": "GET",
      "path": "/comm-api/api/readiness",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetRecipientFacets",
      "method": "GET",
      "path": "/comm-api/api/recipients/facets",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetStarter",
      "method": "GET",
      "path": "/comm-api/api/templates/starters/{key}",
      "pathParams": [
        "key"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetSuppressionStats",
      "method": "GET",
      "path": "/comm-api/api/suppressions/stats",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetTemplate",
      "method": "GET",
      "path": "/comm-api/api/templates/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetTemplateRules",
      "method": "GET",
      "path": "/comm-api/api/templates/rules",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetTrackingStats",
      "method": "GET",
      "path": "/comm-api/api/tracking/stats",
      "pathParams": [],
      "query": [
        {
          "name": "event_type",
          "required": false
        },
        {
          "name": "campaign_id",
          "required": false
        },
        {
          "name": "contact_email",
          "required": false
        },
        {
          "name": "date_from",
          "required": false
        },
        {
          "name": "date_to",
          "required": false
        },
        {
          "name": "view",
          "required": false
        },
        {
          "name": "days",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetUnsubscribeAnalytics",
      "method": "GET",
      "path": "/comm-api/api/unsubscribe-analytics",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetUnsubscribeSettings",
      "method": "GET",
      "path": "/comm-api/api/settings/unsubscribe",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetUnsubscribeTrends",
      "method": "GET",
      "path": "/comm-api/api/unsubscribe-trends",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetWorkspaceConsentSettings",
      "method": "GET",
      "path": "/comm-api/api/workspaces/{id}/settings/consent",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetWorkspaceOpenTrackingSettings",
      "method": "GET",
      "path": "/comm-api/api/workspaces/{id}/settings/open-tracking",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsGetWorkspaceUnsubscribeSettings",
      "method": "GET",
      "path": "/comm-api/api/workspaces/{id}/settings/unsubscribe",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsHealth",
      "method": "GET",
      "path": "/comm-api/api/health",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [],
      "server": "https://motorical.com"
    },
    {
      "id": "commsImportBounceSuppressions",
      "method": "POST",
      "path": "/comm-api/api/suppressions/import-bounces",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsImportContacts",
      "method": "POST",
      "path": "/comm-api/api/lists/{id}/contacts/import",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "dryRun",
          "required": false
        },
        {
          "name": "consentGiven",
          "required": false
        }
      ],
      "headers": [
        {
          "name": "X-Motorical-Actor",
          "required": false
        }
      ],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsLintTemplate",
      "method": "POST",
      "path": "/comm-api/api/templates/lint",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListCampaignClicks",
      "method": "GET",
      "path": "/comm-api/api/campaigns/{id}/clicks",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListCampaignEvents",
      "method": "GET",
      "path": "/comm-api/api/campaigns/{id}/events",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "status",
          "required": false
        },
        {
          "name": "redact",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListCampaignRecipients",
      "method": "GET",
      "path": "/comm-api/api/campaigns/{id}/recipients",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListCampaigns",
      "method": "GET",
      "path": "/comm-api/api/campaigns",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListConsentEvents",
      "method": "GET",
      "path": "/comm-api/api/consent-events",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListDeletedCampaigns",
      "method": "GET",
      "path": "/comm-api/api/campaigns/deleted",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListDeletedRecipients",
      "method": "GET",
      "path": "/comm-api/api/recipients/deleted",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListImports",
      "method": "GET",
      "path": "/comm-api/api/lists/{id}/imports",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListListContacts",
      "method": "GET",
      "path": "/comm-api/api/lists/{id}/contacts",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListLists",
      "method": "GET",
      "path": "/comm-api/api/lists",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListMarketingBlocks",
      "method": "GET",
      "path": "/comm-api/api/workspaces/current/motor-blocks",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListRecipientCampaigns",
      "method": "GET",
      "path": "/comm-api/api/recipients/campaigns",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListRecipients",
      "method": "GET",
      "path": "/comm-api/api/recipients",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListStarters",
      "method": "GET",
      "path": "/comm-api/api/templates/starters",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListSuppressions",
      "method": "GET",
      "path": "/comm-api/api/suppressions",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListTemplates",
      "method": "GET",
      "path": "/comm-api/api/templates",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListTrackingEvents",
      "method": "GET",
      "path": "/comm-api/api/tracking/events",
      "pathParams": [],
      "query": [
        {
          "name": "event_type",
          "required": false
        },
        {
          "name": "campaign_id",
          "required": false
        },
        {
          "name": "contact_email",
          "required": false
        },
        {
          "name": "date_from",
          "required": false
        },
        {
          "name": "date_to",
          "required": false
        },
        {
          "name": "view",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListUnsubscribeEvents",
      "method": "GET",
      "path": "/comm-api/api/unsubscribe-events",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListWebhooks",
      "method": "GET",
      "path": "/comm-api/api/workspaces/{id}/webhooks",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListWorkspaceMotorBlocks",
      "method": "GET",
      "path": "/comm-api/api/workspaces/{id}/motor-blocks",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsListWorkspaces",
      "method": "GET",
      "path": "/comm-api/api/workspaces",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsPermanentlyDeleteCampaign",
      "method": "DELETE",
      "path": "/comm-api/api/campaigns/{id}/permanent",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsPermanentlyDeleteRecipient",
      "method": "DELETE",
      "path": "/comm-api/api/recipients/{id}/permanent",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsPreviewTemplate",
      "method": "POST",
      "path": "/comm-api/api/templates/preview",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsPurgeDeletedCampaigns",
      "method": "DELETE",
      "path": "/comm-api/api/campaigns/cleanup",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsPurgeDeletedRecipients",
      "method": "DELETE",
      "path": "/comm-api/api/recipients/cleanup",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsRemoveFromList",
      "method": "DELETE",
      "path": "/comm-api/api/lists/{id}/contacts/{contactId}",
      "pathParams": [
        "id",
        "contactId"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsRenderStarter",
      "method": "POST",
      "path": "/comm-api/api/templates/starters/{key}/render",
      "pathParams": [
        "key"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsRestoreCampaign",
      "method": "PATCH",
      "path": "/comm-api/api/campaigns/{id}/restore",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsRestoreRecipient",
      "method": "PATCH",
      "path": "/comm-api/api/recipients/{id}/restore",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsRestoreRecipients",
      "method": "POST",
      "path": "/comm-api/api/recipients/restore",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsResubscribeContact",
      "method": "PUT",
      "path": "/comm-api/api/contacts/{id}/resubscribe",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsScheduleCampaign",
      "method": "POST",
      "path": "/comm-api/api/campaigns/{id}/schedule",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [
        {
          "name": "Idempotency-Key",
          "required": false
        }
      ],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsSearchAudience",
      "method": "POST",
      "path": "/comm-api/api/recipients/search",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsSendCampaignTest",
      "method": "POST",
      "path": "/comm-api/api/campaigns/{id}/test-send",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsSendTemplateTest",
      "method": "POST",
      "path": "/comm-api/api/templates/{id}/test-send",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsSetBrandKit",
      "method": "PATCH",
      "path": "/comm-api/api/settings/brand-kit",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsSetWorkspaceMotorBlocks",
      "method": "PUT",
      "path": "/comm-api/api/workspaces/{id}/motor-blocks",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsSuppressionInfo",
      "method": "GET",
      "path": "/comm-api/api/suppressions/lookup",
      "pathParams": [],
      "query": [
        {
          "name": "email",
          "required": true
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsTestWebhook",
      "method": "POST",
      "path": "/comm-api/api/workspaces/{id}/webhooks/{webhookId}/test",
      "pathParams": [
        "id",
        "webhookId"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUnarchiveList",
      "method": "POST",
      "path": "/comm-api/api/lists/{id}/unarchive",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUndoImport",
      "method": "POST",
      "path": "/comm-api/api/lists/{id}/imports/{batchId}/undo",
      "pathParams": [
        "id",
        "batchId"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUnsubscribeContact",
      "method": "POST",
      "path": "/comm-api/api/contacts/{id}/unsubscribe",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUpdateCampaign",
      "method": "PATCH",
      "path": "/comm-api/api/campaigns/{id}/settings",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUpdateConsentSettings",
      "method": "PATCH",
      "path": "/comm-api/api/settings/consent",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUpdateList",
      "method": "PATCH",
      "path": "/comm-api/api/lists/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [
        {
          "name": "X-Motorical-Actor",
          "required": false
        }
      ],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUpdateOpenTrackingSettings",
      "method": "PATCH",
      "path": "/comm-api/api/settings/open-tracking",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUpdateTemplate",
      "method": "PATCH",
      "path": "/comm-api/api/templates/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUpdateUnsubscribeSettings",
      "method": "PATCH",
      "path": "/comm-api/api/settings/unsubscribe",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUpdateWebhook",
      "method": "PATCH",
      "path": "/comm-api/api/workspaces/{id}/webhooks/{webhookId}",
      "pathParams": [
        "id",
        "webhookId"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUpdateWorkspace",
      "method": "PATCH",
      "path": "/comm-api/api/workspaces/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUpdateWorkspaceConsentSettings",
      "method": "PATCH",
      "path": "/comm-api/api/workspaces/{id}/settings/consent",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUpdateWorkspaceOpenTrackingSettings",
      "method": "PATCH",
      "path": "/comm-api/api/workspaces/{id}/settings/open-tracking",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUpdateWorkspaceUnsubscribeSettings",
      "method": "PATCH",
      "path": "/comm-api/api/workspaces/{id}/settings/unsubscribe",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsUpsertContact",
      "method": "POST",
      "path": "/comm-api/api/contacts/upsert",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "commsValidateTemplate",
      "method": "POST",
      "path": "/comm-api/api/templates/validate",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "workspace",
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "convertSandbox",
      "method": "POST",
      "path": "/api/public/v1/account/sandbox/convert",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "convertSandboxDashboard",
      "method": "POST",
      "path": "/api/developer/sandbox/convert",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "dashboardToken"
      ],
      "server": null
    },
    {
      "id": "createExport",
      "method": "POST",
      "path": "/api/public/v1/motor-blocks/{id}/exports",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "createMotorBlock",
      "method": "POST",
      "path": "/api/public/v1/account/motor-blocks",
      "pathParams": [],
      "query": [],
      "headers": [
        {
          "name": "Idempotency-Key",
          "required": true
        }
      ],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "createWebHandoff",
      "method": "POST",
      "path": "/api/auth/web-handoff",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "dashboardToken"
      ],
      "server": null
    },
    {
      "id": "createWebhook",
      "method": "POST",
      "path": "/api/public/v1/motor-blocks/{id}/webhooks",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "deactivateMotorBlock",
      "method": "POST",
      "path": "/api/public/v1/account/motor-blocks/{id}/deactivate",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "deleteMotorBlock",
      "method": "DELETE",
      "path": "/api/public/v1/account/motor-blocks/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "deleteWebhook",
      "method": "DELETE",
      "path": "/api/public/v1/motor-blocks/{id}/webhooks/{webhookId}",
      "pathParams": [
        "id",
        "webhookId"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "downloadExport",
      "method": "GET",
      "path": "/api/public/v1/exports/{jobId}/download",
      "pathParams": [
        "jobId"
      ],
      "query": [
        {
          "name": "token",
          "required": true
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [],
      "server": null
    },
    {
      "id": "getAccountRateLimits",
      "method": "GET",
      "path": "/api/public/v1/account/rate-limits",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getAccountState",
      "method": "GET",
      "path": "/api/public/v1/account/state",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getAnomalies",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/anomalies",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getCommsTenant",
      "method": "GET",
      "path": "/api/comm/tenant",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "accountKey",
        "dashboardToken"
      ],
      "server": "https://api.motorical.com"
    },
    {
      "id": "getConfig",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/config",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getDailySummary",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/daily-summary",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "days",
          "required": false
        },
        {
          "name": "zeroFill",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getDeliverability",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/deliverability",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "from",
          "required": false
        },
        {
          "name": "to",
          "required": false
        },
        {
          "name": "limit",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getDomain",
      "method": "GET",
      "path": "/api/public/v1/domains/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getDomainDnsRecords",
      "method": "GET",
      "path": "/api/public/v1/domains/{id}/dns-records",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "lookup",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getDomainHealth",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/domain-health",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "refresh",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getDomainHealthById",
      "method": "GET",
      "path": "/api/public/v1/domains/{id}/health",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "refresh",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getErrorCodes",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/error-codes",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "from",
          "required": false
        },
        {
          "name": "to",
          "required": false
        },
        {
          "name": "limit",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getExport",
      "method": "GET",
      "path": "/api/public/v1/exports/{jobId}",
      "pathParams": [
        "jobId"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getLogs",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/logs",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "from",
          "required": false
        },
        {
          "name": "to",
          "required": false
        },
        {
          "name": "currentOutcome",
          "required": false
        },
        {
          "name": "smtpCode",
          "required": false
        },
        {
          "name": "query",
          "required": false
        },
        {
          "name": "limit",
          "required": false
        },
        {
          "name": "cursor",
          "required": false
        },
        {
          "name": "includePII",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getMessage",
      "method": "GET",
      "path": "/api/public/v1/messages/{id}",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "includePII",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getMessageEvents",
      "method": "GET",
      "path": "/api/public/v1/messages/{id}/events",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "includePII",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getMessageRecipients",
      "method": "GET",
      "path": "/api/public/v1/messages/{id}/recipients",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "includePII",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getMetrics",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/metrics",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "from",
          "required": false
        },
        {
          "name": "to",
          "required": false
        },
        {
          "name": "interval",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getMotorBlockDeletionStatus",
      "method": "GET",
      "path": "/api/public/v1/account/motor-block-deletions/{jobId}",
      "pathParams": [
        "jobId"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getOverview",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/overview",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "from",
          "required": false
        },
        {
          "name": "to",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getPlatformStatus",
      "method": "GET",
      "path": "/api/system/public-status",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [],
      "server": null
    },
    {
      "id": "getProviders",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/providers",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "from",
          "required": false
        },
        {
          "name": "to",
          "required": false
        },
        {
          "name": "limit",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getRateLimits",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/rate-limits",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getReputation",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/reputation",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getSandboxDashboard",
      "method": "GET",
      "path": "/api/developer/sandbox",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "dashboardToken"
      ],
      "server": null
    },
    {
      "id": "getSandboxStatus",
      "method": "GET",
      "path": "/api/public/v1/account/sandbox",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getSendStatus",
      "method": "GET",
      "path": "/v1/status",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [],
      "server": null
    },
    {
      "id": "getWebhookDeliveries",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/deliveries",
      "pathParams": [
        "id",
        "webhookId"
      ],
      "query": [
        {
          "name": "limit",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "getWebhookStats",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/stats",
      "pathParams": [
        "id",
        "webhookId"
      ],
      "query": [
        {
          "name": "hours",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "listDomains",
      "method": "GET",
      "path": "/api/public/v1/domains",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "listExports",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/exports",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "listFreeRecipients",
      "method": "GET",
      "path": "/api/public/v1/account/free-recipients",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "listManagedMotorBlocks",
      "method": "GET",
      "path": "/api/public/v1/account/motor-blocks",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "listMessages",
      "method": "GET",
      "path": "/api/public/v1/messages",
      "pathParams": [],
      "query": [
        {
          "name": "smtpMessageId",
          "required": true
        },
        {
          "name": "includePII",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "listMotorBlocks",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "listWebhooks",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/webhooks",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "login",
      "method": "POST",
      "path": "/api/auth/login",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [],
      "server": null
    },
    {
      "id": "mintPublicToken",
      "method": "POST",
      "path": "/api/public/token",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "dashboardToken"
      ],
      "server": null
    },
    {
      "id": "mintPublicTokenFromAccountKey",
      "method": "POST",
      "path": "/api/public/token/account-key",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "accountKey",
        "apiKey"
      ],
      "server": null
    },
    {
      "id": "oauthAuthorize",
      "method": "GET",
      "path": "/api/oauth2/authorize",
      "pathParams": [],
      "query": [
        {
          "name": "client_id",
          "required": true
        },
        {
          "name": "response_type",
          "required": true
        },
        {
          "name": "redirect_uri",
          "required": true
        },
        {
          "name": "scope",
          "required": false
        },
        {
          "name": "state",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [],
      "server": "https://motorical.com"
    },
    {
      "id": "oauthToken",
      "method": "POST",
      "path": "/api/oauth2/token",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [],
      "server": "https://motorical.com"
    },
    {
      "id": "oauthValidateToken",
      "method": "GET",
      "path": "/api/oauth2/validate",
      "pathParams": [],
      "query": [
        {
          "name": "token",
          "required": false
        },
        {
          "name": "access_token",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": "https://motorical.com"
    },
    {
      "id": "previewExport",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/exports/preview",
      "pathParams": [
        "id"
      ],
      "query": [
        {
          "name": "limit",
          "required": false
        },
        {
          "name": "includePII",
          "required": false
        }
      ],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "provisionSandbox",
      "method": "POST",
      "path": "/api/public/v1/account/sandbox/provision",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "provisionSandboxDashboard",
      "method": "POST",
      "path": "/api/developer/sandbox/provision",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "dashboardToken"
      ],
      "server": null
    },
    {
      "id": "reactivateMotorBlock",
      "method": "POST",
      "path": "/api/public/v1/account/motor-blocks/{id}/reactivate",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "refreshSession",
      "method": "POST",
      "path": "/api/auth/refresh",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [],
      "server": null
    },
    {
      "id": "register",
      "method": "POST",
      "path": "/api/auth/register",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [],
      "server": null
    },
    {
      "id": "removeFreeRecipient",
      "method": "DELETE",
      "path": "/api/public/v1/account/free-recipients/{id}",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "renameMotorBlock",
      "method": "PATCH",
      "path": "/api/public/v1/account/motor-blocks/{id}/name",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "sendEmail",
      "method": "POST",
      "path": "/v1/send",
      "pathParams": [],
      "query": [],
      "headers": [
        {
          "name": "Idempotency-Key",
          "required": false
        }
      ],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "apiKey"
      ],
      "server": null
    },
    {
      "id": "sendTestEmail",
      "method": "POST",
      "path": "/v1/test-email",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [
        "apiKey"
      ],
      "server": null
    },
    {
      "id": "setPassword",
      "method": "POST",
      "path": "/api/auth/set-password",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [],
      "server": null
    },
    {
      "id": "setSandboxOutboundDashboard",
      "method": "PATCH",
      "path": "/api/developer/sandbox/outbound",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "dashboardToken"
      ],
      "server": null
    },
    {
      "id": "streamEvents",
      "method": "GET",
      "path": "/api/public/v1/motor-blocks/{id}/events/stream",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "testWebhook",
      "method": "POST",
      "path": "/api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/test",
      "pathParams": [
        "id",
        "webhookId"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "updateWebhook",
      "method": "PUT",
      "path": "/api/public/v1/motor-blocks/{id}/webhooks/{webhookId}",
      "pathParams": [
        "id",
        "webhookId"
      ],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "verifyDomain",
      "method": "POST",
      "path": "/api/public/v1/domains/{id}/verify",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    },
    {
      "id": "verifyDomainDashboard",
      "method": "POST",
      "path": "/api/domains/{id}/verify",
      "pathParams": [
        "id"
      ],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": false,
      "auth": [
        "dashboardToken"
      ],
      "server": null
    },
    {
      "id": "verifySignupCode",
      "method": "POST",
      "path": "/api/auth/verify-code",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": true,
      "bodyRequired": true,
      "auth": [],
      "server": null
    },
    {
      "id": "whoami",
      "method": "GET",
      "path": "/api/public/v1/account/whoami",
      "pathParams": [],
      "query": [],
      "headers": [],
      "body": false,
      "bodyRequired": false,
      "auth": [
        "bearerToken"
      ],
      "server": null
    }
  ],
};
