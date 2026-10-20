# Changelog

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
