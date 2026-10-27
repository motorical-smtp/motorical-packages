# Changelog

## 0.14.0 — 2026-10-27

The hosted `communications` server gains 5 reporting reads (Comms MCP M3-6), all `read:comms`: `comms_get_campaign_report`, `comms_get_campaign_links`,
`comms_get_campaign_timeline`, `comms_list_campaign_events` and `comms_get_analytics_overview`. They never return a recipient address, an IP address or a user agent.
No scope was added, renamed or re-described, and the first consent is unchanged; existing grants keep exactly what they had.

## 0.13.0 — 2026-10-27

The hosted `communications` server gains the two tools that actually email people (Comms MCP M3-5), both `send:comms.campaign`: `comms_schedule_campaign` and `comms_cancel_campaign`.
The server now offers four scopes: `read:comms`, `write:comms.audience`, `write:comms.content` and `send:comms.campaign`. **The first consent is unchanged** (`COMMS_INITIAL_SCOPES` is still read plus
the two edit scopes); sending is a step-up asked once, when a send tool is first used, and it keeps its own consent line ("Send campaigns to your contacts (this is what actually emails people)").
No scope was added, renamed or re-described, and existing grants keep exactly what they had.

## 0.12.0 — 2026-10-27

The hosted `communications` server gains 5 campaign-draft tools (Comms MCP M3-4), all `write:comms.content`: `comms_create_campaign`, `comms_update_campaign`, `comms_duplicate_campaign`,
`comms_preflight_campaign` and `comms_send_test` (to the account owner only, no recipient input). No scope was added or changed, so there is no new consent: the server still offers exactly
`read:comms`, `write:comms.audience` and `write:comms.content`, and the consent line already says "campaign drafts, and send test emails to you". Nothing here schedules, cancels, deletes or sets a
time, a timezone or pacing; those belong to a later, separately consented step.

## 0.11.0 — 2026-10-27

The hosted `communications` server gains 7 contact tools (Comms MCP M3-3): the reads `comms_list_list_contacts` and `comms_find_contact` (`read:comms`, addresses masked) and the writes
`comms_import_contacts`, `comms_remove_from_list`, `comms_derive_list`, `comms_unsubscribe_contact` and `comms_add_suppression` (`write:comms.audience`, dry run by default).
No scope was added or changed, so there is no new consent: the server still offers exactly `read:comms`, `write:comms.audience` and `write:comms.content`, and the consent line is
unchanged. Nothing here deletes or erases a contact, exports data, resubscribes anyone, or sends.

## 0.10.0 — 2026-10-27

