import { TOOL_SCOPES, expandMcpImplied } from '@motorical/scope-catalog';

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
  return toolNames.filter((name) => (TOOL_SCOPES[name] || []).every((s) => have.includes(s)));
}
