# Changelog

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
