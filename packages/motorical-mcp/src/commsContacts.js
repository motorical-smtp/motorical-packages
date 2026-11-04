/**
 * The Communications contact tools (Comms MCP M3-3). Attached to the Comms client by commsClient.js.
 *
 * Order of checks: scope, then arguments (ids, caps, card, consent answer, reason, address), then the workspace, then the network. A dry
 * run makes reads and the API's own dry_run flag only. EVERY result and EVERY error goes through scrubDeep: an address is never shown.
 */

import { assertToolAllowed } from './resourceAuth.js';
import { deriveKey, keyProblem } from './commsKeys.js';
import { maskEmail, maskName, scrubText, scrubDeep, scrubError } from './commsMask.js';
import { SUPPRESSION_REASONS, DERIVE_OPERATIONS, MAX_IMPORT_ROWS, MAX_REMOVE_IDS } from './commsContactTools.js';

const OK_OUTCOMES = new Set(['created', 'added_existing', 'already_in_list']);
const NOT_MAILABLE = new Set(['unsubscribed', 'bounced', 'complained']);
const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
const text = (v) => typeof v === 'string' && v.trim().length > 0;

export function attachCommsContacts(client, { claims, server, call, resolveWorkspace, fail, UUID }) {
  const isDry = (a) => a.dryRun !== false;
  const need = (code, message, status = 400) => { throw fail(message, status, { code }); };
  const checkId = (value, label = 'id') => { if (!UUID.test(String(value ?? ''))) need('INVALID_ID', `${label} must be a valid id.`); };
  const ids = (list, label) => {
    if (!Array.isArray(list)) need('INVALID_ID', `${label} must be a list of ids.`);
    for (const v of list) checkId(v, label);
    return [...new Set(list)];
  };
  const normalizeEmail = (value) => {
    const e = String(value ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(e) || e.length > 320) need('INVALID_EMAIL', 'Give the full address the person typed, for example name@example.com.');
    return e;
  };
  /** Every tool: scope first, then the body; whatever it returns or throws is scrubbed. */
  const guarded = (tool, body) => async (a = {}) => {
    assertToolAllowed(server, tool, claims.scopes);
    try { return scrubDeep(await body(a)); } catch (e) { throw scrubError(e); }
  };

  const contactView = (r) => ({
    id: r.id, email: maskEmail(r.email), status: r.computed_status, suppression_reason: r.suppression_reason ?? null,
    consent_kind: r.consent_kind ?? null, list_count: Number(r.list_count ?? 0), engagement_level: r.engagement_level ?? null,
  });
  async function lookup(ws, address) {
    const out = await call(`/recipients?search=${encodeURIComponent(address)}&limit=10`, ws);
    const rows = (out.data && out.data.recipients) || [];
    const exact = rows.find((r) => String(r.email).toLowerCase() === address) || null;
    return { exact, others: rows.length - (exact ? 1 : 0) };
  }

  // ---- comms_list_list_contacts ----------------------------------------------
  client.commsListListContacts = guarded('comms_list_list_contacts', async (a) => {
    checkId(a.id);
    const ws = await resolveWorkspace(a.workspaceId);
    const page = Math.max(1, Number.isInteger(a.page) ? a.page : 1);
    const pageSize = Math.min(200, Math.max(1, Number.isInteger(a.pageSize) ? a.pageSize : 50));
    const q = text(a.q) ? `&q=${encodeURIComponent(a.q.trim().slice(0, 100))}` : '';
    const out = await call(`/lists/${a.id}/contacts?page=${page}&pageSize=${pageSize}${q}`, ws);
    const items = ((out.data && out.data.items) || []).map((c) => ({
      id: c.id, email: maskEmail(c.email), name: maskName(c.name), status: c.status, consent_kind: c.consent_kind ?? null,
      consent_source: c.consent_source ?? null, consent_given_at: c.consent_given_at ?? null, quality_index: c.quality_index ?? null,
    }));
    const total = Number(out.data && out.data.total !== undefined ? out.data.total : items.length);
    return { success: true, data: { items, total }, page: { page, pageSize, total, returned: items.length, truncated: page * pageSize < total } };
  });

  // ---- comms_find_contact ----------------------------------------------------
  client.commsFindContact = guarded('comms_find_contact', async (a) => {
    const address = normalizeEmail(a.email);
    const ws = await resolveWorkspace(a.workspaceId);
    const { exact, others } = await lookup(ws, address);
    return { success: true, found: Boolean(exact), contact: exact ? contactView(exact) : null, other_matches: others };
  });

  // ---- comms_import_contacts -------------------------------------------------
  client.commsImportContacts = guarded('comms_import_contacts', async (a) => {
    checkId(a.listId, 'listId');
    if (!Array.isArray(a.contacts) || a.contacts.length === 0) need('CONTACTS_REQUIRED', 'Give at least one contact row.');
    if (a.contacts.length > MAX_IMPORT_ROWS) need('TOO_MANY_CONTACTS', `This list has more than ${MAX_IMPORT_ROWS} rows, which is more than this tool takes. Do not send it in pieces and do not ask for it to be pasted into chat. Tell the person why: a large file is better kept between them and Motorical than passed through a chat. Then tell them how: in the Motorical dashboard open Comm, Lists, expand the "Import Contacts (CSV)" card (desktop only), choose the Target List, tick the consent box, and pick the file there (it is not available on a phone). The dashboard import has the same safeguards (people who unsubscribed or bounced are never added back).`);
    if (!text(a.sourceLabel)) need('MISSING_SOURCE_LABEL', 'Say where these contacts came from (sourceLabel), in a few words.');
    const onExisting = a.onExisting === undefined ? 'keep' : a.onExisting;
    if (!['keep', 'update'].includes(onExisting)) need('INVALID_ON_EXISTING', 'onExisting must be keep or update.');
    if (!isDry(a) && typeof a.consentConfirmed !== 'boolean') {
      need('MISSING_CONSENT_ANSWER', 'Ask the person first: "Do these people know they will get your marketing email: did they sign up, or are they customers who agreed?" Then pass their answer as consentConfirmed (true or false). Do not guess it.');
    }
    const ws = await resolveWorkspace(a.workspaceId);
    const rows = a.contacts.map((c) => defined({ email: c.email, name: c.name, phone: c.phone, identity_type: c.identityType, identity_name: c.identityName }));
    const out = await call(`/lists/${a.listId}/contacts/bulk`, ws, {
      method: 'POST',
      body: { contacts: rows, on_existing: onExisting, source_label: a.sourceLabel.trim(), consent_given: a.consentConfirmed === true, dry_run: isDry(a) },
    });
    const data = out.data || {};
    const view = (r) => defined({ row: r.row, outcome: r.outcome, reason: r.reason ? scrubText(r.reason) : undefined, email: maskEmail(r.email), contact_id: r.contact_id, changes: r.changes });
    const all = Array.isArray(data.rows) ? data.rows : [];
    const problems = all.filter((r) => !OK_OUTCOMES.has(r.outcome));
    return {
      success: true, dryRun: isDry(a), applied: !isDry(a), list: data.list, summary: data.summary, onExisting,
      consentConfirmed: typeof a.consentConfirmed === 'boolean' ? a.consentConfirmed : null,
      problems: problems.slice(0, 100).map(view), problems_truncated: problems.length > 100, sample: all.slice(0, 5).map(view),
    };
  });

  // ---- comms_remove_from_list ------------------------------------------------
  client.commsRemoveFromList = guarded('comms_remove_from_list', async (a) => {
    checkId(a.listId, 'listId');
    if (!Array.isArray(a.contactIds) || a.contactIds.length === 0) need('IDS_REQUIRED', 'Give the ids of the contacts to take off the list (from comms_list_list_contacts).');
    if (a.contactIds.length > MAX_REMOVE_IDS) need('TOO_MANY_IDS', `At most ${MAX_REMOVE_IDS} ids per call.`);
    const contactIds = ids(a.contactIds, 'contactIds');
    const ws = await resolveWorkspace(a.workspaceId);
    const card = ((await call(`/lists/${a.listId}`, ws)).data) || {};
    const list = { id: a.listId, name: card.name ?? null };
    const note = 'Only the list membership changes: the contacts themselves are not deleted and stay on any other list.';
    if (isDry(a)) return { success: true, dryRun: true, applied: false, list, requested: contactIds.length, note };
    const out = await call(`/lists/${a.listId}/contacts/bulk-remove`, ws, { method: 'POST', body: { contactIds } });
    return { success: true, dryRun: false, applied: true, list, requested: contactIds.length, removed: out.data ? out.data.removed : 0, note };
  });

  // ---- comms_derive_list -----------------------------------------------------
  client.commsDeriveList = guarded('comms_derive_list', async (a) => {
    if (!text(a.description)) need('MISSING_CARD', 'A description is required: say what this list is for in one to three sentences.');
    if (!text(a.name)) need('NAME_REQUIRED', 'A name is required.');
    if (!DERIVE_OPERATIONS.includes(a.operation)) need('INVALID_OPERATION', `operation must be one of: ${DERIVE_OPERATIONS.join(', ')}.`);
    if (!Array.isArray(a.sourceListIds) || a.sourceListIds.length === 0) need('SOURCES_REQUIRED', 'Give at least one source list.');
    if (a.sourceListIds.length > 10) need('TOO_MANY_SOURCES', 'At most 10 source lists.');
    const sources = ids(a.sourceListIds, 'sourceListIds');
    const excludes = a.excludeListIds === undefined ? undefined : ids(a.excludeListIds, 'excludeListIds');
    const bad = keyProblem(a); if (bad) need('INVALID_IDEMPOTENCY_KEY', bad);
    const ws = await resolveWorkspace(a.workspaceId);
    const body = defined({ name: a.name, description: a.description, operation: a.operation, source_list_ids: sources, exclude_list_ids: excludes, source_label: a.sourceLabel });
    if (isDry(a)) {
      const out = await call('/lists/derive', ws, { method: 'POST', body: { ...body, dry_run: true } });
      return { success: true, dryRun: true, applied: false, result: out.data && out.data.result, note: 'Nothing was created. A derived list is a one-time snapshot, not live.' };
    }
    const out = await call('/lists/derive', ws, { method: 'POST', body, headers: { 'Idempotency-Key': deriveKey(claims, 'comms_derive_list', ws, a) } });
    return { success: true, dryRun: false, applied: true, list: out.data && out.data.list, result: out.data && out.data.result, warnings: out.warnings || [], note: 'This list is a snapshot taken now: later changes to its source lists do not flow into it.' };
  });

  // ---- comms_unsubscribe_contact ---------------------------------------------
  client.commsUnsubscribeContact = guarded('comms_unsubscribe_contact', async (a) => {
    const address = normalizeEmail(a.email);
    const ws = await resolveWorkspace(a.workspaceId);
    const { exact } = await lookup(ws, address);
    if (!exact) need('CONTACT_NOT_FOUND', `Nobody in this workspace has the address ${maskEmail(address)}. Check the spelling with the person.`, 404);
    const contact = contactView(exact);
    if (NOT_MAILABLE.has(exact.computed_status)) {
      return { success: true, dryRun: isDry(a), applied: false, noChange: true, contact, note: `They are already ${exact.computed_status}: they will not receive campaigns.` };
    }
    if (isDry(a)) {
      return { success: true, dryRun: true, applied: false, contact, effect: 'They would stop receiving ALL marketing email from this workspace. You cannot undo this from here: only the person, or the account owner in the dashboard, can opt them back in. Tell the person who you found and get a clear yes first.' };
    }
    const out = await call(`/contacts/${exact.id}/unsubscribe`, ws, { method: 'POST' });
    return { success: true, dryRun: false, applied: true, contact, message: out.message || 'Contact unsubscribed' };
  });

  // ---- comms_add_suppression -------------------------------------------------
  client.commsAddSuppression = guarded('comms_add_suppression', async (a) => {
    const address = normalizeEmail(a.email);
    if (!SUPPRESSION_REASONS.includes(a.reason)) need('INVALID_REASON', `reason must be one of: ${SUPPRESSION_REASONS.join(', ')} (bounces are recorded automatically).`);
    const ws = await resolveWorkspace(a.workspaceId);
    const note = 'The suppression is ACCOUNT-WIDE: it applies to every workspace of this account. It cannot be removed from here; only the account owner can, in the dashboard.';
    if (isDry(a)) {
      const { exact } = await lookup(ws, address);
      return { success: true, dryRun: true, applied: false, would_add: { email: maskEmail(address), reason: a.reason }, contact: exact ? contactView(exact) : null, note };
    }
    const out = await call('/suppressions', ws, { method: 'POST', body: { email: address, reason: a.reason, source: 'mcp' } });
    return { success: true, dryRun: false, applied: true, email: maskEmail(address), reason: a.reason, contacts_updated: out.data ? out.data.contacts_updated : 0, note };
  });
}
