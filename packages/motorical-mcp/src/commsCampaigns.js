/**
 * The Communications campaign-draft tools (Comms MCP M3-4). Attached to the Comms client by commsClient.js.
 *
 * Order of checks: scope, then arguments (ids, card, caps, nothing-to-update, idempotency key), then the workspace, then the network. A dry run
 * makes reads and the API's own dry_run flag only. These tools never send a schedule, a timezone, pacing or a status, and never call
 * /schedule, /cancel or /restore; the one DELETE is the recycle-bin delete of a campaign that is not scheduled or sending. Whatever a tool returns or throws is scrubbed: the account owner's address is shown masked.
 */

import { assertToolAllowed } from './resourceAuth.js';
import { deriveKey, keyProblem } from './commsKeys.js';
import { maskEmail, scrubDeep, scrubError } from './commsMask.js';

const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
const text = (v) => typeof v === 'string' && v.trim().length > 0;

export function attachCommsCampaigns(client, { claims, server, call, resolveWorkspace, fail, UUID }) {
  const isDry = (a) => a.dryRun !== false;
  const need = (code, message) => { throw fail(message, 400, { code }); };
  const checkId = (value, label = 'id') => { if (!UUID.test(String(value ?? ''))) need('INVALID_ID', `${label} must be a valid id.`); };
  const idList = (list, label, { min = 0, max = 50 } = {}) => {
    if (!Array.isArray(list)) need('INVALID_ID', `${label} must be a list of ids.`);
    if (min > 0 && list.length < min) need('LISTS_REQUIRED', `Give at least ${min} list id in ${label}.`);
    if (list.length > max) need('TOO_MANY_LISTS', `At most ${max} ids in ${label}.`);
    for (const v of list) checkId(v, label);
    return [...new Set(list)];
  };
  // Errors are ALWAYS scrubbed (they can quote the owner's address). Outputs are scrubbed where recipient data can appear (preflight, the real
  // test send); the campaign's own From address is the customer's sending identity, not recipient data, and the agent needs to state it.
  const guarded = (tool, body) => async (a = {}) => {
    assertToolAllowed(server, tool, claims.scopes);
    try { return await body(a); } catch (e) { throw scrubError(e); }
  };
  const keyFor = (tool, ws, a) => { const bad = keyProblem(a); if (bad) need('INVALID_IDEMPOTENCY_KEY', bad); return deriveKey(claims, tool, ws, a); };

  // ---- comms_create_campaign -------------------------------------------------
  client.commsCreateCampaign = guarded('comms_create_campaign', async (a) => {
    if (!text(a.description)) need('MISSING_CARD', 'A description is required: say what this campaign is for in one to three sentences.');
    if (!text(a.name)) need('NAME_REQUIRED', 'A name is required.');
    checkId(a.templateId, 'templateId'); checkId(a.motorBlockId, 'motorBlockId');
    const listIds = idList(a.listIds, 'listIds', { min: 1 });
    const excludeListIds = a.excludeListIds === undefined ? undefined : idList(a.excludeListIds, 'excludeListIds');
    const bad = keyProblem(a); if (bad) need('INVALID_IDEMPOTENCY_KEY', bad);
    const ws = await resolveWorkspace(a.workspaceId);
    const body = defined({
      name: a.name, template_id: a.templateId, motor_block_id: a.motorBlockId, list_ids: listIds, exclude_list_ids: excludeListIds,
      from_address: a.fromAddress, from_name: a.fromName, reply_to: a.replyTo, description: a.description,
    });
    if (isDry(a)) {
      const out = await call('/campaigns', ws, { method: 'POST', body: { ...body, dry_run: true } });
      return { success: true, dryRun: true, applied: false, data: out.data, note: 'Nothing was created. A real create makes a DRAFT: it is not scheduled and nothing is sent.' };
    }
    const out = await call('/campaigns', ws, { method: 'POST', body, headers: { 'Idempotency-Key': keyFor('comms_create_campaign', ws, a) } });
    return { success: true, dryRun: false, applied: true, data: out.data, note: 'Created as a DRAFT. It is not scheduled and nothing has been sent.' };
  });

  // ---- comms_update_campaign -------------------------------------------------
  client.commsUpdateCampaign = guarded('comms_update_campaign', async (a) => {
    checkId(a.id);
    const changes = defined({
      from_address: a.fromAddress, from_name: a.fromName, reply_to: a.replyTo, description: a.description, template_id: a.templateId,
      list_ids: a.listIds === undefined ? undefined : idList(a.listIds, 'listIds', { min: 1 }),
      exclude_list_ids: a.excludeListIds === undefined ? undefined : (a.excludeListIds === null ? null : idList(a.excludeListIds, 'excludeListIds')),
    });
    if (Object.keys(changes).length === 0) need('NOTHING_TO_UPDATE', 'Give at least one of fromAddress, fromName, replyTo, description, templateId, listIds or excludeListIds.');
    if (changes.template_id !== undefined) checkId(changes.template_id, 'templateId');
    const ws = await resolveWorkspace(a.workspaceId);
    const path = `/campaigns/${a.id}/settings`;
    // The dry run is the API's own: it checks everything a real edit checks and says what would change and what it is now.
    const dry = await call(path, ws, { method: 'PATCH', body: { ...changes, dry_run: true } });
    const view = { campaign: { id: a.id, status: dry.data && dry.data.status }, changes: (dry.data && dry.data.changes) || {}, previous: dry.previous || {} };
    if (isDry(a)) return { success: true, dryRun: true, applied: false, ...view, note: 'Nothing was changed. Only a draft can be edited.' };
    await call(path, ws, { method: 'PATCH', body: changes });
    return { success: true, dryRun: false, applied: true, ...view, note: 'Saved. The previous values are above, in case it needs undoing. Run comms_preflight_campaign again: any earlier preflight is now stale.' };
  });

  // ---- comms_duplicate_campaign ----------------------------------------------
  client.commsDuplicateCampaign = guarded('comms_duplicate_campaign', async (a) => {
    checkId(a.id);
    const bad = keyProblem(a); if (bad) need('INVALID_IDEMPOTENCY_KEY', bad);
    const ws = await resolveWorkspace(a.workspaceId);
    if (isDry(a)) {
      const c = ((await call(`/campaigns/${a.id}`, ws)).data) || {};
      return { success: true, dryRun: true, applied: false, would_create: { name: `${String(c.name ?? '').slice(0, 192)} (copy)`, status: 'draft', copied_from: a.id }, note: 'Nothing was created. The copy is a new DRAFT with no schedule and no history.' };
    }
    const out = await call(`/campaigns/${a.id}/duplicate`, ws, { method: 'POST', body: {}, headers: { 'Idempotency-Key': keyFor('comms_duplicate_campaign', ws, a) } });
    return { success: true, dryRun: false, applied: true, data: out.data, note: 'Created as a new DRAFT. It is not scheduled and nothing has been sent.' };
  });

  // ---- comms_preflight_campaign ----------------------------------------------
  client.commsPreflightCampaign = guarded('comms_preflight_campaign', async (a) => {
    checkId(a.id);
    const ws = await resolveWorkspace(a.workspaceId);
    const d = ((await call(`/campaigns/${a.id}/compile`, ws, { method: 'POST' })).data) || {};
    const total = Number(d.totalRecipients ?? 0);
    const notes = [
      `Nothing was sent. Preflight compiled a snapshot of the audience and content (version ${d.version}) and stored it.`,
      'The forecast is an estimate that assumes no other traffic.',
      'Changing the template, the lists or the settings makes this stale: run it again before scheduling.',
    ];
    if (total === 0) notes.unshift('No one would receive this campaign as it is now: the audience breakdown says why. It is not ready.');
    return scrubDeep({
      success: true,
      preflight: {
        version: d.version, checkedAt: new Date().toISOString(), hasRecipients: total > 0, warnings: d.warnings || [], totalRecipients: total,
        audience: d.audience, forecast: d.forecast, ga_warnings: d.ga_warnings || [], notes,
      },
    });
  });

  // ---- comms_send_test -------------------------------------------------------
  client.commsSendTest = guarded('comms_send_test', async (a) => {
    checkId(a.id);
    const ws = await resolveWorkspace(a.workspaceId);
    // Only a sample first name can be passed. There is no recipient input, and anything that looks like one is dropped here.
    const sample = defined({ name: typeof a.sample?.name === 'string' ? a.sample.name : undefined, identity_name: typeof a.sample?.identity_name === 'string' ? a.sample.identity_name : undefined });
    if (isDry(a)) {
      const c = ((await call(`/campaigns/${a.id}`, ws)).data) || {};
      const t = c.template_id ? ((await call(`/templates/${c.template_id}`, ws)).data) || {} : {};
      return { success: true, dryRun: true, applied: false, would_send: { to: 'the account owner only (their own verified address)', from: c.from_address ?? null, subject: t.subject ?? null, campaign: c.name ?? null }, note: 'Nothing was sent.' };
    }
    const out = await call(`/campaigns/${a.id}/test-send`, ws, { method: 'POST', body: Object.keys(sample).length ? { sample } : {} });
    const d = out.data || {};
    return scrubDeep({
      success: true, dryRun: false, applied: true, sent_to: maskEmail(d.sent_to), subject: d.subject, warnings: d.warnings || [], links: d.links ?? null,
      note: 'Sent to the account owner only, to their own verified address: no one else received it. Ask them to check their own inbox.',
    });
  });

  // ---- comms_send_template_test ----------------------------------------------
  client.commsSendTemplateTest = guarded('comms_send_template_test', async (a) => {
    checkId(a.id); checkId(a.motorBlockId, 'motorBlockId');
    const ws = await resolveWorkspace(a.workspaceId);
    const sample = defined({ name: typeof a.sample?.name === 'string' ? a.sample.name : undefined, identity_name: typeof a.sample?.identity_name === 'string' ? a.sample.identity_name : undefined });
    if (isDry(a)) {
      const t = ((await call(`/templates/${a.id}`, ws)).data) || {};
      return { success: true, dryRun: true, applied: false, would_send: { to: 'the account owner only (their own verified address)', template: t.name ?? null, subject: t.subject ?? null, through: a.motorBlockId }, note: 'Nothing was sent.' };
    }
    const out = await call(`/templates/${a.id}/test-send`, ws, { method: 'POST', body: defined({ motor_block_id: a.motorBlockId, sample: Object.keys(sample).length ? sample : undefined }) });
    const d = out.data || {};
    return scrubDeep({
      success: true, dryRun: false, applied: true, sent_to: maskEmail(d.sent_to), from: d.from, subject: d.subject, warnings: d.warnings || [], links: d.links ?? null,
      note: 'Sent to the account owner only, to their own verified address: no one else received it. Ask them to check their own inbox.',
    });
  });

}
