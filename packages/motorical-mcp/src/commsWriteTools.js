/**
 * The Communications write family (Comms MCP M3-2): content (templates, brand kit) and the list card, declared once like the read
 * family (commsReadTools.js). Logic lives in commsWrites.js; this file is the registry entry, the route wiring and the vocabularies.
 *
 * Rules built in (plan: motorical-docs plans/2026-10-27-comms-mcp-m3-2-content-writes.md):
 * - every write defaults to a DRY RUN; a real write needs an explicit dryRun:false;
 * - nothing here deletes, sends, schedules, imports or touches contacts;
 * - creates carry an Idempotency-Key; updates carry the previous values (undo) and, for templates, an optimistic lock;
 * - a template or list is created with its card (description + kind), as the runbook says.
 */

import { z } from 'zod';

export const TEMPLATE_KINDS = ['newsletter', 'promotion', 'announcement', 'welcome', 'reengagement', 'event', 'notice', 'test', 'other'];
/** The list kinds a person or agent may set by hand. `derived` and `system_view` are made by the system. */
export const LIST_KINDS = ['subscribers', 'customers', 'leads', 'event', 'test', 'reengagement', 'other'];
export const BRAND_FONTS = ['system_sans', 'arial_sans', 'verdana_sans', 'trebuchet_sans', 'georgia_serif', 'courier_mono'];

export const workspaceId = z.string().uuid().optional()
  .describe('The Communications workspace. Optional when the authorization covers exactly one; otherwise required (the error lists the choices, the account default first).');
export const dryRun = z.boolean().optional()
  .describe('Default true: validate and show exactly what would happen, and change nothing. Pass false to actually write.');
export const idempotencyKey = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/).optional()
  .describe('Optional. Letters, digits and . _ : - (8 to 128). Omit it: a retry of the same call is made safe automatically. Pass a different one only to deliberately make a second copy.');
const uuid = (what) => z.string().uuid().describe(what);
const expectedUpdatedAt = z.string().max(40).optional()
  .describe('The template\'s updated_at as you last read it (a dry run returns it as expectedUpdatedAt). Required for a real write; if the template changed since, nothing is written and STALE_TEMPLATE says what is there now.');

const card = {
  description: z.string().min(1).max(1000).describe('What this is for, in one to three sentences. Required.'),
};
const brandKit = z.object({
  sender_name: z.string().max(100).nullable().optional(),
  postal_address: z.string().max(300).nullable().optional(),
  logo_url: z.string().max(500).nullable().optional().describe('An https address, or null to clear. Never invent one.'),
  colors: z.object({
    text: z.string().nullable().optional(), background: z.string().nullable().optional(), card: z.string().nullable().optional(), primary: z.string().nullable().optional(),
  }).strict().optional().describe('#rrggbb values; null resets one colour to the default.'),
  font: z.enum(BRAND_FONTS).optional(),
  button_radius: z.number().int().min(0).max(24).optional(),
  footer_text: z.string().max(500).nullable().optional(),
  reply_to: z.string().max(320).nullable().optional(),
  tone_notes: z.string().max(500).nullable().optional(),
  language: z.string().max(20).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
}).strict().describe('The fields to change; anything not given is left alone, null clears a field, colours merge one by one.');

const WRITE = (extra = {}) => ({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, ...extra });

