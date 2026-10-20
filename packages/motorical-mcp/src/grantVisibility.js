import { TOOL_SCOPES, SERVER_TOOLS, expandMcpImplied } from '@motorical/scope-catalog';

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
 * The sandbox server's tools (status, provision, convert, the allowlist pair and the free-recipient tools). Once an
 * account has a verified real domain AND an active plan it is past the sandbox phase and an agent no longer needs
 * them, so they are not advertised. A real domain alone does not qualify: a Free account on its own domain still
 * sits in a sandbox and needs the recipient tools. Listing only; calls are enforced elsewhere.
 */
const SANDBOX_TOOLS = new Set(SERVER_TOOLS.sandbox);
export const SANDBOX_TOOL_NAMES = SANDBOX_TOOLS;

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
export function toolsVisibleToGrant(toolNames, grantedScopes, { sandboxOver = null } = {}) {
  if (!Array.isArray(grantedScopes)) return toolNames;
  const have = expandMcpImplied(grantedScopes);
  // Only a definite true hides: null/undefined (lookup failed or not asked) keeps the tools listed.
  const stageHidden = sandboxOver === true ? SANDBOX_TOOLS : null;
  return toolNames.filter((name) => !DASHBOARD_SESSION_ONLY.has(name)
    && !(stageHidden && stageHidden.has(name))
    && (TOOL_SCOPES[name] || []).every((s) => have.includes(s)));
}
