'use strict';
// Hand-written core of the Motorical Node SDK. The operation table (operations.js) and the typings are generated from
// openapi.json by packages/sdk-generator; this file turns one operation plus its arguments into an HTTP request.

const DEFAULT_BASE_URL = 'https://api.motorical.com';

class MotoricalError extends Error {
  constructor({ status, code, message, requestId, body }) {
    super(message || code || `HTTP ${status}`);
    this.name = 'MotoricalError';
    this.status = status;          // HTTP status
    this.code = code || null;      // stable error code: branch on this (docs.motorical.com/api-reference/errors)
    this.requestId = requestId || null; // quote to support
    this.body = body;              // the full error body
  }
}

function headerFor(kind, creds) {
  if (kind === 'apiKey' && creds.apiKey) return ['Authorization', `ApiKey ${creds.apiKey}`];
  if (kind === 'accountKey' && creds.accountKey) return ['Authorization', `ApiKey ${creds.accountKey}`];
  if (kind === 'bearerToken' && creds.bearerToken) return ['Authorization', `Bearer ${creds.bearerToken}`];
  if (kind === 'dashboardToken' && creds.dashboardToken) return ['Authorization', `Bearer ${creds.dashboardToken}`];
  return null;
}

function buildRequest(op, args = {}, config = {}) {
  const a = { ...args };
  let path = op.path;
  for (const name of op.pathParams) {
    if (a[name] === undefined || a[name] === null || a[name] === '') throw new TypeError(`${op.id}: missing path parameter "${name}"`);
    path = path.replace(`{${name}}`, encodeURIComponent(String(a[name])));
    delete a[name];
  }
  const qs = new URLSearchParams();
  for (const q of op.query) {
    if (a[q.name] !== undefined && a[q.name] !== null) qs.set(q.name, String(a[q.name]));
    else if (q.required) throw new TypeError(`${op.id}: missing query parameter "${q.name}"`);
    delete a[q.name];
  }
  const headers = { Accept: 'application/json', 'User-Agent': config.userAgent || 'motorical-sdk-node' };
  for (const h of op.headers) {
    const key = h.name.replace(/-([a-z])/gi, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toLowerCase());
    const v = a[h.name] !== undefined ? a[h.name] : a[key];
    if (v !== undefined && v !== null) headers[h.name] = String(v);
    else if (h.required) throw new TypeError(`${op.id}: missing header "${h.name}"`);
    delete a[h.name]; delete a[key];
  }
  // Authentication: the first credential the operation accepts that is configured (in the operation's order).
  for (const kind of op.auth) {
    if (kind === 'workspace') continue;
    const h = headerFor(kind, config);
    if (h) { headers[h[0]] = h[1]; break; }
  }
  if (op.auth.includes('workspace')) {
    const ws = a.workspaceId || config.workspaceId;
    if (!ws) throw new TypeError(`${op.id}: needs a Communications workspace id (workspaceId)`);
    headers['X-Tenant-Id'] = String(ws);
    delete a.workspaceId;
    // Communications calls authenticate the caller with the account key, or else a dashboard session.
    if (!headers.Authorization) {
      const h = headerFor('accountKey', config) || headerFor('dashboardToken', config);
      if (h) headers[h[0]] = h[1];
    }
  }
  let body;
  if (op.body) {
    const payload = a.body !== undefined ? a.body : undefined;
    if (payload === undefined && op.bodyRequired) throw new TypeError(`${op.id}: missing body`);
    if (payload !== undefined) { body = JSON.stringify(payload); headers['Content-Type'] = 'application/json'; }
  }
  // An operation served by another host (the Communications API on motorical.com) names its own server; commsBaseUrl
  // overrides it, baseUrl overrides everything else.
  const base = (op.server ? (config.commsBaseUrl || op.server) : (config.baseUrl || DEFAULT_BASE_URL)).replace(/\/$/, '');
  const url = `${base}${path}${qs.toString() ? `?${qs}` : ''}`;
  return { method: op.method, url, headers, body };
}

async function execute(op, args, config) {
  const req = buildRequest(op, args, config);
  const fetchImpl = config.fetch || globalThis.fetch;
  const res = await fetchImpl(req.url, { method: req.method, headers: req.headers, body: req.body });
  const requestId = res.headers && typeof res.headers.get === 'function' ? res.headers.get('x-request-id') : null;
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* not JSON, e.g. a CSV export */ }
  if (!res.ok) {
    const b = data && typeof data === 'object' ? data : {};
    throw new MotoricalError({ status: res.status, code: b.code, message: b.message || b.error, requestId: b.requestId || requestId, body: data });
  }
  return data;
}

module.exports = { buildRequest, execute, MotoricalError, DEFAULT_BASE_URL };
