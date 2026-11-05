/**
 * The Communications read family (Comms MCP M3-1): 17 read-only tools over the Comms Block, declared once.
 *
 * One table drives everything that must agree: the registry entry (description, input schema, annotations), the Comms client method,
 * the TOOL_ROUTES documentation wiring and the delegated-client method map. The scope catalogue (a separate package) lists the same
 * names and a test keeps the two in step. Every tool needs `read:comms` and nothing else: grants stay simple, tools stay granular.
 *
 * Rules built in (see motorical-docs specs/2026-10-26-comms-mcp-scenario-runbook.md section 5):
 * - nothing here writes; the four POSTs (lint, fix, check-links, preview) are the API's read-only POSTs and save nothing;
 * - every list is paged with a cap (the API itself returns whole lists), 50 by default, 200 at most;
 * - ids are checked before any network call;
 * - the preview takes sample data only, never a real contact id, so a recipient's address cannot land in a chat by accident.
 */

import { z } from 'zod';

export const DEFAULT_PAGE = 50;
export const MAX_PAGE = 200;

const workspaceId = z.string().uuid().optional()
  .describe('The Communications workspace. Optional when the authorization covers exactly one; otherwise required (the error lists the choices, the account default first).');
const paging = {
  limit: z.number().int().min(1).max(MAX_PAGE).optional().describe(`How many items to return (default ${DEFAULT_PAGE}, at most ${MAX_PAGE}).`),
  offset: z.number().int().min(0).optional().describe('How many items to skip, to read the next page (default 0).'),
};
const uuid = (what) => z.string().uuid().describe(what);

