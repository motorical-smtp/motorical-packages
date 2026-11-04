/**
 * Front-door wording and consent grouping (spec 2026-11-04 sections 1 and 2). Everything a person or an agent reads about a
 * missing permission is generated here from TOOL_SCOPES, never typed per tool, so a description cannot lie about availability.
 */
const { TOOL_SCOPES, ANY_GRANT_TOOLS, MCP_HOST } = require('./tools');
const { SCOPES } = require('./scopes');

/** Where a person adds a permission to an existing connection (the connections view lists every grant and merges scopes). */
const PERMISSION_PATH = 'Settings → Connections in the Motorical dashboard';

/** The one reliable step after a permission changes, in plain words. Same sentence on the connect page and in whoami. */
const PERMISSION_REFRESH_SENTENCE = 'After approving it, start a new chat or reconnect the connector if the tool still does not work.';

/**
 * What a tool the grant lacks says about itself. `marker` is appended to the listed description; `error` is what a call returns.
 * Returns null for a tool that needs nothing (an any-grant tool). Throws for an unknown tool: a typo must not read as "no permission".
 */
function permissionHint(toolName, missingScopes) {
  if (!Object.prototype.hasOwnProperty.call(TOOL_SCOPES, toolName)) throw new Error(`permissionHint: unknown tool "${toolName}"`);
  if (ANY_GRANT_TOOLS.includes(toolName)) return null;
  const need = missingScopes && missingScopes.length ? missingScopes : TOOL_SCOPES[toolName];
  if (!need.length) return null;
  const names = need.join(' ');
  return {
    scopes: need,
    marker: `Needs permission: ${names}. This connection does not hold it yet; the person can add it under ${PERMISSION_PATH}.`,
    error: `This connection lacks permission ${names}, which ${toolName} needs. Ask the person to add it under ${PERMISSION_PATH}. ${PERMISSION_REFRESH_SENTENCE}`,
  };
}

/**
 * Consent lines by TASK. A scope not listed here falls back to its resource line (groupForConsent's behaviour), so a new scope is
 * shown rather than lost. Sending to contacts keeps its own line: it is never hidden under editing.
 */
const CONSENT_TASKS = [
  { id: 'transactional', label: 'Send transactional email and see how it was delivered', scopes: ['send:transactional', 'read:analytics'] },
  { id: 'domains', label: 'Manage your sending domains', scopes: ['manage:domains', 'read:domains'] },
  { id: 'sandbox', label: 'Try things out in the developer sandbox', scopes: ['manage:sandbox', 'manage:recipients'] },
  { id: 'lists', label: 'Newsletters and lists: view and edit your lists, contacts, templates and drafts (this never emails your contacts)', scopes: ['read:comms', 'write:comms.audience', 'write:comms.content'] },
  { id: 'sending', label: 'Send campaigns to your contacts (this is what actually emails people)', scopes: ['send:comms.campaign'] },
  { id: 'workspace', label: 'Change newsletter workspace settings and sending addresses', scopes: ['manage:comms.workspace'] },
  { id: 'campaign-webhooks', label: 'Manage your campaign event webhooks', scopes: ['manage:comms.webhooks'] },
  { id: 'audience-delete', label: 'Delete lists and contacts, and clean up people who are on no list', scopes: ['manage:comms.audience'] },
  { id: 'webhooks', label: 'Manage your webhook endpoints', scopes: ['manage:webhooks', 'read:webhooks'] },
  { id: 'motor-blocks', label: 'Manage production Motor Blocks', scopes: ['manage:motor-blocks'] },
];

/** Same output shape as groupForConsent ({resource, label, scopes}) so the existing consent page renders it unchanged. */
function groupForConsentByTask(scopes) {
  const out = [];
  const placed = new Set();
  for (const task of CONSENT_TASKS) {
    const have = scopes.filter((s) => task.scopes.includes(s));
    if (!have.length) continue;
    have.forEach((s) => placed.add(s));
    out.push({ resource: task.id, label: task.label, scopes: have });
  }
  for (const s of scopes) {
    if (placed.has(s) || !SCOPES[s]) continue;
    placed.add(s);
    out.push({ resource: SCOPES[s].resource, label: SCOPES[s].customerAction, scopes: [s] });
  }
  return out;
}

/** The front door is the existing main server: same URI, hence the same RFC 8707 audience stored on its grants. */
const FRONT_DOOR_CANONICAL_URI = `${MCP_HOST}/v1/motorical/mcp`;

module.exports = { FRONT_DOOR_CANONICAL_URI, PERMISSION_PATH, PERMISSION_REFRESH_SENTENCE, permissionHint, CONSENT_TASKS, groupForConsentByTask };
