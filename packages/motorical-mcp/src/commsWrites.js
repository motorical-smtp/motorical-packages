/**
 * The Communications write tools (Comms MCP M3-2). Attached to the Comms client by commsClient.js.
 *
 * Order of checks for every tool, so nothing reaches the network that should not: scope, then arguments (ids, card, nothing-to-update,
 * idempotency key, expectedUpdatedAt), then the workspace, then the network. A dry run (the default) makes reads, the API's read-only
 * POSTs (validate, lint, fix, render) and the list routes' own `dry_run` flag, and never anything that writes.
 */

import { assertToolAllowed } from './resourceAuth.js';
import { deriveKey, keyProblem } from './commsKeys.js';
import { COMMS_WRITE_TOOLS, LIST_KINDS } from './commsWriteTools.js';

const STARTER_RE = /^[a-z0-9_-]{1,60}$/;
const SCHEDULED = new Set(['scheduled', 'sending']);

const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

export function attachCommsWrites(client, { claims, server, call, resolveWorkspace, fail, UUID }) {
  const isDry = (a) => a.dryRun !== false;
  const need = (code, message) => { throw fail(message, 400, { code }); };
  const checkId = (value, label = 'id') => { if (!UUID.test(String(value ?? ''))) need('INVALID_ID', `${label} must be a valid id.`); };

  const keyFor = (tool, workspace, a) => { const bad = keyProblem(a); if (bad) need('INVALID_IDEMPOTENCY_KEY', bad); return deriveKey(claims, tool, workspace, a); };
  // The key is validated up front (before any network call) even when it is only used by a real write.
  const keyOk = (a) => { const bad = keyProblem(a); if (bad) need('INVALID_IDEMPOTENCY_KEY', bad); };

  const text = (v) => typeof v === 'string' && v.trim().length > 0;
  function requireCard(a, { kind = true } = {}) {
    const missing = [];
    if (!text(a.description)) missing.push('description');
    if (kind && !text(a.kind)) missing.push('kind');
    if (missing.length) need('MISSING_CARD', `A ${missing.join(' and ')} is required: say what this is for in one to three sentences${kind ? ' and choose its kind' : ''}.`);
  }
  function requireListKind(kind) {
    if (!LIST_KINDS.includes(kind)) need('INVALID_KIND', `kind must be one of: ${LIST_KINDS.join(', ')} (derived and system_view are made by the system).`);
  }
  function requireLock(a) {
    if (!text(a.expectedUpdatedAt)) need('MISSING_EXPECTED_UPDATED_AT', 'A real write needs expectedUpdatedAt: the template\'s updated_at as you last read it (a dry run returns it). This stops you overwriting someone else\'s edit.');
  }

  async function validateDraft(ws, draft) {
    try {
      const out = await call('/templates/validate', ws, { method: 'POST', body: defined(draft) });
      return out.data;
    } catch (e) {
      if (e.status === 422 && e.data && e.data.detail) return e.data.detail;
      throw e;
    }
  }
  const lintDraft = async (ws, draft) => (await call('/templates/lint', ws, { method: 'POST', body: defined(draft) })).data;

  function scheduledWarnings(current) {
    const hit = (Array.isArray(current.used_by) ? current.used_by : []).filter((c) => SCHEDULED.has(c.status) && !c.in_recycle_bin);
    if (hit.length === 0) return [];
    return [{
      type: 'template_used_by_scheduled_campaign',
      campaigns: hit.map(({ id, name, status }) => ({ id, name, status })),
      message: `${hit.length === 1 ? 'A campaign is' : `${hit.length} campaigns are`} already scheduled or sending with this template (${hit.map((c) => c.name).join(', ')}): the content was compiled when it was scheduled, so this edit will not change what ${hit.length === 1 ? 'it sends' : 'they send'}. To send the new version, duplicate the campaign and schedule the copy.`,
    }];
  }

  const FIELD = { name: 'name', subject: 'subject', bodyHtml: 'body_html', bodyText: 'body_text', description: 'description', kind: 'kind' };
  const templateChanges = (a) => Object.fromEntries(Object.entries(FIELD).filter(([k]) => a[k] !== undefined).map(([k, f]) => [f, a[k]]));
  const getTemplate = async (ws, id) => (await call(`/templates/${id}`, ws)).data;

  // ---- comms_create_template -------------------------------------------------
  client.commsCreateTemplate = async (a = {}) => {
    assertToolAllowed(server, 'comms_create_template', claims.scopes);
    requireCard(a); keyOk(a);
    const ws = await resolveWorkspace(a.workspaceId);
    const draft = { name: a.name, subject: a.subject, type: a.type, body_html: a.bodyHtml, body_text: a.bodyText };
    if (isDry(a)) {
      const validation = await validateDraft(ws, draft);
      const lint = validation && validation.valid ? await lintDraft(ws, draft) : null;
      return { success: true, dryRun: true, applied: false, would_create: { name: a.name, subject: a.subject, type: a.type, description: a.description, kind: a.kind, derived_from: a.derivedFrom ?? null }, validation, lint };
    }
    const body = defined({ ...draft, description: a.description, kind: a.kind, derived_from: a.derivedFrom });
    const out = await call('/templates', ws, { method: 'POST', body, headers: { 'Idempotency-Key': keyFor('comms_create_template', ws, a) } });
    return { success: true, dryRun: false, applied: true, data: out.data, validation: out.validation };
  };

  // ---- comms_create_template_from_starter ------------------------------------
  client.commsCreateTemplateFromStarter = async (a = {}) => {
    assertToolAllowed(server, 'comms_create_template_from_starter', claims.scopes);
    if (!STARTER_RE.test(String(a.starter ?? ''))) need('INVALID_ID', 'starter must be a starter key from comms_list_starters.');
    requireCard(a, { kind: false }); keyOk(a);
    const ws = await resolveWorkspace(a.workspaceId);
    if (isDry(a)) {
      const out = await call(`/templates/starters/${a.starter}/render`, ws, { method: 'POST', body: defined({ brand: a.brand, slots: a.slots }) });
      return { success: true, dryRun: true, applied: false, would_create: { name: a.name, description: a.description, kind: a.kind ?? null, starter: a.starter }, render: out.data };
    }
    const body = defined({ starter: a.starter, name: a.name, description: a.description, kind: a.kind, subject: a.subject, slots: a.slots, brand: a.brand });
    const out = await call('/templates/from-starter', ws, { method: 'POST', body, headers: { 'Idempotency-Key': keyFor('comms_create_template_from_starter', ws, a) } });
    return { success: true, dryRun: false, applied: true, data: out.data };
  };

  // ---- comms_update_template -------------------------------------------------
  client.commsUpdateTemplate = async (a = {}) => {
    assertToolAllowed(server, 'comms_update_template', claims.scopes);
    checkId(a.id);
    const wanted = templateChanges(a);
    if (Object.keys(wanted).length === 0) need('NOTHING_TO_UPDATE', 'Give at least one of name, subject, bodyHtml, bodyText, description or kind.');
    if (!isDry(a)) requireLock(a);
    const ws = await resolveWorkspace(a.workspaceId);
    const current = await getTemplate(ws, a.id);
    const warnings = scheduledWarnings(current);
    const diff = {}; const patch = {}; const previous = {};
    for (const [f, v] of Object.entries(wanted)) {
      if (current[f] === v) continue;
      diff[f] = { from: current[f] ?? null, to: v }; patch[f] = v; previous[f] = current[f] ?? null;
    }
    if (Object.keys(patch).length === 0) return { success: true, dryRun: isDry(a), applied: false, noChange: true, warnings };
    if (isDry(a)) {
      const merged = { name: current.name, subject: current.subject, type: current.type, body_html: current.body_html, body_text: current.body_text, ...patch };
      const validation = await validateDraft(ws, merged);
      const lint = validation && validation.valid ? await lintDraft(ws, merged) : null;
      return { success: true, dryRun: true, applied: false, changes: diff, expectedUpdatedAt: current.updated_at, validation, lint, warnings };
    }
    const out = await call(`/templates/${a.id}`, ws, { method: 'PATCH', body: { ...patch, expected_updated_at: a.expectedUpdatedAt } });
    return { success: true, dryRun: false, applied: true, previous, data: out.data, validation: out.validation, warnings };
  };

  // ---- comms_apply_template_fixes --------------------------------------------
  client.commsApplyTemplateFixes = async (a = {}) => {
    assertToolAllowed(server, 'comms_apply_template_fixes', claims.scopes);
    checkId(a.id);
    if (!isDry(a)) requireLock(a);
    const ws = await resolveWorkspace(a.workspaceId);
    const current = await getTemplate(ws, a.id);
    const warnings = scheduledWarnings(current);
    const fixed = (await call('/templates/fix', ws, { method: 'POST', body: defined({ template_id: a.id, types: Array.isArray(a.types) ? a.types : undefined }) })).data;
    if (!Array.isArray(fixed.changes) || fixed.changes.length === 0) return { success: true, dryRun: isDry(a), applied: false, noChange: true, warnings };
    if (isDry(a)) return { success: true, dryRun: true, applied: false, fix: fixed, expectedUpdatedAt: current.updated_at, warnings };
    const patch = {}; const previous = {};
    for (const f of ['subject', 'body_html', 'body_text']) {
      if (fixed.result && fixed.result[f] !== undefined && fixed.result[f] !== current[f]) { patch[f] = fixed.result[f]; previous[f] = current[f] ?? null; }
    }
    if (Object.keys(patch).length === 0) return { success: true, dryRun: false, applied: false, noChange: true, warnings };
    const out = await call(`/templates/${a.id}`, ws, { method: 'PATCH', body: { ...patch, expected_updated_at: a.expectedUpdatedAt } });
    return { success: true, dryRun: false, applied: true, previous, data: out.data, warnings };
  };

  // ---- comms_duplicate_template ----------------------------------------------
  client.commsDuplicateTemplate = async (a = {}) => {
    assertToolAllowed(server, 'comms_duplicate_template', claims.scopes);
    checkId(a.id); keyOk(a);
    const ws = await resolveWorkspace(a.workspaceId);
    if (isDry(a)) {
      const current = await getTemplate(ws, a.id);
      return { success: true, dryRun: true, applied: false, would_create: { name: `${String(current.name).slice(0, 193)} (copy)`, derived_from: a.id } };
    }
    const out = await call(`/templates/${a.id}/duplicate`, ws, { method: 'POST', body: {}, headers: { 'Idempotency-Key': keyFor('comms_duplicate_template', ws, a) } });
    return { success: true, dryRun: false, applied: true, data: out.data };
  };

  // ---- comms_set_brand_kit ---------------------------------------------------
  client.commsSetBrandKit = async (a = {}) => {
    assertToolAllowed(server, 'comms_set_brand_kit', claims.scopes);
    const patch = a.brandKit && typeof a.brandKit === 'object' && !Array.isArray(a.brandKit) ? a.brandKit : {};
    if (Object.keys(patch).length === 0) need('NOTHING_TO_UPDATE', 'Give at least one brand kit field to change.');
    const ws = await resolveWorkspace(a.workspaceId);
    const current = (await call('/settings/brand-kit', ws)).data;
    const kit = (current && current.brand_kit) || {};
    if (isDry(a)) {
      return { success: true, dryRun: true, applied: false, current: kit, patch, note: 'The patch is merged field by field: only the fields given change, null clears one, colours merge one by one. Nothing was saved.' };
    }
    const previous = Object.fromEntries(Object.keys(patch).filter((k) => k in kit).map((k) => [k, kit[k]]));
    const out = await call('/settings/brand-kit', ws, { method: 'PATCH', body: patch });
    return { success: true, dryRun: false, applied: true, previous, data: out.data };
  };

  // ---- comms_create_list -----------------------------------------------------
  client.commsCreateList = async (a = {}) => {
    assertToolAllowed(server, 'comms_create_list', claims.scopes);
    requireCard(a); requireListKind(a.kind); keyOk(a);
    const ws = await resolveWorkspace(a.workspaceId);
    const body = defined({ name: a.name, description: a.description, kind: a.kind, source_label: a.sourceLabel, strict: true });
    if (isDry(a)) {
      const out = await call('/lists', ws, { method: 'POST', body: { ...body, dry_run: true } });
      return { success: true, dryRun: true, applied: false, data: out.data, warnings: out.warnings || [] };
    }
    const out = await call('/lists', ws, { method: 'POST', body, headers: { 'Idempotency-Key': keyFor('comms_create_list', ws, a) } });
    return { success: true, dryRun: false, applied: true, data: out.data, warnings: out.warnings || [] };
  };

  // ---- comms_update_list -----------------------------------------------------
  client.commsUpdateList = async (a = {}) => {
    assertToolAllowed(server, 'comms_update_list', claims.scopes);
    checkId(a.id);
    const wanted = defined({ name: a.name, description: a.description, kind: a.kind, source_label: a.sourceLabel });
    if (Object.keys(wanted).length === 0) need('NOTHING_TO_UPDATE', 'Give at least one of name, description, kind or sourceLabel.');
    if (wanted.kind !== undefined) requireListKind(wanted.kind);
    const ws = await resolveWorkspace(a.workspaceId);
    if (isDry(a)) {
      const out = await call(`/lists/${a.id}`, ws, { method: 'PATCH', body: { ...wanted, strict: true, dry_run: true } });
      return { success: true, dryRun: true, applied: false, data: out.data, previous: out.previous || {}, warnings: out.warnings || [] };
    }
    const card = (await call(`/lists/${a.id}`, ws)).data || {};
    const previous = Object.fromEntries(Object.keys(wanted).map((k) => [k, card[k] ?? null]));
    const out = await call(`/lists/${a.id}`, ws, { method: 'PATCH', body: { ...wanted, strict: true } });
    return { success: true, dryRun: false, applied: true, previous, data: out.data, warnings: out.warnings || [] };
  };

  return COMMS_WRITE_TOOLS;
}