// A template is read either by id (a saved one) or as an unsaved draft; exactly one of the two.
const draft = {
  templateId: z.string().uuid().optional().describe('A saved template. Give this OR the draft fields, never both.'),
  subject: z.string().max(998).optional().describe('Draft subject (with bodyHtml and/or bodyText), when not using templateId.'),
  bodyHtml: z.string().max(300000).optional().describe('Draft HTML body.'),
  bodyText: z.string().max(300000).optional().describe('Draft plain-text body.'),
};
const draftBody = (a) => {
  const body = {};
  if (a.templateId !== undefined) body.template_id = a.templateId;
  if (a.subject !== undefined) body.subject = a.subject;
  if (a.bodyHtml !== undefined) body.body_html = a.bodyHtml;
  if (a.bodyText !== undefined) body.body_text = a.bodyText;
  return body;
};

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const COMMS_READ_TOOLS = [
  {
    tool: 'comms_list_workspaces', method: 'commsListWorkspaces', http: 'GET', route: '/comm-api/api/workspaces', account: true, paged: true,
    path: () => '/workspaces', title: 'Marketing workspaces',
    description: 'The marketing workspaces this authorization covers: id, name, slug, status and isDefault. '
      + 'A workspace is one brand or sending identity; the default workspace is the account\'s main one, listed first. Most customers only '
      + 'need the default: do not suggest creating more, and do not mention workspaces at all when exactly one is covered. Account-level, '
      + 'so it takes no workspaceId. Read-only.',
    input: { ...paging },
  },
  {
    tool: 'comms_list_marketing_blocks', method: 'commsListMarketingBlocks', http: 'GET', route: '/comm-api/api/workspaces/current/motor-blocks',
    path: () => '/workspaces/current/motor-blocks', title: 'Marketing sending identities',
    description: 'The campaign Motor Blocks assigned to this workspace: id, name, active, the '
      + 'sending domain and whether it is verified. A campaign sends through one of these, from an address on its verified domain. '
      + 'If the list is empty or the domain is unverified, comms_get_readiness says what to do next. Read-only.',
    input: {},
  },
  {
    tool: 'comms_list_lists', method: 'commsListLists', http: 'GET', route: '/comm-api/api/lists', paged: true,
    path: (a) => `/lists${a.archived ? `?archived=${a.archived}` : ''}`, shape: listCards, title: 'Contact lists',
    description: 'The workspace\'s contact lists as cards: name, description, kind, where it came from, how many members '
      + 'and how many are eligible to receive mail, and whether it is a one-time snapshot. Counts come from this result; quote them with '
      + 'the time you read them, never from memory. Paged (default 50, at most 200; see page.truncated). To orient in one call use '
      + 'comms_get_map instead. Archived lists are hidden; archived=include shows them too, archived=only just those. Read-only.',
    input: { ...paging, archived: z.enum(['include', 'only']).optional().describe('Show archived lists as well (include) or only those (only).') },
  },
  {
    tool: 'comms_get_list', method: 'commsGetList', http: 'GET', route: '/comm-api/api/lists/{id}', ids: ['id'],
    path: (a) => `/lists/${a.id}`, shape: listCards, title: 'One contact list',
    description: 'One list\'s card: description, kind, source, member and eligible counts, provenance. '
      + 'Does not return the contacts themselves. Read-only.',
    input: { id: uuid('The list id.') },
  },
  {
    tool: 'comms_compare_lists', method: 'commsCompareLists', http: 'GET', route: '/comm-api/api/lists/compare', ids: ['a', 'b'],
    path: (a) => `/lists/compare?a=${a.a}&b=${a.b}`, title: 'Compare two lists',
    description: 'How two lists overlap: contacts only in the first, only in the second, in both, with the '
      + 'counts of active members. Use it before choosing between two similar lists or before excluding one from a campaign. Two different '
      + 'lists are required (SAME_LIST otherwise). Read-only.',
    input: { a: uuid('The first list id.'), b: uuid('The second list id.') },
  },
  {
    tool: 'comms_get_list_relations', method: 'commsGetListRelations', http: 'GET', route: '/comm-api/api/lists/{id}/relations', ids: ['id'],
    path: (a) => `/lists/${a.id}/relations`, title: 'How a list was built',
    description: 'The lists this list was derived from, excludes or feeds: edges with a relation '
      + '(derived_from, excludes) and direction. A derived list is a snapshot taken at one moment, not live. Read-only.',
    input: { id: uuid('The list id.') },
  },
  {
    tool: 'comms_list_templates', method: 'commsListTemplates', http: 'GET', route: '/comm-api/api/templates', paged: true,
    path: () => '/templates', title: 'Email templates',
    description: 'The workspace\'s templates as cards: name, subject, kind, description, what it was derived '
      + 'from, and used_by_count (how many campaigns use it, which decides whether it can be deleted). No bodies; fetch one with '
      + 'comms_get_template. Paged (default 50, at most 200). Read-only.',
    input: { ...paging },
  },
  {
    tool: 'comms_get_template', method: 'commsGetTemplate', http: 'GET', route: '/comm-api/api/templates/{id}', ids: ['id'],
    path: (a) => `/templates/${a.id}`, title: 'One email template',
    description: 'One template in full: subject, HTML body, plain-text body, kind, description and the '
      + 'campaigns using it. Read-only.',
    input: { id: uuid('The template id.') },
  },
  {
    tool: 'comms_get_template_rules', method: 'commsGetTemplateRules', http: 'GET', route: '/comm-api/api/templates/rules',
    path: () => '/templates/rules', title: 'The template rulebook',
    description: 'The rulebook every template is held to, generated from the same constants the validator '
      + 'uses: size limits, removed merge tags, link rules and the closed vocabulary of lint findings and fix types. Read it before '
      + 'writing or repairing a template, and quote limits from it rather than from memory. Read-only.',
    input: {},
  },
  {
    tool: 'comms_lint_template', method: 'commsLintTemplate', http: 'POST', route: '/comm-api/api/templates/lint', draft: true,
    path: () => '/templates/lint', body: draftBody, title: 'Lint a template',
    description: 'Check a template against the rulebook. Give templateId for a '
      + 'saved template, or subject with bodyHtml/bodyText for an unsaved draft, never both (AMBIGUOUS_TEMPLATE) and never neither '
      + '(MISSING_TEMPLATE). Returns findings from a closed vocabulary, each with a severity and a hint. Name every finding to the person '
      + 'before offering a fix. The result carries the workspace `settings` it was checked against; some findings depend on them (a consent link is live only in a consent-request campaign, a link straight to the unsubscribe landing page unsubscribes no one, click consent needs a tracked link).',
    input: { ...draft },
  },
  {
    tool: 'comms_suggest_template_fixes', method: 'commsSuggestTemplateFixes', http: 'POST', route: '/comm-api/api/templates/fix', draft: true,
    path: () => '/templates/fix', body: (a) => ({ ...draftBody(a), ...(Array.isArray(a.types) ? { types: a.types } : {}) }), title: 'Suggest template fixes',
    description: 'The safe, deterministic fixes for a template, applied IN MEMORY: returns the new fields, what '
      + 'changed and the re-lint. Nothing is saved (applied is false); saving is a separate, later step. Same template-or-draft rule as '
      + 'comms_lint_template. Optional types narrows the fixes to some fix types from the rulebook. Show the person what would change.',
    input: { ...draft, types: z.array(z.string().max(60)).max(20).optional().describe('Only these fix types (names from the template rulebook). Omit for all safe fixes.') },
  },
  {
    tool: 'comms_check_links', method: 'commsCheckLinks', http: 'POST', route: '/comm-api/api/templates/check-links', draft: true,
    path: () => '/templates/check-links', body: draftBody, title: 'Check template links',
    description: 'Every link in a template with its tracking status and any problem. '
      + 'Same template-or-draft rule as comms_lint_template. Run it before scheduling: a link that cannot be tracked, or a merge tag inside '
      + 'a URL, is reported here. The `unsubscribe` section says where people end up after they unsubscribe (the workspace landing page or the shared page); the page itself is not opened from here, so tell the person to open it.',
    input: { ...draft },
  },
  {
    tool: 'comms_preview_template', method: 'commsPreviewTemplate', http: 'POST', route: '/comm-api/api/templates/preview', draft: true,
    path: () => '/templates/preview', body: (a) => ({ ...draftBody(a), ...(a.sample && typeof a.sample === 'object' ? { sample: a.sample } : {}) }), title: 'Preview a template',
    description: 'What a recipient will see: the rendered HTML, the effective text '
      + 'version, the link table and how the greeting reads. Same template-or-draft rule as comms_lint_template. The preview uses sample '
      + 'data you give (name, email, identity_name), never a real contact. Check the greeting with and without a name: an empty merge tag '
      + 'reads "Hello ,". The result carries the workspace `settings` (click consent, open tracking, unsubscribe page) so you can say what a real send would add: with open tracking on a hidden tracking image is added, and the consent and unsubscribe links here are examples.',
    input: {
      ...draft,
      sample: z.object({
        name: z.string().max(200).optional(), email: z.string().max(320).optional(), identity_name: z.string().max(200).optional(),
      }).optional().describe('Sample recipient to fill the merge tags with. Omit for the default sample.'),
    },
  },
  {
    tool: 'comms_list_starters', method: 'commsListStarters', http: 'GET', route: '/comm-api/api/templates/starters',
    path: () => '/templates/starters', title: 'Template starters',
    description: 'The ready-made template skeletons: key, name, what each is for and the brand-kit slots it '
      + 'fills. Pick one with the person, then build from it; do not invent a design from scratch when a starter fits. Read-only.',
    input: {},
  },
  {
    tool: 'comms_get_brand_kit', method: 'commsGetBrandKit', http: 'GET', route: '/comm-api/api/settings/brand-kit',
    path: () => '/settings/brand-kit', title: 'The workspace brand kit',
    description: 'The workspace\'s brand kit: sender name, colours, logo, footer and address fields used by '
      + 'the starters. If it is empty, ask the person once and keep the answer for the conversation. Never invent a logo URL or '
      + 'legal text. Read-only.',
    input: {},
  },
  {
    tool: 'comms_list_campaigns', method: 'commsListCampaigns', http: 'GET', route: '/comm-api/api/campaigns', paged: true,
    path: () => '/campaigns?compact=true', title: 'Campaigns',
    description: 'The workspace\'s campaigns, most recent first: name, status, template, scheduled time, '
      + 'sender and pacing. Status is a closed set; pacing.state says whether a send is running, waiting for a limit or finished. '
      + 'Paged (default 50, at most 200). Read-only.',
    input: { ...paging },
  },
  {
    tool: 'comms_get_campaign', method: 'commsGetCampaign', http: 'GET', route: '/comm-api/api/campaigns/{id}', ids: ['id'],
    path: (a) => `/campaigns/${a.id}`, title: 'One campaign',
    description: 'One campaign: status, template, schedule and timezone, sender, pacing and the reason for '
      + 'its status, plus the workspace `settings` in force (click consent, open tracking, unsubscribe page). Poll this once to show that a send started; do not poll in a loop. Read-only.',
    input: { id: uuid('The campaign id.') },
  },
];

/**
 * The Comms API keeps two legacy count fields on a list card for the dashboard: contact_count (always equal to member_count) and
 * suppressed_count (unsubscribed + bounced + other inactive, which is NOT the number of people on the suppression list: that is
 * suppressed_active_count). An agent reads both as separate facts, so the cards it gets carry each number once, under its precise name.
 */
export function listCards(body) {
  const clean = (card) => {
    if (!card || typeof card !== 'object') return card;
    const { contact_count: _c, suppressed_count: _s, ...rest } = card;
    return rest;
  };
  if (!body || typeof body !== 'object') return body;
  return { ...body, data: Array.isArray(body.data) ? body.data.map(clean) : clean(body.data) };
}

/** The registry entry for one table row. */
export function registryEntry(row) {
  return {
    name: row.tool,
    description: row.description,
    inputSchema: { ...(row.account ? {} : { workspaceId }), ...row.input },
    annotations: { title: row.title, ...READ_ONLY },
    handler: (client) => async (args) => client[row.method](args),
  };
}
