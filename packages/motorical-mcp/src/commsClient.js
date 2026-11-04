/**
 * Calling the Comms Block as an MCP agent (Comms MCP M2c). A separate HTTP surface from the Public API the rest of the client
 * speaks: its own base URL (loopback on the same host), its own delegation audience, and the workspace in X-Tenant-Id.
 *
 * Authority is the same story as everywhere else: the assertion names the grant, the Comms Block asks the backend what the grant
 * allows. Here we only refuse early what we already know the grant lacks (scope), and we never put a token in an error.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { mintDelegation } from './delegation.js';
import { assertToolAllowed } from './resourceAuth.js';
import { COMMS_DELEGATION_AUDIENCE } from '@motorical/scope-catalog';
import { COMMS_READ_TOOLS, DEFAULT_PAGE, MAX_PAGE } from './commsReadTools.js';
import { attachCommsWrites } from './commsWrites.js';
import { attachCommsContacts } from './commsContacts.js';
import { attachCommsCampaigns } from './commsCampaigns.js';
import { attachCommsSend } from './commsSend.js';
import { attachCommsReports } from './commsReports.js';
import { attachCommsManage } from './commsManage.js';

// One context per tool call, so concurrent calls on a shared client never see each other's workspace.
const callContext = new AsyncLocalStorage();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message, status, data) {
  return Object.assign(new Error(message), { status, data });
}

export function attachCommsMethods(client, { claims, server, signer, commsBaseUrl, fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  const before = new Set(Object.keys(client));
  const base = String(commsBaseUrl || '').replace(/\/+$/, '');

  async function call(path, workspaceId, { method = 'GET', body: payload, headers: extra } = {}) {
    const assertion = mintDelegation({
      grantId: claims.grantId, userId: claims.userId, motorBlockId: undefined, scopes: claims.scopes, canonicalUri: server.canonicalUri,
    }, signer, { audience: COMMS_DELEGATION_AUDIENCE });
    const headers = { Authorization: `Delegation ${assertion}`, Accept: 'application/json' };
    if (workspaceId) headers['X-Tenant-Id'] = workspaceId;
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    if (extra) Object.assign(headers, extra);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res; let body;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method, headers, signal: controller.signal, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
      });
      body = await res.json();
    } catch (_) {
      // The underlying message can echo request headers; say nothing about it.
      throw fail('Could not reach the Communications service. Try again in a moment.', 502, { code: 'COMMS_UNREACHABLE' });
    } finally {
      clearTimeout(timer);
    }
    if (res.ok && body && body.success !== false) return body;
    const data = { code: (body && (body.code || body.error)) || `HTTP_${res.status}` };
    if (body && body.missing) data.missing = body.missing;
    // What an agent needs to act on a refusal: the findings, the current version, the validator's own report.
    if (body && Array.isArray(body.warnings)) data.warnings = body.warnings;
    if (body && body.current_updated_at) data.current_updated_at = body.current_updated_at;
    if (body && body.validation) data.validation = body.validation;
    if (body && body.data && typeof body.data === 'object') data.detail = body.data;
    // Campaign refusals carry what the agent needs to act: the wait before a retry, the expected domain, the offending variables or urls.
    if (body && body.retryAfter) data.retryAfter = body.retryAfter;
    for (const k of ['details', 'expected_domain', 'variables', 'urls', 'changes', 'audience', 'existing']) if (body && body[k] !== undefined) data[k] = body[k];
    throw fail((body && typeof body.error === 'string' && body.error) || `The Communications service answered ${res.status}.`, res.status, data);
  }

  function noteWorkspace(id, name, why) {
    const ctx = callContext.getStore();
    if (ctx) ctx.workingIn = `Working in: ${name ? `${name} (${id})` : id} (${why})`;
  }

  /** The workspace to act on: the one named, else the only one this authorization covers. Never a guess. */
  async function resolveWorkspace(workspaceId) {
    if (workspaceId !== undefined && workspaceId !== null) {
      if (!UUID.test(String(workspaceId))) throw fail('workspaceId must be a valid workspace id.', 400, { code: 'INVALID_ID' });
      noteWorkspace(String(workspaceId), null, 'named in the call');
      return String(workspaceId);
    }
    const listed = await call('/workspaces', null);
    const active = (Array.isArray(listed.data) ? listed.data : []).filter((w) => w && w.status === 'active')
      .map((w) => ({ id: String(w.id), name: String(w.name || ''), isDefault: w.isDefault === true }))
      // The account's default workspace first: it is where a customer who never asked for separation belongs.
      .sort((x, y) => Number(y.isDefault) - Number(x.isDefault));
    if (active.length === 1) {
      noteWorkspace(active[0].id, active[0].name, 'the only workspace this connection covers');
      return active[0].id;
    }
    if (active.length === 0) throw fail('This authorization covers no workspace. Reconnect it and choose at least one workspace.', 409, { code: 'NO_WORKSPACE' });
    const suggested = active.find((w) => w.isDefault) || null;
    const label = (w) => `${w.name}${w.isDefault ? ' (default)' : ''} (${w.id})`;
    throw fail(
      `This authorization covers several workspaces; pass workspaceId. Ask the person which to use${suggested ? `, offering the default first` : ''}. Choose one of: ${active.map(label).join(', ')}.`,
      400,
      { code: 'WORKSPACE_REQUIRED', workspaces: active, suggestedWorkspaceId: suggested ? suggested.id : null },
    );
  }

  function workspaceTool(tool, path) {
    return async (args = {}) => {
      assertToolAllowed(server, tool, claims.scopes);
      const workspaceId = await resolveWorkspace(args.workspaceId);
      return call(path, workspaceId);
    };
  }

  client.commsGetReadiness = workspaceTool('comms_get_readiness', '/readiness');
  client.commsGetMap = workspaceTool('comms_get_map', '/map');

  // A template is read by id (saved) or as an unsaved draft; exactly one of the two. The agent must not guess which wins.
  function checkDraft(a) {
    const hasId = a.templateId !== undefined && a.templateId !== null;
    const hasDraft = typeof a.bodyHtml === 'string' || typeof a.bodyText === 'string';
    if (hasId && !UUID.test(String(a.templateId))) throw fail('templateId must be a valid id.', 400, { code: 'INVALID_ID' });
    if (hasId && hasDraft) throw fail('Give templateId OR a draft (subject with bodyHtml/bodyText), not both.', 400, { code: 'AMBIGUOUS_TEMPLATE' });
    if (!hasId && !hasDraft) throw fail('Give templateId, or subject with bodyHtml or bodyText.', 400, { code: 'MISSING_TEMPLATE' });
  }

  // The Comms API returns whole lists; a tool never does. A page is a slice with its own totals.
  function pageOf(body, a) {
    if (!body || !Array.isArray(body.data)) return body;
    const limit = Math.min(Math.max(Number.isInteger(a.limit) ? a.limit : DEFAULT_PAGE, 1), MAX_PAGE);
    const offset = Math.max(Number.isInteger(a.offset) ? a.offset : 0, 0);
    const data = body.data.slice(offset, offset + limit);
    return { ...body, data, page: { total: body.data.length, limit, offset, returned: data.length, truncated: offset + data.length < body.data.length } };
  }

  // M3-1: the read family, generated from one table (commsReadTools.js). Order of checks: scope, ids, draft, workspace, then the network.
  for (const row of COMMS_READ_TOOLS) {
    client[row.method] = async (args = {}) => {
      assertToolAllowed(server, row.tool, claims.scopes);
      for (const key of row.ids || []) {
        if (!UUID.test(String(args[key] ?? ''))) throw fail(`${key} must be a valid id.`, 400, { code: 'INVALID_ID' });
      }
      if (row.draft) checkDraft(args);
      const workspace = row.account ? null : await resolveWorkspace(args.workspaceId);
      const out = await call(row.path(args), workspace, row.http === 'POST' ? { method: 'POST', body: row.body(args) } : {});
      return row.paged ? pageOf(out, args) : out;
    };
  }
  // M3-2: the write family (dry run by default; see commsWrites.js).
  attachCommsWrites(client, { claims, server, call, resolveWorkspace, fail, UUID });
  // M3-3: contacts (masked reads; dry-run-by-default writes; see commsContacts.js).
  attachCommsContacts(client, { claims, server, call, resolveWorkspace, fail, UUID });
  // M3-4: campaign drafts, preflight and the owner-only test send (see commsCampaigns.js).
  attachCommsCampaigns(client, { claims, server, call, resolveWorkspace, fail, UUID });
  // M3-5: schedule and cancel (the step that emails people; see commsSend.js).
  attachCommsSend(client, { claims, server, call, resolveWorkspace, fail, UUID });
  // M3-6: reporting reads (masked, with their basis; see commsReports.js).
  attachCommsReports(client, { claims, server, call, resolveWorkspace, fail, UUID });
  // M3-7: workspace settings and webhooks (manage scopes; see commsManage.js).
  attachCommsManage(client, { claims, server, call, resolveWorkspace, fail, UUID });

  // Say which workspace a call used ("Working in: ..."), for every workspace-bound comms method. An object result gains `workingIn`;
  // a call that touched no workspace (account-level) is left exactly as it was.
  for (const method of Object.keys(client).filter((k) => !before.has(k))) {
    const inner = client[method];
    if (typeof inner !== 'function') continue;
    client[method] = (...args) => {
      const ctx = {};
      return callContext.run(ctx, async () => {
        const out = await inner.apply(client, args);
        return ctx.workingIn && out && typeof out === 'object' && !Array.isArray(out) ? { ...out, workingIn: ctx.workingIn } : out;
      });
    };
  }
  return client;
}
