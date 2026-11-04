/**
 * The Communications send tools (Comms MCP M3-5): schedule and cancel. Attached to the Comms client by commsClient.js.
 *
 * Every refusal that can be made WITHOUT the network is made first (scope, ids, the preflight, the time, the confirmation and the token), so a
 * mistake never reaches a write. The real schedule then asks the API for a dry run again and checks the token against what it says NOW: if the
 * numbers, the time or the campaign changed since the person was shown the preview, the token no longer fits. The Comms Block adds its own
 * guards behind this (preflight same-state, no send-now, 15 minutes to 90 days, 3 a day, an email to the account owner).
 */

import { assertToolAllowed } from './resourceAuth.js';
import { deriveKey } from './commsKeys.js';
import { resolveSendTime } from './commsTime.js';
import { signRequestState, verifyRequestState } from './native/requestState.js';

const TOKEN_TTL_MS = 15 * 60 * 1000;
const TOOL = 'comms_schedule_campaign';

export function attachCommsSend(client, { claims, server, call, resolveWorkspace, fail, UUID }) {
  const need = (code, message, status = 400) => { throw fail(message, status, { code }); };
  const checkId = (value, label = 'id') => { if (!UUID.test(String(value ?? ''))) need('INVALID_ID', `${label} must be a valid id.`); };

  // ---- comms_schedule_campaign ---------------------------------------------
  client.commsScheduleCampaign = async (a = {}) => {
    assertToolAllowed(server, TOOL, claims.scopes);
    checkId(a.id);
    const pv = Number(a.preflightVersion);
    if (!Number.isInteger(pv) || pv < 1) need('PREFLIGHT_REQUIRED', 'Run comms_preflight_campaign first, show the person its numbers, and pass the version it returned as preflightVersion.');
    let time;
    try { time = resolveSendTime({ sendAtLocal: a.sendAtLocal, timezone: a.timezone, sendAtUtc: a.sendAtUtc }, new Date(Date.now())); } catch (e) { throw fail(e.message, 400, { code: e.code }); }
    const real = a.dryRun === false;
    if (real && a.confirm !== true) {
      need('CONFIRMATION_REQUIRED', 'Scheduling emails people. First call this tool without dryRun:false to get the summary and the confirmToken, read the summary to the person, and only after a clear yes call again with dryRun:false, confirm:true and the confirmToken.');
    }
    if (real && !(typeof a.confirmToken === 'string' && a.confirmToken.length > 0)) {
      need('CONFIRM_TOKEN_REQUIRED', 'Pass the confirmToken from the dry run of exactly this schedule. Call without dryRun:false to get one.');
    }
    const ws = await resolveWorkspace(a.workspaceId);
    const iso = time.utc.toISOString();
    const apiBody = { scheduled_at: iso, timezone: time.timezone, expected_preflight_version: pv };

    // The API checks everything (the preflight is the same state, the time rules, the audience, the caps) and reports what would happen.
    const path = `/campaigns/${a.id}/schedule`;
    const dry = (await call(path, ws, { method: 'POST', body: { ...apiBody, dry_run: true } })).data || {};
    const bound = { grantId: claims.grantId, workspaceId: ws, campaignId: a.id, preflightVersion: pv, sendAtUtc: iso, timezone: time.timezone, totalRecipients: dry.total_recipients };

    if (!real) {
      const campaign = ((await call(`/campaigns/${a.id}`, ws)).data) || {};
      const template = campaign.template_id ? ((await call(`/templates/${campaign.template_id}`, ws)).data) || {} : {};
      return {
        success: true, dryRun: true, applied: false,
        summary: {
          campaign: { id: a.id, name: campaign.name ?? null, status: dry.status ?? campaign.status ?? null },
          subject: template.subject ?? null, from: dry.from_address ?? campaign.from_address ?? null, people: dry.total_recipients,
          sendsAt: { local: time.localText, utc: iso, timezone: time.timezone },
          warnings: dry.warnings || [], audience: dry.audience, forecast: dry.forecast,
        },
        preflight: { version: pv, matches: true },
        confirmToken: signRequestState({ tool: TOOL, args: bound, ttlMs: TOKEN_TTL_MS }),
        expiresInMinutes: TOKEN_TTL_MS / 60000,
        nextStep: 'Read this summary to the person: the campaign, the subject, the sender, exactly how many people, the time with its weekday in their timezone, and every warning. '
          + 'Only after a clear yes, call this tool again with the same arguments plus dryRun:false, confirm:true and this confirmToken. Nothing has been scheduled or sent.',
      };
    }

    if (!verifyRequestState(a.confirmToken, { tool: TOOL, args: bound })) {
      need('CONFIRM_TOKEN_INVALID', 'The preview this confirmation belongs to no longer matches: the numbers, the time or the campaign changed, it is for another connection, or it expired. Preview again, show the person the new summary, and ask again. Nothing was scheduled.');
    }
    const key = deriveKey(claims, TOOL, ws, { id: a.id, preflightVersion: pv, sendAtUtc: iso, timezone: time.timezone });
    const out = await call(path, ws, { method: 'POST', body: apiBody, headers: { 'Idempotency-Key': key } });
    const d = out.data || {};
    return {
      success: true, dryRun: false, applied: true,
      scheduled: { id: a.id, status: d.status, scheduled_at: d.scheduled_at, timezone: time.timezone, people: d.total_recipients, from: d.from_address, artifact_version: d.artifact_version },
      note: `Scheduled for ${time.localText}. The account owner has been emailed about this. It can still be cancelled with comms_cancel_campaign before it sends; cancelling is final.`,
    };
  };

  // ---- comms_cancel_campaign -----------------------------------------------
  client.commsCancelCampaign = async (a = {}) => {
    assertToolAllowed(server, 'comms_cancel_campaign', claims.scopes);
    checkId(a.id);
    if (a.confirm !== true) {
      need('CONFIRMATION_REQUIRED', 'Cancelling is final: the campaign can never be restarted, and mail already sent cannot be recalled. If the person has said to cancel it, call again with confirm:true.');
    }
    const ws = await resolveWorkspace(a.workspaceId);
    const before = ((await call(`/campaigns/${a.id}`, ws)).data) || {};
    const out = await call(`/campaigns/${a.id}/cancel`, ws, { method: 'POST' });
    const sending = before.status === 'sending';
    return {
      success: true, applied: true, status: (out.data && out.data.status) || 'cancelled', was: before.status ?? null,
      note: (sending
        ? 'Cancelled. It had already started sending: mail already sent cannot be recalled, but nothing further will be sent. '
        : 'Cancelled. It had not started, so nothing had been sent. ')
        + 'Cancelling is final: it can never be restarted. To send it again, duplicate it (comms_duplicate_campaign) and schedule the copy. The account owner has been emailed.',
    };
  };
}
