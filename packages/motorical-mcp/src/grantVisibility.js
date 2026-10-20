import { TOOL_SCOPES, expandMcpImplied } from '@motorical/scope-catalog';

/**
 * Tools whose own descriptions say "NOT AVAILABLE over hosted OAuth (dashboard session only)". They carry a scope
 * (manage:sandbox) so a scope filter alone listed them on every sandbox grant, inviting calls that can only fail;
 * motorical_free_recipient_add is the OAuth replacement. A grant is by definition an OAuth connection, so hide them.
 */
const DASHBOARD_SESSION_ONLY = new Set([
  'motorical_sandbox_allowlist_request',
  'motorical_sandbox_allowlist_confirm',
]);

/**
 * Which of a server's tools a given OAuth grant can actually call.
 *
 * The tool list is the one thing every client shows its model, so listing tools the grant cannot use
 * (webhooks and Motor Block management on a sandbox grant) only invites calls that fail with an opaque
 * "Insufficient scope". A tool is visible only when every scope it requires is covered by the grant,
 * counting implied scopes the same way the call-time check does (manage:domains covers read:domains).
 *
 * `grantedScopes` undefined/null means "no grant to judge" (the local stdio server, the unauthenticated
 * signup server): everything stays visible. Calling a hidden tool still answers 403 insufficient_scope
 * from http.js, so this narrows the advertisement, never the enforcement.
 */
export function toolsVisibleToGrant(toolNames, grantedScopes) {
  if (!Array.isArray(grantedScopes)) return toolNames;
  const have = expandMcpImplied(grantedScopes);
  return toolNames.filter((name) => !DASHBOARD_SESSION_ONLY.has(name)
    && (TOOL_SCOPES[name] || []).every((s) => have.includes(s)));
}
