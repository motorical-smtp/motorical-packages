//
// The declarative resource/resource-template table -- registry.js's TOOLS
// discipline applied to resources: one source both the legacy path
// (server.js's registerResource) and the native dispatcher (dispatch.js)
// read, so the two can never advertise or serve something different from
// each other. Handlers are (client) => async (variables) => ReadResourceResult,
// the same per-request-client factory shape every tool handler already uses.
const CACHE_TTL_MS = 300000; // 5 minutes -- state moves at DNS-propagation/human-decision speed

function accountStateResult(uri, data) {
  return {
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
  };
}

export const RESOURCES = [
  {
    uri: 'motorical://account/state',
    name: 'Account State',
    description: 'Composed account readiness: stage, ready_to_send, blockers, and next_action.',
    mimeType: 'application/json',
    handler: (client) => async () => {
      const raw = await client.getAccountState();
      return accountStateResult('motorical://account/state', raw.data);
    },
  },
];

export const RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'motorical://domain/{domain}',
    name: 'Domain State',
    description: 'One domain\'s verification/send-readiness state, from the same account-state data.',
    mimeType: 'application/json',
    match: (uri) => {
      const m = /^motorical:\/\/domain\/([^/]+)$/.exec(uri);
      return m ? { domain: decodeURIComponent(m[1]) } : null;
    },
    handler: (client) => async ({ domain }) => {
      const raw = await client.getAccountState();
      // A missing `domains` field (a malformed/incomplete backend response)
      // is NOT the same fact as "this domain isn't in the list" -- the
      // honesty constraint this project follows means "no data was
      // returned" must never be reported as the stronger, specific claim
      // "this domain definitely does not exist". `(x || [])` collapsed both
      // into the same `Domain not found: x` error; distinguish them instead.
      if (!Array.isArray(raw.data.domains)) {
        throw new Error('Account state response is missing domains data');
      }
      const entry = raw.data.domains.find((d) => d.domain === domain);
      if (!entry) throw new Error(`Domain not found: ${domain}`);
      return accountStateResult(`motorical://domain/${encodeURIComponent(domain)}`, entry);
    },
  },
  {
    uriTemplate: 'motorical://motor-block/{id}',
    name: 'Motor Block State',
    description: 'One Motor Block\'s state, from the same account-state data.',
    mimeType: 'application/json',
    match: (uri) => {
      const m = /^motorical:\/\/motor-block\/([^/]+)$/.exec(uri);
      return m ? { id: decodeURIComponent(m[1]) } : null;
    },
    handler: (client) => async ({ id }) => {
      // Hosted account-state is account-scoped and can contain blocks outside
      // this grant. Validate the explicitly named id against the live grant
      // before fetching or filtering account data. Local stdio clients have a
      // dashboard session rather than an OAuth grant and intentionally have no
      // authorizeMotorBlock helper.
      if (typeof client.authorizeMotorBlock === 'function') {
        await client.authorizeMotorBlock(id);
      }
      const raw = await client.getAccountState();
      // Same distinction as the domain template above: a missing
      // `motorBlocks` field means "can't verify", not "definitely doesn't
      // exist".
      if (!Array.isArray(raw.data.motorBlocks)) {
        throw new Error('Account state response is missing motorBlocks data');
      }
      const entry = raw.data.motorBlocks.find((b) => b.id === id);
      if (!entry) throw new Error(`Motor Block not found: ${id}`);
      return accountStateResult(`motorical://motor-block/${encodeURIComponent(id)}`, entry);
    },
  },
];

export function resourceByUri(uri) {
  return RESOURCES.find((r) => r.uri === uri) || null;
}

export function matchResourceTemplate(uri) {
  for (const template of RESOURCE_TEMPLATES) {
    const variables = template.match(uri);
    if (variables) return { template, variables };
  }
  return null;
}

export { CACHE_TTL_MS };
