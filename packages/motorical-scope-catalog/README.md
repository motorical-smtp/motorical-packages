# @motorical/scope-catalog

Canonical MCP/OAuth scope metadata for Motorical. One source of truth for:

- what each of the eight grantable MCP scopes means, for an agent AND for a customer (`SCOPES`)
- which Public API scopes each MCP scope unlocks (`SCOPES[id].publicScopes`, `publicScopesFor`)
- "manage implies read", in both the MCP and Public API vocabularies (`implication.js`)
- which scopes a tool needs, and which scopes a given MCP resource server allows (`tools.js`)
- how to group scopes for a consent screen (`groupForConsent`)

Consumed by `motorical-backend` (OAuth server, Public API auth) and `@motorical/mcp`
(the hosted/local MCP server). See `motorical-docs/specs/2026-09-23-mcp-p7-scope-legibility-founding-doc.md`
for why this package exists.

## Motor Block management

`manage:motor-blocks` maps to the existing Public API `config.read` and
`config.manage` scopes. Its dedicated resource is
`https://mcp.motorical.com/v1/motorical_motor_blocks/mcp`, which advertises the
nine bounded production Motor Block lifecycle tools. Communications Block and
marketing-block operations are deliberately excluded.
