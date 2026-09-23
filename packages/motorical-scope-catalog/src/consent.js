const { SCOPES } = require('./scopes');

const LEVEL_RANK = { read: 0, manage: 1 };

/**
 * "Granular and secure internally; simple for the customer" (P7 design
 * principle 1). The underlying scopes stay separately grantable and
 * separately enforced; this only changes what the consent screen SHOWS —
 * one line per resource area, using whichever granted scope for that
 * resource has the highest level, while `scopes` on the returned group
 * still lists every individual scope actually granted for it.
 */
function groupForConsent(scopes) {
  const byResource = new Map();
  for (const id of scopes) {
    const meta = SCOPES[id];
    if (!meta) continue;
    const existing = byResource.get(meta.resource);
    if (!existing || LEVEL_RANK[meta.level] > LEVEL_RANK[existing.level]) {
      byResource.set(meta.resource, { resource: meta.resource, label: meta.customerAction, level: meta.level, scopes: [] });
    }
  }
  for (const id of scopes) {
    const meta = SCOPES[id];
    if (!meta) continue;
    byResource.get(meta.resource).scopes.push(id);
  }
  return Array.from(byResource.values()).map(({ resource, label, scopes: s }) => ({ resource, label, scopes: s }));
}

function publicScopesFor(mcpScopes) {
  const out = new Set();
  for (const id of mcpScopes) {
    for (const p of (SCOPES[id]?.publicScopes || [])) out.add(p);
  }
  out.delete('logs.pii');
  return Array.from(out);
}

module.exports = { groupForConsent, publicScopesFor };
