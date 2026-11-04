/**
 * The Communications management tools (Comms MCP M3-7), attached to the Comms client by commsClient.js. Order of checks for every tool, so nothing
 * reaches the network that should not: scope, ids and arguments, the confirmation, then the workspace, then the network. A dry run (the default)
 * only reads. A webhook URL is never shown beyond its host, and every output and error is scrubbed like the contact tools.
 */

import { assertToolAllowed } from './resourceAuth.js';
import { scrubDeep, scrubError } from './commsMask.js';
import { signRequestState, verifyRequestState } from './native/requestState.js';
import { WEBHOOK_EVENTS } from './commsManageTools.js';

const TOKEN_TTL_MS = 15 * 60 * 1000;
const hostOf = (u) => { try { return new URL(String(u)).host; } catch (_) { return null; } };
/** https://hooks.example/services/T0/B0/SECRET?x=1 -> https://hooks.example/... (a path or query string can hold a token) */
const safeUrl = (u) => { try { const x = new URL(String(u)); return `${x.protocol}//${x.host}/...`; } catch (_) { return null; } };
const shapeHook = (h) => ({
  id: h.id, url: safeUrl(h.url), events: h.events, enabled: h.enabled, failure_count: h.failure_count ?? 0,
  last_delivery_status: h.last_delivery_status ?? null, created_at: h.created_at,
});
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

const CLICK_CONSENT_EXPLAINED = 'When on, a recipient clicking a link in one of your campaigns is recorded as giving their consent (inferred consent); when off, clicks are never treated as consent. '
  + 'It changes how consent is recorded for the people you email, so make sure the person understands before switching it on.';