The hosted `communications` server gains 8 write tools (Comms MCP M3-2): `comms_create_template`, `comms_create_template_from_starter`, `comms_update_template`,
`comms_apply_template_fixes`, `comms_duplicate_template` and `comms_set_brand_kit` (all `write:comms.content`), and the list-card tools `comms_create_list` and
`comms_update_list` (`write:comms.audience`). The server now offers exactly `read:comms`, `write:comms.audience` and `write:comms.content`; sending, workspace settings
and webhooks are still offered by no server. None of the tools deletes, sends or touches contacts, and every write defaults to a dry run.
The consent screen now shows reading and the two edit scopes as ONE line ("View and edit your lists, contacts, templates and campaign drafts, and send test emails to
you. This never emails your contacts."): the `resource` of `write:comms.audience` and `write:comms.content` is now `comms`, like `read:comms`, and both edit scopes share one
label. A read-only grant still shows the read-only line; sending keeps its own line. No scope was added, removed or renamed, and no implication changed.

## 0.9.0 — 2026-10-27

The hosted `communications` server lists 17 more read-only tools (Comms MCP M3-1): `comms_list_workspaces`, `comms_list_marketing_blocks`, `comms_list_lists`,
`comms_get_list`, `comms_compare_lists`, `comms_get_list_relations`, `comms_list_templates`, `comms_get_template`, `comms_get_template_rules`, `comms_lint_template`,
`comms_suggest_template_fixes`, `comms_check_links`, `comms_preview_template`, `comms_list_starters`, `comms_get_brand_kit`, `comms_list_campaigns` and `comms_get_campaign`.
Every one needs `read:comms` and nothing else, so the server still offers exactly that one scope: no new consent, and no existing grant changes. None of them writes,
sends or deletes. Pair with `@motorical/mcp` built from the same commit (the tool table lives there).

## 0.8.0 — 2026-10-27

Six Communications (marketing) scopes: `read:comms`, `write:comms.audience`, `write:comms.content`, `send:comms.campaign`, `manage:comms.workspace`,
`manage:comms.webhooks`, each its own consent area; every write/send/manage scope implies `read:comms`, and none reaches a Public API scope or
any destructive operation. New constants for the Communications server: `COMMS_SCOPES`, `COMMS_INITIAL_SCOPES` (read plus the two writes; sending and
managing are a step-up), `COMMS_CANONICAL_URI`, `COMMS_DELEGATION_AUDIENCE` (`https://api.motorical.com/internal/mcp/comms`, distinct from the backend's).
The new hosted `communications` server (slug `motorical_communications`) offers only `read:comms` for now, through two read-only tools, `comms_get_readiness` and `comms_get_map` (plus `motorical_whoami`); the other five scopes are grantable in name but offered by no server until their tools exist, because a server offers exactly the scopes its tools need. The main server does not offer any of them, and no existing grant changes. `RESOURCE_SERVER_DEFAULTS` makes the communications resource row marketing-only and disabled when first created.

## 0.7.0 — 2026-10-22

`motorical_get_onboarding_state` now needs `read:domains` and moves from the analytics server to the domains server (`main` still lists
it). It wraps `GET /account/state`, which needs the Public API scope `config.read`; `read:analytics` does not carry that scope, so the tool
was listed to a `read:analytics`-only grant and refused with `403 missing_scope` (proved live 2026-10-22). It reports domain
verification, DNS readiness and Motor Block state, so it is a domains read and is not opened to every grant. A docs check now compares
every tool's scope with the scope its route requires.

## 0.6.0 — 2026-10-22

`motorical_whoami` needs no scope and every authenticated hosted server lists it. It was listed under `read:analytics`, but the
Public API route behind it needs `config.read`, which `read:analytics` does not carry, so a grant holding only `read:analytics`
was shown the tool and refused when it called it (`403 missing_scope`), and a grant without that scope never saw it. Its
`TOOL_SCOPES` entry is now `[]`, the `transactional`, `domains`, `sandbox`, `webhooks` and `motorBlocks` server lists add it
after their own tools, and the new `ANY_GRANT_TOOLS` export names such tools. `main` and `analytics` are unchanged. Pair with
backend route `GET /account/whoami` accepting any live OAuth grant.

## 0.5.0 — 2026-10-20

Domain READ operations are now available with `read:domains` alone. `motorical_get_config` and
`motorical_get_domain_health` move from `manage:domains` to `read:domains` (the Public API routes they wrap ask for
`config.read`, which `read:domains` already grants; the earlier mapping was a mistake). Three new read-only tools join the
domains server: `motorical_domain_get`, `motorical_domain_dns_records` and `motorical_domain_health` (health by domain id).
No new scope. Domain removal is intentionally not offered.

## 0.4.0 — 2026-10-20

Add the `motorical_whoami` tool to the analytics (and main) server, requiring `read:analytics`.
No new scope and no change to any existing mapping.

## 0.3.1 — 2026-10-13

Text only: rewrite the `manage:sandbox` `agentDescription`, which was confusing
("this scope alone does not make that callable over OAuth"). It now says plainly
that allowlisting by 6-digit code is dashboard-only and not available over OAuth,
and that `manage:recipients` is the scope for allowing recipients over OAuth.
No scope, mapping or behavior change.

## 0.3.0 — 2026-10-13

Add the `manage:recipients` scope (public scope `recipients.manage`) and map the
three free-recipient tools (`motorical_free_recipient_add`, `_list`, `_remove`)
in `TOOL_SCOPES`. Consumers must require `^0.3.0`: with 0.2.0 the backend drops
the scope from grants and `@motorical/mcp` fails to load.

## 0.2.0 — 2026-09-24

Add the `manage:motor-blocks` scope, the dedicated
`motorical_motor_blocks` resource, and the nine bounded production Motor Block
lifecycle tool mappings (P8).

## 0.1.0 — 2026-09-23

Initial release. Replaces motorical-backend's `MCP_GRANTABLE_SCOPES`,
`MCP_SCOPES_SUPPORTED`, `MCP_TO_PUBLIC_SCOPES`, `IMPLIED_READ_SCOPES`, and
`@motorical/mcp`'s `IMPLIED_READ_MCP_SCOPES`, `TOOL_SCOPES`, and per-server
tool-list constants with one canonical source (P7).