export const COMMS_WRITE_TOOLS = [
  {
    tool: 'comms_create_template', method: 'commsCreateTemplate', http: 'POST', route: '/comm-api/api/templates', create: true,
    title: 'Create an email template', annotations: WRITE(),
    description: 'Create a template (POST /comm-api/api/templates). DRY RUN by default: checks the template against the rulebook and lints it, and returns what '
      + 'would be created; pass dryRun:false to save it. A description (what it is for) and a kind are required. Kinds: ' + TEMPLATE_KINDS.join(', ') + '. '
      + 'Read comms_get_template_rules first and fix every finding before saving. The type (html or text) cannot be changed later. A retry of the same call '
      + 'never creates a second template. Never invent a logo URL, legal text or an address.',
    input: {
      name: z.string().min(1).max(200), subject: z.string().min(1).max(998), type: z.enum(['html', 'text']),
      bodyHtml: z.string().max(300000).optional(), bodyText: z.string().max(300000).optional(),
      ...card, kind: z.enum(TEMPLATE_KINDS).describe('Required.'),
      derivedFrom: z.string().uuid().optional().describe('The template this one is a variation of, if any.'),
    },
  },
  {
    tool: 'comms_create_template_from_starter', method: 'commsCreateTemplateFromStarter', http: 'POST', route: '/comm-api/api/templates/from-starter', create: true,
    title: 'Create a template from a starter', annotations: WRITE(),
    description: 'Create a template from a ready-made starter, filled with the workspace brand kit (POST /comm-api/api/templates/from-starter). DRY RUN by '
      + 'default: renders the starter and returns it; pass dryRun:false to save it. Get the starter keys from comms_list_starters and check the brand kit '
      + 'with comms_get_brand_kit first. A description is required; kind defaults to the starter\'s. THE FOOTER: the footer says why the person gets the email, and only the customer knows that. ASK them why these people receive it (for example "You signed up at our shop") and pass it as the `reason` slot, or save it once as footer_text in the brand kit. With neither, the footer only says who sent the email, and the result carries a footer_reason_default warning: tell the customer and ask, do not invent a reason. The starter\'s own words are English; write slot text in the brand kit language.',
    input: {
      starter: z.string().min(1).max(60).describe('A starter key from comms_list_starters.'), name: z.string().min(1).max(200),
      ...card, kind: z.enum(TEMPLATE_KINDS).optional(), subject: z.string().max(998).optional(),
      slots: z.record(z.string(), z.any()).optional().describe('Values for the starter\'s slots (see comms_list_starters).'),
      brand: brandKit.optional().describe('A brand kit for this one template only; the stored kit is not changed.'),
    },
  },
  {
    tool: 'comms_update_template', method: 'commsUpdateTemplate', http: 'PATCH', route: '/comm-api/api/templates/{id}', idempotent: true,
    title: 'Edit an email template', annotations: WRITE({ idempotentHint: true }),
    description: 'Change a template\'s name, subject, bodies, description or kind (PATCH /comm-api/api/templates/{id}). DRY RUN by default: shows exactly what '
      + 'would change (from/to), validates and lints the result, and returns expectedUpdatedAt. A real write (dryRun:false) must pass that expectedUpdatedAt; '
      + 'if the template changed meanwhile, nothing is written (STALE_TEMPLATE). The previous values are returned so the edit can be undone with another call. '
      + 'A campaign that is already scheduled or sending was compiled when it was scheduled and will NOT pick up the edit: the result says so in warnings. '
      + 'The type cannot be changed.',
    input: {
      id: uuid('The template id.'), name: z.string().min(1).max(200).optional(), subject: z.string().min(1).max(998).optional(),
      bodyHtml: z.string().max(300000).optional(), bodyText: z.string().max(300000).optional(),
      description: z.string().min(1).max(1000).optional(), kind: z.enum(TEMPLATE_KINDS).optional(), expectedUpdatedAt,
    },
  },
  {
    tool: 'comms_apply_template_fixes', method: 'commsApplyTemplateFixes', http: 'POST', route: '/comm-api/api/templates/fix', idempotent: true,
    title: 'Apply the safe template fixes', annotations: WRITE({ idempotentHint: true }),
    description: 'Apply the rulebook\'s safe, deterministic fixes to a saved template (POST /comm-api/api/templates/fix, then PATCH). DRY RUN by default: returns '
      + 'what would change and the re-lint (the same as comms_suggest_template_fixes); pass dryRun:false with expectedUpdatedAt to save. The previous text is '
      + 'returned. If nothing needs fixing nothing is written. Show the person the changes before saving.',
    input: {
      id: uuid('The template id.'), types: z.array(z.string().max(60)).max(20).optional().describe('Only these fix types (names from the template rulebook).'), expectedUpdatedAt,
    },
  },
  {
    tool: 'comms_duplicate_template', method: 'commsDuplicateTemplate', http: 'POST', route: '/comm-api/api/templates/{id}/duplicate', create: true,
    title: 'Duplicate an email template', annotations: WRITE(),
    description: 'Make a copy of a template named "<name> (copy)" that remembers its parent (POST /comm-api/api/templates/{id}/duplicate). DRY RUN by default. '
      + 'The safest way to change a template that campaigns use: edit the copy. A retry never makes a second copy; to deliberately make another, pass a different '
      + 'idempotencyKey.',
    input: { id: uuid('The template to copy.') },
  },
  {
    tool: 'comms_set_brand_kit', method: 'commsSetBrandKit', http: 'PATCH', route: '/comm-api/api/settings/brand-kit', idempotent: true,
    title: 'Change the workspace brand kit', annotations: WRITE({ idempotentHint: true }),
    description: 'Change the workspace brand kit used by the starters (PATCH /comm-api/api/settings/brand-kit): sender name, postal address, logo (https), '
      + 'colours, font, button radius, footer, reply-to, tone, language, description. Partial: only the fields given change, null clears one. DRY RUN by default: '
      + 'returns the current kit and your patch. A real write returns the previous values of the fields it changed. Never invent a logo URL, an address or legal text: '
      + 'ask the person.',
    input: { brandKit },
  },
  {
    tool: 'comms_create_list', method: 'commsCreateList', http: 'POST', route: '/comm-api/api/lists', create: true,
    title: 'Create a contact list (card only)', annotations: WRITE(),
    description: 'Create an empty list with its card (POST /comm-api/api/lists): name, a description of what the list is for, who is in it and where the contacts '
      + 'came from (no counts), a kind and an optional source label. DRY RUN by default: the API checks the card and returns it, nothing is stored; pass dryRun:false '
      + 'to create it. A weak description is refused (LIST_CARD_INVALID) with the findings. Kinds: ' + LIST_KINDS.join(', ') + ' (derived and system_view are made '
      + 'by the system). This adds no contacts.',
    input: {
      name: z.string().min(1).max(200), ...card, kind: z.enum(LIST_KINDS).describe('Required.'),
      sourceLabel: z.string().max(200).optional().describe('Where the contacts came from, in a few words (for example "Shopify export 2026-10-20").'),
    },
  },
  {
    tool: 'comms_update_list', method: 'commsUpdateList', http: 'PATCH', route: '/comm-api/api/lists/{id}', idempotent: true,
    title: 'Edit a list card', annotations: WRITE({ idempotentHint: true }),
    description: 'Change a list\'s card: name, description, kind or source label (PATCH /comm-api/api/lists/{id}). It does not change who is on the list. DRY RUN by '
      + 'default: returns the card as it would be and the previous values; pass dryRun:false to save. A weak description is refused (LIST_CARD_INVALID). The previous '
      + 'values are returned so the change can be undone.',
    input: {
      id: uuid('The list id.'), name: z.string().min(1).max(200).optional(), description: z.string().min(1).max(1000).optional(),
      kind: z.enum(LIST_KINDS).optional(), sourceLabel: z.string().max(200).optional(),
    },
  },
];

/** The registry entry for one table row. */
export function writeRegistryEntry(row) {
  return {
    name: row.tool,
    description: row.description,
    inputSchema: { workspaceId, dryRun, ...row.input, ...(row.create ? { idempotencyKey } : {}) },
    annotations: { title: row.title, ...row.annotations },
    handler: (client) => async (args) => client[row.method](args),
  };
}
