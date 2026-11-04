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

// Static, PUBLIC documentation resources (docs.motorical.com, no credentials
// involved). Unlike RESOURCES / RESOURCE_TEMPLATES below -- account data,
// analytics-server-only -- these are served on EVERY server on both the legacy
// and the native path, because instructions.js tells agents on every server to
// read motorical://docs/agents-hub. `docsPath` is the docs-site path fetched
// live through client.fetchDocs.
function docsResource({ uri, name, description, mimeType, docsPath }) {
  return {
    uri, name, description, mimeType, docsPath,
    handler: (client) => async () => ({
      contents: [{ uri, mimeType, text: await client.fetchDocs(docsPath) }],
    }),
  };
}

// Plans and prices change, so nothing in an instruction or a doc types them: this resource reads the public billing feed at the moment of the
// read and projects only what an agent must quote. A feed that is down or malformed is an error, never a stale or invented price list.
const PLANS_URL = 'https://motorical.com/api/billing/plans';

export function plansView(raw, now = new Date()) {
  const list = raw && Array.isArray(raw.plans) ? raw.plans : [];
  if (list.length === 0) throw new Error('The plans feed returned no plans');
  const plans = list.map((p) => {
    if (typeof p.amount !== 'number' || !p.currency) throw new Error(`The plans feed has no price for "${p.name}"`);
    const f = p.features || {};
    const limits = f.emailLimits || {};
    const trialDays = (f.trial && f.trial.days) || p.trialPeriodDays || 0;
    const currency = String(p.currency).toUpperCase();
    return {
      name: p.name,
      description: p.description || null,
      price: `${currency} ${(p.amount / 100).toFixed(2)} per ${p.interval || 'month'}`,
      amountCents: p.amount,
      currency,
      interval: p.interval || 'month',
      emailsPerMonth: limits.monthly ?? p.emailLimit ?? null,
      emailsPerDay: limits.daily ?? null,
      emailsPerHour: limits.hourly ?? null,
      motorBlocks: (f.motorBlocks && f.motorBlocks.maxCount) ?? p.motorBlocks ?? null,
      marketingEmail: Boolean(f.communications && f.communications.enabled),
      support: f.support && f.support.level ? `${f.support.level}${f.support.response_time ? ` (${f.support.response_time})` : ''}` : null,
      trial: trialDays > 0 ? { days: trialDays, newCustomersOnly: Boolean(f.trial && f.trial.newCustomersOnly) } : null,
    };
  });
  return {
    asOf: now.toISOString(),
    source: PLANS_URL,
    pricingPage: 'https://motorical.com/pricing',
    marketingEmailPlans: plans.filter((p) => p.marketingEmail).map((p) => p.name),
    note: 'Read live from the billing feed just now. Prices and limits change: quote these figures with the time they were read, never from memory. Marketing campaigns need a plan with marketingEmail true (listed in marketingEmailPlans); a plan with marketingEmail false cannot send them, and that includes any trial it offers. Only the person can subscribe or change plan: give them the pricing page link.',
    plans,
  };
}

async function fetchLivePlans() {
  const res = await fetch(process.env.MOTORICAL_PLANS_URL || PLANS_URL, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`The plans feed answered ${res.status}`);
  return res.json();
}

export const DOC_RESOURCES = [
  docsResource({
    uri: 'motorical://docs/llms.txt',
    name: 'Motorical llms.txt',
    description: 'Motorical llms.txt — transactional email API discovery index for agents',
    mimeType: 'text/plain',
    docsPath: '/llms.txt',
  }),
  docsResource({
    uri: 'motorical://docs/llms-full.txt',
    name: 'Motorical llms-full.txt',
    description: 'Motorical llms-full.txt — the full documentation text for agents',
    mimeType: 'text/plain',
    docsPath: '/llms-full.txt',
  }),
  docsResource({
    uri: 'motorical://docs/openapi.json',
    name: 'Motorical OpenAPI',
    description: 'Motorical OpenAPI snapshot from docs.motorical.com',
    mimeType: 'application/json',
    docsPath: '/openapi.json',
  }),
  {
    uri: 'motorical://docs/plans',
    name: 'Motorical Plans',
    description: 'The current plans, live: name, price, email limits, Motor Blocks, trial, and whether the plan includes marketing email. Always read this before quoting a plan or a price.',
    mimeType: 'application/json',
    handler: (client) => async () => {
      const raw = typeof client.fetchPlans === 'function' ? await client.fetchPlans() : await fetchLivePlans();
      return { contents: [{ uri: 'motorical://docs/plans', mimeType: 'application/json', text: JSON.stringify(plansView(raw), null, 2) }] };
    },
  },
  docsResource({
    uri: 'motorical://docs/agents-hub',
    name: 'Motorical Agent Hub',
    description: 'Motorical Agent Hub — route chooser, rulebook, and journeys, from docs.motorical.com/agents',
    mimeType: 'text/markdown',
    docsPath: '/agents.md',
  }),
  docsResource({
    uri: 'motorical://docs/agents-playbook',
    name: 'Motorical Agent Playbook',
    description: 'Machine-readable twin of the Agent Hub: journeys, scopes, human-required flags, stop conditions',
    mimeType: 'application/json',
    docsPath: '/agents.json',
  }),
];

export function docResourceByUri(uri) {
  return DOC_RESOURCES.find((r) => r.uri === uri) || null;
}

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
