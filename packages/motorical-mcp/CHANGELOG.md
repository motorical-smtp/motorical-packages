# Changelog — @motorical/mcp

All notable changes to this project are documented here. Version numbers follow [Semantic Versioning](https://semver.org/).

## [1.10.2] — 2026-09-25

### Changed

- No code change. First release published through the hardened two-job workflow in `motorical-packages`
  (verify job with no publish credential; the publish job holds the OIDC token, installs no dependencies and
  publishes the exact tarball verify built). Released as its own version so the token exchange and provenance
  signing from a tarball path are exercised at a version that is not yet on npm.

## [1.10.1] — 2026-09-25

### Fixed

- Every tool's advertised `outputSchema` is now OPEN at every level (`additionalProperties` allowed), on both
  the native (2026-07-28) and legacy (2025-11-25) paths. Until now the SDK's `objectFromShape` advertised the
  TOP-LEVEL object of every output schema as closed (`additionalProperties:false`); 1.9.3 opened only the
  nested `data` objects of the Motor Block tools. A strict client validates the advertised JSON Schema, so any
  field the backend adds later (a new `nextAction`, `recipientSummary`, …) would have made a SUCCESSFUL call
  look like an error, and an agent might then retry and duplicate the action. Declared fields keep their types,
  required-ness, nullability and descriptions; only unknown fields are newly allowed. One choke point
  (`src/openOutputSchema.js`) applies it to every schema-bearing tool, so a new tool is safe by construction.

### Added

- `test/strictClientOutputSchemas.test.js`: a generic gate over every server's `tools/list` proving (per tool)
  no closed object in the advertised schema, its recorded real-response sample validates under Ajv (a strict
  client), the same sample with an unknown field injected at every object level still validates, and the
  legacy and native paths advertise identical schemas.

## [1.10.0] — 2026-09-24

### Added

- Every scoped server now has its own instructions, not just four of eight: `main`, `transactional`,
  `motorBlocks`, and `signup` used to fall through to the two-sentence generic fallback (the
  agent-ready-docs-and-positioning design's own audit named this gap). Every server's instructions now
  also point at the new `motorical://docs/agents-hub` resource for the full route chooser and rulebook.
- Two new resources, registered the same unconditional-on-every-server way as the existing
  `motorical://docs/llms.txt`/`openapi.json`: `motorical://docs/agents-hub` (the Agent Hub, text/markdown)
  and `motorical://docs/agents-playbook` (its machine twin, application/json) — both fetched live from
  docs.motorical.com, not duplicated in this package.
- `GET /` on the hosted server now answers with a landing page (every server, its transport URL, scopes,
  tool count) instead of 404 — generated per request from this process's own running registry, so it
  cannot go stale relative to what `/v1/:slug/mcp` actually serves.
- `GET /v1/:slug` (no `/mcp` suffix — deliberately a different path from the transport endpoint, whose own
  GET keeps its existing 405) now answers with a per-server card: scopes, full tool list, and whether the
  server needs auth.

## [1.9.4] — 2026-09-24

### Fixed

- Confirmation-gated tools (`change_type`, `assign_domain`, `deactivate`, `delete`, `webhook_delete`, `domain_verify`, `sandbox_convert`) still could not complete on a Claude client after 1.9.3. 1.9.3 gated its fallback on the client not declaring `elicitation`; the hosted server log then showed the Claude client declares `elicitation` and `roots` yet still cannot complete a native `input_required` reply (its `elicitation` is the older server-initiated form, so no declared capability reliably means "can answer `input_required`"). **`confirm: true` is now honored for every client**, the trust level every pre-2026 client already had; the backend still enforces its own preconditions (for example a block must be deactivated before it can be deleted). Without `confirm: true` the bound `input_required` form is unchanged, and the same reply now also carries a plain-text `confirmation_required` explanation (with `isError`), so a client that cannot answer the form shows the model instructions instead of a cryptic "did not return structured content" error. Supersedes 1.9.3's capability gate. Test: `mrtrClientFallback.test.js`.

## [1.9.3] — 2026-09-24

### Fixed

- A **successful** `motorical_motor_block_create` reached a strict client as "Structured content does not match the tool's output schema: data must NOT have additional properties", even though the block had been created. The advertised output schemas for the nine Motor Block tools were closed objects that omitted fields the backend really returns (`limits`, `credentialsNote`, `nextAction` on create; `nextAction` on deactivate and delete; `report`, `errorMessage`, `updatedAt` and others on deletion status). A strict client validates the advertised JSON Schema; the server's own zod validation ignores unknown keys, so no server-side test caught it. The schemas now declare the real fields and are open, so a new field can no longer turn a successful call into a client error. Found by the first real Motor Block lifecycle run through a Claude client; new test `motorBlockRealResponses.test.js` validates realistic backend bodies against each tool's advertised schema.
- Confirmation-gated tools (`change_type`, `assign_domain`, `deactivate`, `delete`, `webhook_delete`, `domain_verify`, `sandbox_convert`) could **never complete** on a client that does not implement the 2026-07-28 confirmation form: the native path ignored `confirm: true` and always replied `input_required`, which such a client reports as "did not return structured content". A client that declares its capabilities without `elicitation` now gets the plain route: without `confirm: true` the call returns a normal, actionable refusal (`confirmation_required`, "ask the user, then call again with confirm: true"); with it the action runs. A client that declares `elicitation`, or sends no capabilities, keeps the bound confirmation form, and a pre-filled `confirm: true` cannot bypass it. New test `mrtrClientFallback.test.js`.

### Changed

- The hosted server now logs the declared client capability **keys** (never values) whenever it answers `input_required` or falls back, to learn what real clients send.

## [1.9.2] — 2026-09-24

### Changed

- `motorical_web_handoff`'s description no longer says "CLI→browser": `@motorical/cli` is retired. The README no longer mentions the CLI's `--from-name` flag. No behavior change.

## [1.9.1] — 2026-09-24

### Fixed

- Hosted (protocol revision 2026-07-28) `tools/call` refusals — an input-validation failure such as a too-short `name` or a non-UUID `jobId`, and an output-validation failure — were returned without `resultType` and rejected by strict clients as "missing required resultType", so an agent never saw why its call was refused. They now carry `resultType: "complete"` with `isError: true`. Present since 1.2.x on every tool; found by the first real agent run against the Motor Blocks server. The legacy (2025-11-25) response is unchanged.

### Changed

- `motorical_motor_block_create` now says where a `domainId` comes from (`motorical_domain_list` on the Domains server, and how to add and verify one when the account has none).

## [1.9.0] — 2026-09-24

### Added

- Added nine production Motor Block lifecycle tools: list, create, rename, change type, assign domain, deactivate, reactivate, permanently delete, and deletion-status polling.
- Added the least-privilege `motorical_motor_blocks` hosted server and `manage:motor-blocks` scope.
- Added argument-bound MRTR confirmation for type changes, domain assignment, deactivation, permanent deletion, and sandbox conversion.

### Changed

- Explicit Motor Block ids are authorized from the backend's live grant state instead of the access token's frozen block list. Newly created blocks therefore work immediately without a token refresh.
- Sandbox conversion accepts a production name and type and clearly reports the SMTP username transition. Local stdio updates only implicit cached block/username/default-From metadata; hosted OAuth still exposes no credential secret.
- Ordinary rename is display-only. It never changes the SMTP username or other credential material.

### Security

- Permanent deletion is asynchronous, explicitly distinguishes history deletion, and requires confirmation bound to the exact arguments shown to the user.
- Hosted create responses and idempotency replays remain credential-redacted.

## [1.8.0] — 2026-09-23

### Added

- **Every tool with a required OAuth scope now states it in its own description.** Previously, an agent could only learn "this tool needs `manage:sandbox`" by calling it and parsing a 403. Descriptions are generated from the new shared `@motorical/scope-catalog` package, not hand-typed, so a future tool can't ship without this text.
- **`motorical_sandbox_allowlist_request`/`motorical_sandbox_allowlist_confirm`'s descriptions now also state they need a dashboard session, not just the scope.** Holding `manage:sandbox` alone does not make these two callable over OAuth/Delegation — unlike the other three sandbox tools (status/provision/convert), which do work over OAuth.

### Fixed

- **`instructions.js`'s sandbox guidance was stale.** It told agents "Sandbox tools need a dashboard session and are unavailable over OAuth" — true before 2026-09-08, when three of the five sandbox tools were unblocked over Delegation, and never updated since. Now states accurately which tools work over OAuth and which don't.

### Changed

- **Internal refactor: scope/tool metadata now lives in `@motorical/scope-catalog`.** `servers.js`'s `TOOL_SCOPES`, per-server tool lists, and `MCP_HOST`, plus `resourceAuth.js`'s "manage implies read" map, are now sourced from that shared package instead of declared locally — no behavior change from this refactor alone; it's what makes the previous two entries possible without a second hand-maintained copy of the same data.

## [1.7.0] — 2026-09-22

### Changed

- **Sandbox credentials are no longer returned over hosted OAuth.** `motorical_sandbox_provision`, when called under an OAuth/Delegation grant, never returns the raw `mk_live_` key or SMTP password — the response now carries `credentialsAvailable: false` plus a `credentialsNote` instead. The new Motor Block is still added to the calling grant's authorization, but a token minted before provisioning does not observe that until it is refreshed (`motorBlockIds` claims are frozen at mint time) — a send against the new block may briefly fail with "Motor block is not covered by this authorization" until then. Credentials for a converted, production Motor Block are reachable only via a dashboard link, never inline. **Local stdio (`@motorical/mcp`, dashboard-JWT auth) is unaffected** — it still returns credentials directly on provision, since it runs as the customer's own process on their own infrastructure.

- **`motorical_sandbox_convert` gains a `credentialsLocation` field over OAuth.** When called under an OAuth/Delegation grant, the response now includes `credentialsLocation`, a dashboard URL where the converted Motor Block's credential can be viewed or regenerated. This endpoint has never returned a raw credential value on any path, over OAuth or locally — only this pointer to where a human can retrieve one.

- **New `activeAuthMethod` field on `motorical_get_config` and `motorical_sandbox_convert`.** Both now report the target Motor Block's configured authentication method — `"Password"`, `"API Key"`, `"OAuth 2.0"`, or `"mTLS"` — read-only; changing it remains dashboard-only and is not exposed over MCP.

## [1.6.0] — 2026-09-07

### Added

- **New unauthenticated resource server: `signup`**, at `https://mcp.motorical.com/v1/signup/mcp`. It is the one MCP server that takes no bearer token at all — it exists so an agent whose human has no Motorical account yet has somewhere to start. It is deliberately *not* registered as an OAuth resource server, so no token can be minted for it and none is needed. It exposes exactly one tool.

- **New tool: `motorical_signup_handoff`** (on the `signup` server only; not on the core authenticated servers). Bridges a human with no account onto the calling OAuth client.
  - First call takes the agent's OAuth parameters: `clientId` (its CIMD `https://` client_id), `redirectUri` (one of that client's registered redirect URIs), `resource` (the RFC 8707 canonical URI of the server it ultimately wants a token for), `codeChallenge`, and `codeChallengeMethod` (always `'S256'`). `scope` and `state` are optional. It returns `{ status: 'awaiting_browser', url, continuationToken }` — a one-time URL for the human to open, which runs signup and then the normal OAuth consent screen for that client in the same browser visit.
  - Later calls pass `continuationToken` on its own to check progress. Still `{ status: 'awaiting_browser', ... }` until the account is verified *and* has a password set, then `{ status: 'ready' }`. An unknown or expired `continuationToken` is an error (HTTP 404), not a perpetual `awaiting_browser`.
  - **No credential of any kind is ever returned by this tool.** It hands back a URL and an opaque continuation token; the human's browser does the rest.
  - Annotated `idempotentHint: false`: a call with no `continuationToken` mints a fresh handoff record every time, so a host must not auto-retry it.

- **PII honesty fields on masked outputs** — `pii_masked` (boolean) and `pii_unmask_path` (string, `null` when nothing is masked) are now declared in the output schemas of `motorical_get_message`, `motorical_get_message_events`, and `motorical_wait_for_outcome`. They are forwarded verbatim from the Public API. Previously a recipient address came back as `a***@x.com` with nothing saying whether it had been masked or what to do about it. `motorical_send_email` is unchanged — it does not return recipient PII.

- **Unmasking is not available over OAuth. At all.** This is a channel limitation, not a scope you can ask for: the `logs.pii` public scope is unreachable from every MCP grant scope (it is stripped in the token mint and is absent from the grantable-scope list), so no amount of consent, re-authorization, or scope escalation produces an OAuth or MCP token that can unmask. `pii_unmask_path` says so in those words for an OAuth caller, and names the dashboard or a local `@motorical/mcp` install running on a dashboard session as the only paths that can. For the other public-token families it says something different and equally specific — pass `includePII=true` if the token already holds `logs.pii`, or use a token that includes that scope if it does not.

### Changed

- **Sandbox tools now work over OAuth delegation.** `motorical_sandbox_status`, `motorical_sandbox_provision`, and `motorical_sandbox_convert` are callable from an OAuth grant holding `manage:sandbox`, against new account-scoped Public API routes. They previously refused every OAuth call with "not available over an OAuth authorization" while still advertising the scope — the capability was declared but inert. `motorical_sandbox_allowlist_request` and `motorical_sandbox_allowlist_confirm` remain dashboard-session-only.

- **Breaking: `manage:sandbox` maps to a different Public API scope.** It previously mapped to `config.read` — a read-only scope standing in for a set of write operations — and now maps to `sandbox.manage`. Two consequences for anyone already holding a `manage:sandbox` grant: sandbox operations that used to fail now execute for real (they create a live sandbox domain, DKIM keypair, DNS records, and Motor Block), and a grant that held `manage:sandbox` *alone* no longer carries `config.read` with it. Review your grants if you hold this scope.

- **`motorical_get_onboarding_state` names a fix at the sandbox stage instead of nothing.** An account whose only Motor Block is a sandbox used to get `next_action: null` with no blocker. It now reports a `not_production_yet` blocker — "Sandbox works; production sending needs the sandbox converted onto a verified domain, which requires an active paid plan" — whose fix names `motorical_sandbox_convert` with the verified domain's id. The blocker deliberately does not claim the account lacks a subscription: this code path never checks for one (the authoritative check lives in the convert operation itself), and an already-paying account that simply has not converted yet reaches it too.

### Internal

- Sandbox delegation reuses the existing audience-bound token verification and the `Delegation` assertion path; no new credential requirements.

- `pii_masked` is derived from the same `includePII` boolean that gates the response, so the flag cannot disagree with what was actually masked. `pii_unmask_path` is computed per caller from that caller's own scopes and token family rather than being a single constant string.

## [1.5.0] — 2026-08-30

### Changed

- Breaking: `motorical_webhook_delete` and `motorical_domain_verify` now require explicit confirmation (`confirmRealAction: true`) before executing. This prevents accidental deletions and verification rewrites. The confirmation is gated by MRTR (mutual request transport review) to ensure the user intends the action.

### Added

- Structured 429 (rate-limit) responses on `motorical_send_email` — when rate-limited, the tool returns `{status: 'rate_limited', retryAfter: number}` (seconds), not just an error message.

- `motorical_get_onboarding_state` — inspect account setup progress and required next steps for new Motorical customers.

- Read-only scopes: `read:webhooks`, `read:domains` — implied expansion of `read:email` to include webhook and domain inspection without write privileges.

## [1.4.0] — 2026-08-20

### Added

- Idempotency keys on write operations: `motorical_domain_add`, `motorical_webhook_create`, `motorical_webhook_update` all accept optional `idempotencyKey` to safely retry without duplicating resources.

### Changed

- Scope consolidation: `read:email` now implies `read:webhooks` and `read:domains`, reducing permission complexity for auditing and monitoring use cases.

## [1.3.0] — 2026-08-10

### Changed

- Native MCP 1.30.0+ support — bumped SDK floor to `@modelcontextprotocol/sdk@^1.30.0` for stable deep imports and verified Sigstore provenance on published packages.

### Internal

- Switched to `@modelcontextprotocol/sdk`'s native `toJsonSchemaCompat` converter; removed hand-rolled schema converter.

## [1.2.1] — 2026-07-28

### Added

- OAuth 2.1 login flow for local CLI: `motorical-mcp login` opens a browser, user approves scopes on Motorical's consent screen, grant is stored locally at `~/.motorical/mcp-credentials.json` (owner-only, 0600). Refresh tokens rotate on every use; access tokens refresh silently.

- Credentials file now takes precedence over environment variables when both are available.

- Per-agent audience binding and RFC 9207 issuer checking on OAuth callbacks.

## [1.2.0] — 2026-07-15

### Added

- Streamable HTTP transport entrypoint (`src/serve.js`) for hosting the MCP server over HTTP with RFC 9728 metadata support.

- Audience-bound token verification for OAuth tokens — tokens are bound to a specific agent/service to prevent token reuse across different callers.

- Step-up scope challenges on protected operations.

## [1.1.3] — 2026-07-02

### Fixed

- Sandbox tools `sandbox_provision` and `sandbox_convert` now steer toward correct subsequent operations and clearly distinguish provisioning from conversion stages.

- `motorical_sandbox_status` now correctly reads and reports sandbox state across transitions.

## [1.1.2] — 2026-07-01

### Fixed

- `motorical_domain_list` scope correction — reverted from `manage:domains` to `read:domains` (was overprivileged).

- `motorical_sandbox_status` output schema fixes — now correctly reports sandbox stage, blocker, and progress.

## [1.1.1] — 2026-06-29

### Fixed

- Repository and bugs URLs corrected to the canonical `motorical-smtp/motorical-backend` repo (was pointing to stale locations).

- Dry-run publish validation: end-to-end test of `npm publish --dry-run` now passes (internal CI validation).

## [1.1.0] — 2026-06-15

### Added

- JWT fallback bearer minting — when `MOTORICAL_AK_API_KEY` is provided, the client can auto-mint a bearer token for read-only operations without separate token provisioning.

- Aggregated precondition errors — invalid scopes, missing environment variables, and authentication failures now report all issues together, not one at a time.

### Changed

- Initial public release after internal protocol stabilization.