export function attachCommsManage(client, { claims, server, call, resolveWorkspace, fail, UUID }) {
  const need = (code, message, status = 400) => { throw fail(message, status, { code }); };
  const checkId = (value, label = 'id') => { if (!UUID.test(String(value ?? ''))) need('INVALID_ID', `${label} must be a valid id.`); };
  const isDry = (a) => a.dryRun !== false;
  const guarded = (tool, fn) => async (a = {}) => {
    assertToolAllowed(server, tool, claims.scopes);
    try { return scrubDeep(await fn(a)); } catch (e) { throw scrubError(e); }
  };

  async function readSettings(ws) {
    const [c, o, u] = await Promise.all([
      call(`/workspaces/${ws}/settings/consent`, null), call(`/workspaces/${ws}/settings/open-tracking`, null), call(`/workspaces/${ws}/settings/unsubscribe`, null),
    ]);
    return {
      click_consent_enabled: c.data.click_consent_enabled,
      open_tracking_enabled: o.data.open_tracking_enabled,
      unsubscribe_landing_url: u.data.unsubscribe_landing_url ?? null,
    };
  }
  const listWebhooks = async (ws) => (await call(`/workspaces/${ws}/webhooks`, ws)).data || [];
  async function findWebhook(ws, webhookId) {
    const found = (await listWebhooks(ws)).find((h) => String(h.id) === String(webhookId));
    if (!found) need('WEBHOOK_NOT_FOUND', 'No webhook with this id in this workspace. List them with comms_list_webhooks.', 404);
    return found;
  }

  // ---- reads ------------------------------------------------------------------
  client.commsGetWorkspaceSettings = guarded('comms_get_workspace_settings', async (a) => {
    const ws = await resolveWorkspace(a.workspaceId);
    return { success: true, data: await readSettings(ws) };
  });
  client.commsListWebhooks = guarded('comms_list_webhooks', async (a) => {
    const ws = await resolveWorkspace(a.workspaceId);
    return { success: true, data: (await listWebhooks(ws)).map(shapeHook) };
  });

  // ---- workspaces -------------------------------------------------------------
  client.commsCreateWorkspace = guarded('comms_create_workspace', async (a) => {
    const name = typeof a.name === 'string' ? a.name.trim() : '';
    if (!name) need('MISSING_NAME', 'A workspace needs a name.');
    const slug = typeof a.slug === 'string' && a.slug.trim() ? a.slug.trim() : undefined;
    const listed = (await call('/workspaces', null)).data || [];
    const existing = listed.find((w) => String(w.name).trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      return { success: true, dryRun: isDry(a), applied: false, alreadyExists: true, existing: { id: existing.id, name: existing.name, slug: existing.slug }, note: 'A workspace with this name already exists, so nothing was created.' };
    }
    if (isDry(a)) {
      return {
        success: true, dryRun: true, applied: false, would_create: { name, slug: slug ?? null },
        note: 'Nothing was created. When an assistant creates a workspace the account owner is emailed. A new workspace has no sending identity, contacts or campaigns yet.',
        nextStep: 'Tell the person the name and get a clear yes, then call again with dryRun:false.',
      };
    }
    let out;
    try {
      out = await call('/workspaces', null, { method: 'POST', body: { name, ...(slug ? { slug } : {}) } });
    } catch (e) {
      if (e.status === 409 && e.data && e.data.code === 'WORKSPACE_NAME_EXISTS') {
        return { success: true, dryRun: false, applied: false, alreadyExists: true, existing: e.data.existing || null, note: 'A workspace with this name already exists, so nothing was created.' };
      }
      throw e;
    }
    return {
      success: true, dryRun: false, applied: true, data: out.data,
      note: 'Created. The account owner has been emailed.',
      nextStep: 'A new workspace has no sending identity yet: give it one with comms_add_sending_identity (needs a verified domain), then set its settings and build its first template and list.',
    };
  });

  client.commsUpdateWorkspace = guarded('comms_update_workspace', async (a) => {
    checkId(a.id);
    const changes = {};
    if (a.name !== undefined) { const n = String(a.name).trim(); if (!n) need('MISSING_NAME', 'A workspace name cannot be empty.'); changes.name = n; }
    if (a.slug !== undefined) changes.slug = String(a.slug).trim();
    if (Object.keys(changes).length === 0) need('NOTHING_TO_UPDATE', 'Pass name and/or slug.');
    const current = ((await call('/workspaces', null)).data || []).find((w) => String(w.id) === String(a.id));
    if (!current) need('WORKSPACE_NOT_FOUND', 'No such workspace is covered by this authorization.', 404);
    const previous = { name: current.name, slug: current.slug };
    if (isDry(a)) return { success: true, dryRun: true, applied: false, previous, changes, nextStep: 'Show the person the change and get a clear yes, then call again with dryRun:false.' };
    const out = await call(`/workspaces/${a.id}`, null, { method: 'PATCH', body: changes });
    return { success: true, dryRun: false, applied: true, previous, data: out.data };
  });

  client.commsUpdateWorkspaceSettings = guarded('comms_update_workspace_settings', async (a) => {
    const asked = {};
    if (a.clickConsentEnabled !== undefined) { if (typeof a.clickConsentEnabled !== 'boolean') need('INVALID_VALUE', 'clickConsentEnabled must be true or false.'); asked.click_consent_enabled = a.clickConsentEnabled; }
    if (a.openTracking !== undefined) { if (typeof a.openTracking !== 'boolean') need('INVALID_VALUE', 'openTracking must be true or false.'); asked.open_tracking_enabled = a.openTracking; }
    if (a.unsubscribeLandingUrl !== undefined) {
      if (a.unsubscribeLandingUrl !== null) {
        let ok = false;
        try { ok = new URL(String(a.unsubscribeLandingUrl)).protocol === 'https:'; } catch (_) { ok = false; }
        if (!ok) need('INVALID_URL', 'unsubscribeLandingUrl must be an https address (or null for the default page).');
      }
      asked.unsubscribe_landing_url = a.unsubscribeLandingUrl;
    }
    if (Object.keys(asked).length === 0) need('NOTHING_TO_UPDATE', 'Pass at least one of clickConsentEnabled, openTracking, unsubscribeLandingUrl.');
    const ws = await resolveWorkspace(a.workspaceId);
    const current = await readSettings(ws);
    const changes = {};
    for (const [k, to] of Object.entries(asked)) if (current[k] !== to) changes[k] = { from: current[k], to };
    if (Object.keys(changes).length === 0) {
      return { success: true, dryRun: isDry(a), applied: false, changes: {}, current, note: 'Everything you asked for is already so; nothing to change.' };
    }
    if (isDry(a)) {
      return {
        success: true, dryRun: true, applied: false, changes, current,
        ...(changes.click_consent_enabled ? { explain: { click_consent_enabled: CLICK_CONSENT_EXPLAINED } } : {}),
        nextStep: 'Show the person each change (from, to) in plain words and get a clear yes, then call again with the same arguments plus dryRun:false. Nothing has been changed.',
      };
    }
    const PATHS = { click_consent_enabled: 'consent', open_tracking_enabled: 'open-tracking', unsubscribe_landing_url: 'unsubscribe' };
    for (const [k, change] of Object.entries(changes)) {
      await call(`/workspaces/${ws}/settings/${PATHS[k]}`, null, { method: 'PATCH', body: { [k]: change.to } });
    }
    return { success: true, dryRun: false, applied: true, changes, previous: current, note: 'Changed. The previous values are above so it can be undone.' };
  });

  client.commsAddSendingIdentity = guarded('comms_add_sending_identity', async (a) => {
    checkId(a.domainId, 'domainId');
    const ws = await resolveWorkspace(a.workspaceId);
    const path = `/workspaces/${ws}/motor-blocks/add`;
    if (isDry(a)) {
      const out = await call(path, null, { method: 'POST', body: { domainId: a.domainId, dry_run: true } });
      return { success: true, dryRun: true, applied: false, data: out.data, nextStep: 'Tell the person which domain this workspace would send from and get a clear yes, then call again with dryRun:false. Nothing has been added.' };
    }
    const out = await call(path, null, { method: 'POST', body: { domainId: a.domainId, ...(a.name ? { name: a.name } : {}) } });
    return { success: true, dryRun: false, applied: true, data: out.data, note: 'Added to the workspace. Nothing was removed or replaced; the workspace\'s other sending identities are untouched.' };
  });

  // ---- webhooks ---------------------------------------------------------------
  client.commsUpdateWebhook = guarded('comms_update_webhook', async (a) => {
    checkId(a.webhookId, 'webhookId');
    const body = {};
    if (a.events !== undefined) {
      if (!Array.isArray(a.events) || a.events.length === 0 || !a.events.every((e) => WEBHOOK_EVENTS.includes(e))) need('INVALID_EVENTS', `events must be a non-empty list of: ${WEBHOOK_EVENTS.join(', ')}.`);
      body.events = a.events;
    }
    if (a.enabled !== undefined) { if (typeof a.enabled !== 'boolean') need('INVALID_VALUE', 'enabled must be true or false.'); body.enabled = a.enabled; }
    if (a.url !== undefined) {
      let ok = false;
      try { ok = new URL(String(a.url)).protocol === 'https:' && String(a.url).length <= 2000; } catch (_) { ok = false; }
      if (!ok) need('INVALID_WEBHOOK_URL', 'The webhook address must be a public https address.');
      body.url = String(a.url);
    }
    if (Object.keys(body).length === 0) need('NOTHING_TO_UPDATE', 'Pass events, enabled and/or url.');
    const real = !isDry(a);
    if (real && body.url !== undefined) {
      if (a.confirm !== true) need('CONFIRMATION_REQUIRED', 'Changing where a webhook sends its events needs the person\'s clear yes to the dry run: call again with confirm:true and the confirmToken.');
      if (!(typeof a.confirmToken === 'string' && a.confirmToken.length > 0)) need('CONFIRM_TOKEN_REQUIRED', 'Pass the confirmToken from the dry run of exactly this change. Call without dryRun:false to get one.');
    }
    const ws = await resolveWorkspace(a.workspaceId);
    const current = await findWebhook(ws, a.webhookId);
    const changes = {};
    if (body.events !== undefined && !sameSet(body.events, current.events || [])) changes.events = { from: current.events, to: body.events };
    if (body.enabled !== undefined && body.enabled !== current.enabled) changes.enabled = { from: current.enabled, to: body.enabled };
    const urlChanges = body.url !== undefined && body.url !== current.url;
    if (!urlChanges) delete body.url;
    if (Object.keys(changes).length === 0 && !urlChanges) {
      return { success: true, dryRun: !real, applied: false, changes: {}, webhook: shapeHook(current), note: 'Everything you asked for is already so; nothing to change.' };
    }
    const path = `/workspaces/${ws}/webhooks/${a.webhookId}`;
    const bound = { grantId: claims.grantId, workspaceId: ws, webhookId: a.webhookId, url: body.url };
    if (!real) {
      if (!urlChanges) {
        return { success: true, dryRun: true, applied: false, webhook: shapeHook(current), changes, nextStep: 'Show the person the change and get a clear yes, then call again with the same arguments plus dryRun:false. Nothing has been changed.' };
      }
      return {
        success: true, dryRun: true, applied: false, webhook: shapeHook(current), changes,
        summary: {
          webhook: a.webhookId, from: hostOf(current.url), to: hostOf(body.url), events: (body.events || current.events),
          warning: 'Campaign events include recipient email addresses (unsubscribes, consent, bounces and deliveries). Everything this webhook is subscribed to will go to the new address.',
        },
        confirmToken: signRequestState({ tool: 'comms_update_webhook', args: bound, ttlMs: TOKEN_TTL_MS }),
        expiresInMinutes: TOKEN_TTL_MS / 60000,
        nextStep: 'Tell the person exactly which host events will go to instead of which, and that campaign events contain recipient email addresses. Only after a clear yes, call again with the same arguments plus '
          + 'dryRun:false, confirm:true and this confirmToken. The account owner is emailed about the change first; if they cannot be emailed it is refused. Nothing has been changed.',
      };
    }
    if (urlChanges && !verifyRequestState(a.confirmToken, { tool: 'comms_update_webhook', args: bound })) {
      need('CONFIRM_TOKEN_INVALID', 'The preview this confirmation belongs to no longer matches: the address or the webhook changed, it is for another connection, or it expired. Preview again, show the person the new summary and ask again.');
    }
    const out = await call(path, ws, { method: 'PATCH', body });
    return {
      success: true, dryRun: false, applied: true, changes, webhook: shapeHook(out.data || current),
      ...(urlChanges ? { note: 'The address was changed. The account owner has been emailed about it.' } : {}),
    };
  });

  client.commsDeleteWebhook = guarded('comms_delete_webhook', async (a) => {
    checkId(a.webhookId, 'webhookId');
    const real = !isDry(a);
    if (real && a.confirm !== true) need('CONFIRMATION_REQUIRED', 'Deleting a webhook is final and its signing secret cannot be recovered. If the person has said to delete it, call again with dryRun:false and confirm:true. To only stop events, pause it with comms_update_webhook.');
    const ws = await resolveWorkspace(a.workspaceId, { explicit: true });
    const current = await findWebhook(ws, a.webhookId);
    if (!real) {
      return {
        success: true, dryRun: true, applied: false, would_delete: shapeHook(current),
        nextStep: 'Deleting is final and cannot be undone, and the signing secret cannot be recovered (a person re-creates it in the dashboard). Offer pausing instead (comms_update_webhook, enabled:false). Only after a clear yes, call again with dryRun:false and confirm:true.',
      };
    }
    await call(`/workspaces/${ws}/webhooks/${a.webhookId}`, ws, { method: 'DELETE' });
    return { success: true, dryRun: false, applied: true, deleted: a.webhookId, note: 'Deleted. This cannot be undone; a person can create a new webhook in the dashboard.' };
  });

  client.commsTestWebhook = guarded('comms_test_webhook', async (a) => {
    checkId(a.webhookId, 'webhookId');
    const ws = await resolveWorkspace(a.workspaceId);
    const current = await findWebhook(ws, a.webhookId);
    if (isDry(a)) {
      return { success: true, dryRun: true, applied: false, would_send: { event: 'test', to: hostOf(current.url) }, note: 'Nothing was sent. The test event carries no personal data.', nextStep: 'Call again with dryRun:false to queue it.' };
    }
    const out = await call(`/workspaces/${ws}/webhooks/${a.webhookId}/test`, ws, { method: 'POST' });
    return { success: true, dryRun: false, applied: true, queued: Boolean(out.data && out.data.queued), note: 'Queued. The test event carries no personal data; check that it arrived in the receiving system.' };
  });

  return client;
}
