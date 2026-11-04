/**
 * The Communications reporting reads (Comms MCP M3-6), attached to the Comms client by commsClient.js. Pure shaping over five GETs:
 * ids and bounds are checked before the network, then the answer is made safe (addresses masked, IPs and user agents stripped, link
 * query strings replaced) and given the context an agent must not leave out (the basis, the as-of time, "no data yet").
 */

import { assertToolAllowed } from './resourceAuth.js';
import { scrubDeep, scrubError } from './commsMask.js';
import { EVENT_TYPES, MAX_EVENTS_PAGE } from './commsReportTools.js';

const OPEN_CAVEAT = 'Open counts are estimates: Apple Mail Privacy Protection and the Gmail image proxy count as opens. Prefer clicks, and say this when you quote an open number.';

/** https://shop.example/sale?x=1#top -> https://shop.example/sale?... (the query and fragment can carry personal tokens). */
function scrubUrl(value) {
  if (typeof value !== 'string') return value;
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : `${value.slice(0, cut)}?...`;
}

/** Remove IP and user agent anywhere, scrub URLs in url-like fields. A copy; never mutates. */
function cleanEvent(value) {
  if (Array.isArray(value)) return value.map(cleanEvent);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/^(ip|ip_address|ipaddress|user_?agent)$/i.test(k)) continue;
      out[k] = /url$/i.test(k) ? scrubUrl(v) : cleanEvent(v);
    }
    return out;
  }
  return value;
}

export function attachCommsReports(client, { claims, server, call, resolveWorkspace, fail, UUID }) {
  const need = (code, message) => { throw fail(message, 400, { code }); };
  const checkId = (value) => { if (!UUID.test(String(value ?? ''))) need('INVALID_ID', 'id must be a valid id.'); };
  const days = (a, def, max) => {
    const d = a.days === undefined ? def : a.days;
    if (!Number.isInteger(d) || d < 1 || d > max) need('INVALID_DAYS', `days must be a whole number from 1 to ${max}.`);
    return d;
  };
  const guarded = (tool, fn) => async (a = {}) => {
    assertToolAllowed(server, tool, claims.scopes);
    try { return scrubDeep(await fn(a)); } catch (e) { throw scrubError(e); }
  };

  client.commsGetCampaignReport = guarded('comms_get_campaign_report', async (a) => {
    checkId(a.id);
    const ws = await resolveWorkspace(a.workspaceId);
    const out = await call(`/campaigns/${a.id}/report`, ws);
    const r = out.data || {};
    const f = r.funnel || {}; const o = r.outcomes || {}; const e = r.engagement || {}; const sync = r.sync || {};
    const sent = Number(f.handed_off) > 0;
    const plain = [];
    if (!sent) {
      plain.push(`No data yet: this campaign has not sent anything (status ${r.status || 'unknown'}), so there is nothing to report.`);
    } else {
      plain.push(`${f.delivered} of ${f.handed_off} handed off were delivered (${r.rates && r.rates.delivery_rate}%); ${o.bounced || 0} bounced, ${o.failed || 0} failed, ${o.complained || 0} complained.`);
      plain.push(`${e.opens_unique_excluding_scanners} of ${f.delivered} delivered opened (${r.rates && r.rates.open_rate}%); this is an estimate, see basis.`);
      plain.push(`${e.clicks_unique} of ${f.delivered} delivered clicked (${r.rates && r.rates.click_rate}%), ${e.clicks_total} clicks in all.`);
      if (sync.synced === false) plain.push(`${sync.outcomes_pending} recipients are still waiting for a delivery outcome (still syncing), so delivered and bounced may still rise.`);
    }
    for (const n of Array.isArray(r.notes) ? r.notes : []) plain.push(n);
    return { ...out, sent, dataAsOf: sync.as_of || null, plain };
  });

  client.commsGetCampaignLinks = guarded('comms_get_campaign_links', async (a) => {
    checkId(a.id);
    const ws = await resolveWorkspace(a.workspaceId);
    const out = await call(`/campaigns/${a.id}/click-breakdown`, ws);
    const data = (Array.isArray(out.data) ? out.data : []).map((row) => ({ ...row, url: scrubUrl(row.url) }));
    return { ...out, data, note: 'The query string and fragment of each link are replaced with ... because they can carry personal tokens.' };
  });

  client.commsGetCampaignTimeline = guarded('comms_get_campaign_timeline', async (a) => {
    checkId(a.id);
    const d = days(a, 7, 30);
    const ws = await resolveWorkspace(a.workspaceId);
    const out = await call(`/campaigns/${a.id}/analytics?days=${d}`, ws);
    return { ...out, note: OPEN_CAVEAT };
  });

  client.commsListCampaignEvents = guarded('comms_list_campaign_events', async (a) => {
    checkId(a.id);
    if (a.type !== undefined && !EVENT_TYPES.includes(a.type)) need('INVALID_TYPE', `type must be one of: ${EVENT_TYPES.join(', ')}.`);
    const page = a.page === undefined ? 1 : a.page;
    const pageSize = a.pageSize === undefined ? MAX_EVENTS_PAGE : a.pageSize;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_EVENTS_PAGE) {
      need('INVALID_PAGE', `page must be a whole number from 1 and pageSize from 1 to ${MAX_EVENTS_PAGE}.`);
    }
    const ws = await resolveWorkspace(a.workspaceId);
    const qs = `page=${page}&pageSize=${pageSize}&redact=true${a.type ? `&status=${a.type}` : ''}`;
    const out = await call(`/campaigns/${a.id}/events?${qs}`, ws);
    return { ...out, data: cleanEvent(out.data), note: 'Contacts are shown as ids only; addresses, IP addresses and user agents are never returned.' };
  });

  client.commsGetAnalyticsOverview = guarded('comms_get_analytics_overview', async (a) => {
    const d = days(a, 30, 365);
    const ws = await resolveWorkspace(a.workspaceId);
    const out = await call(`/analytics/overview?days=${d}`, ws);
    return { ...out, note: OPEN_CAVEAT };
  });
  return client;
}
