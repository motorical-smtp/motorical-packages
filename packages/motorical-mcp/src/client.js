/**
 * Thin Motorical HTTP client for MCP tools.
 * Auth rules match docs.motorical.com (mk_live_ → /v1/send; ak_live_ → mint bearer).
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import {
  loadCredentials, saveCredentials, isExpired, discover, refreshTokens,
} from './oauth.js';

const DEFAULT_API_BASE = 'https://api.motorical.com';
const DEFAULT_DOCS_BASE = 'https://docs.motorical.com';

/**
 * Per-call forced-auth context for withAuth()/request(). This is a module-
 * level AsyncLocalStorage, not an instance field: a plain `this._forcedAuth`
 * field set-and-restored around an await would be shared mutable state on
 * the client instance, so two overlapping withAuth() calls on the same
 * client (e.g. two concurrent tool calls sharing one MotoricalClient) could
 * stomp each other's headers depending on scheduling. ALS binds the
 * override to the async call chain that set it, so concurrent chains never
 * observe each other's context regardless of interleaving.
 */
const forcedAuthStorage = new AsyncLocalStorage();

export function loadConfig(env = process.env) {
  return {
    apiBaseUrl: (env.MOTORICAL_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, ''),
    docsBaseUrl: (env.MOTORICAL_DOCS_BASE_URL || DEFAULT_DOCS_BASE).replace(/\/$/, ''),
    mkApiKey: env.MOTORICAL_MK_API_KEY || '',
    akApiKey: env.MOTORICAL_AK_API_KEY || '',
    bearerToken: env.MOTORICAL_BEARER_TOKEN || '',
    dashboardJwt: env.MOTORICAL_JWT || '',
    motorBlockId: env.MOTORICAL_MOTOR_BLOCK_ID || '',
    defaultFrom: env.MOTORICAL_DEFAULT_FROM || '',
    // A grant from `motorical-mcp login`, when one exists.
    oauthCredentials: loadCredentials()
  };
}

export class MotoricalClient {
  constructor(config = loadConfig()) {
    this.config = config;
    /** @type {string|null} */
    this._cachedBearer = config.bearerToken || null;
    /** @type {string|null} */
    this._cachedMkKey = null;
    /**
     * An OAuth grant from `motorical-mcp login`. When present it is preferred
     * over pasted keys: it is scoped, revocable from the dashboard, and expires.
     */
    // Read ONLY from config. An implicit loadCredentials() here would make the
    // client behave differently on a machine that happens to have logged in —
    // including inside tests. loadConfig() is the one place the disk is read.
    this._oauth = config.oauthCredentials || null;
    this._oauthMeta = null;
  }

  hasOAuthSession() {
    return !!(this._oauth && this._oauth.accessToken);
  }

  /** Returns a live OAuth access token, refreshing (and rotating) if needed. */
  async oauthAccessToken({ fetchImpl } = {}) {
    if (!this.hasOAuthSession()) return null;
    if (!isExpired(this._oauth)) return this._oauth.accessToken;

    if (!this._oauth.refreshToken) {
      throw new Error('Motorical session expired and has no refresh token. Run: motorical-mcp login');
    }
    if (!this._oauthMeta) {
      this._oauthMeta = await discover(this._oauth.issuer, fetchImpl || fetch);
    }
    let tokens;
    try {
      tokens = await refreshTokens(this._oauthMeta, { refreshToken: this._oauth.refreshToken }, fetchImpl || fetch);
    } catch (err) {
      throw new Error(`Motorical session could not be refreshed (${err.message}). Run: motorical-mcp login`);
    }
    this._oauth = {
      ...this._oauth,
      accessToken: tokens.access_token,
      // Rotation is mandatory for public clients: the old refresh token is dead.
      refreshToken: tokens.refresh_token || this._oauth.refreshToken,
      scope: tokens.scope || this._oauth.scope,
      expiresAt: Date.now() + (Number(tokens.expires_in || 3600) * 1000),
    };
    try { saveCredentials(this._oauth); } catch { /* keep working in-memory */ }
    return this._oauth.accessToken;
  }

  requireMk() {
    if (this._cachedMkKey) return this._cachedMkKey;
    if (!this.config.mkApiKey) {
      throw new Error(
        'No credentials for sending. Run `motorical-mcp login`, or set MOTORICAL_MK_API_KEY (mk_live_...).'
      );
    }
    return this.config.mkApiKey;
  }

  /** Runs `fn` with these headers forced onto every request it makes. */
  async withAuth(headers, fn) {
    return forcedAuthStorage.run(headers, fn);
  }

  async request(method, path, opts = {}) {
    const { headers = {}, body } = opts;
    let { apiKey, bearer } = opts;
    const url = `${this.config.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const h = { Accept: 'application/json', ...headers };
    const forcedAuth = forcedAuthStorage.getStore();
    if (forcedAuth) {
      Object.assign(h, forcedAuth);
      apiKey = undefined;
      bearer = undefined;
    }
    if (apiKey) h.Authorization = `ApiKey ${apiKey}`;
    if (bearer) h.Authorization = `Bearer ${bearer}`;
    if (body !== undefined) h['Content-Type'] = 'application/json';

    const res = await fetch(url, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const msg = data?.error || data?.message || data?.error_description || res.statusText;
      const err = new Error(`${method} ${path} → ${res.status}: ${msg}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async mintPublicToken({ motorBlockId, scopes, ttlSeconds = 900 } = {}) {
    const blockId = motorBlockId || this.config.motorBlockId;
    const hasAk = !!this.config.akApiKey;
    const hasJwt = !!this.config.dashboardJwt;

    const missing = [];
    if (!blockId) missing.push('motorBlockId (argument or MOTORICAL_MOTOR_BLOCK_ID)');
    if (!hasAk && !hasJwt) {
      missing.push('MOTORICAL_AK_API_KEY (ak_live_... Account API key) or MOTORICAL_JWT (dashboard session)');
    }
    if (missing.length) {
      throw new Error(`Missing required to mint a public token: ${missing.join('; ')}`);
    }

    const body = {
      motorBlockId: blockId,
      scopes: scopes || ['logs.read', 'analytics.read', 'webhooks.manage', 'config.read'],
      ttlSeconds
    };

    const data = hasAk
      ? await this.request('POST', '/api/public/token/account-key', { apiKey: this.config.akApiKey, body })
      : await this.request('POST', '/api/public/token', { bearer: this.config.dashboardJwt, body });

    const token = data?.data?.token || data?.token || data?.access_token;
    if (token) this._cachedBearer = token;
    return data;
  }

  /**
   * An OAuth grant covers every Motor Block the user owned at consent time, so
   * a block-scoped request must say which one it means. (A minted public token
   * carried a single block inside the token, so this never came up before.)
   * Fails here with an actionable message rather than letting the API answer
   * with a bare 400.
   */
  _scoped(path, motorBlockId) {
    if (!this.hasOAuthSession()) return path;
    const id = motorBlockId || this.config.motorBlockId;
    if (!id) {
      throw new Error(
        'motorBlockId is required: your Motorical authorization covers multiple Motor Blocks. '
        + 'Pass motorBlockId, or set MOTORICAL_MOTOR_BLOCK_ID.'
      );
    }
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}motorBlockId=${encodeURIComponent(id)}`;
  }

  /**
   * The account-scoped counterpart to _scoped, for operations acting on the
   * ACCOUNT rather than on one Motor Block (domain management, listing the
   * blocks themselves). The backend mounts those routes with
   * { accountScoped: true } and reads only the token's user, so a block is
   * passed through when the caller has one and omitted when not — never
   * demanded, and never a reason to throw.
   */
  _accountPath(path, motorBlockId) {
    if (!this.hasOAuthSession()) return path;
    const id = motorBlockId || this.config.motorBlockId;
    if (!id) return path;
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}motorBlockId=${encodeURIComponent(id)}`;
  }

  async getBearer({ motorBlockId, forceRefresh = false } = {}) {
    // An OAuth grant supersedes minted public tokens entirely — no ak_live_ key
    // and no dashboard JWT needed.
    const oauthToken = await this.oauthAccessToken();
    if (oauthToken) return oauthToken;

    if (this._cachedBearer && !forceRefresh) return this._cachedBearer;
    const minted = await this.mintPublicToken({ motorBlockId });
    const token = minted?.data?.token || minted?.token || minted?.access_token;
    if (!token) throw new Error('Token mint succeeded but no token field in response');
    this._cachedBearer = token;
    return token;
  }

  async listMotorBlocks({ motorBlockId } = {}) {
    const bearer = await this.getBearer({ motorBlockId });
    return this.request('GET', this._accountPath('/api/public/v1/motor-blocks', motorBlockId), { bearer });
  }

  async sendEmail(payload) {
    const {
      from,
      fromName,
      to,
      subject,
      text,
      html,
      dryRun = true,
      confirmRealSend = false,
      idempotencyKey,
      headers: customHeaders,
      motorBlockId: _motorBlockId, // never in the body — see sendPath below
      ...rest
    } = payload;

    if (dryRun === false && confirmRealSend !== true) {
      throw new Error(
        'Refusing real send: set dryRun:true (default) or pass confirmRealSend:true with dryRun:false'
      );
    }

    const fromAddr = from || this.config.defaultFrom;
    if (!fromAddr) throw new Error('from is required (or set MOTORICAL_DEFAULT_FROM)');
    if (!to || (Array.isArray(to) && to.length === 0)) throw new Error('to is required');
    if (!subject) throw new Error('subject is required');
    if (!text && !html) throw new Error('At least one of text or html is required');

    const headers = {};
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const oauthToken = await this.oauthAccessToken();
    if (oauthToken && !this.config.motorBlockId && !payload.motorBlockId) {
      throw new Error(
        'motorBlockId is required to send with an OAuth authorization: it covers every Motor Block '
        + 'you own. Set MOTORICAL_MOTOR_BLOCK_ID, or pass motorBlockId.'
      );
    }
    const auth = oauthToken ? { bearer: oauthToken } : { apiKey: this.requireMk() };

    // The block goes in the query string, not the body: /v1/send validates its
    // body strictly and rejects unknown keys, and an api-key client's block
    // comes from the key itself — a body field that disagreed would be a
    // silent footgun.
    const sendPath = oauthToken
      ? `/v1/send?motorBlockId=${encodeURIComponent(payload.motorBlockId || this.config.motorBlockId)}`
      : '/v1/send';

    return this.request('POST', sendPath, {
      ...auth,
      headers,
      body: {
        from: fromAddr,
        ...(fromName ? { fromName } : {}),
        to: Array.isArray(to) ? to : [to],
        subject,
        text,
        html,
        dryRun: dryRun !== false,
        ...(customHeaders ? { headers: customHeaders } : {}),
        ...rest
      }
    });
  }

  async getMessage(messageId, { includePII = false, motorBlockId } = {}) {
    if (!messageId) throw new Error('messageId is required');
    const bearer = await this.getBearer({ motorBlockId });
    const q = includePII ? '?includePII=true' : '';
    return this.request('GET', this._scoped(`/api/public/v1/messages/${encodeURIComponent(messageId)}${q}`, motorBlockId), { bearer });
  }

  async getMessageEvents(messageId, { includePII = false, motorBlockId } = {}) {
    if (!messageId) throw new Error('messageId is required');
    const bearer = await this.getBearer({ motorBlockId });
    const q = includePII ? '?includePII=true' : '';
    return this.request('GET', this._scoped(`/api/public/v1/messages/${encodeURIComponent(messageId)}/events${q}`, motorBlockId), { bearer });
  }

  async getSendApiStatus() {
    return this.request('GET', '/v1/status');
  }

  requireDashboardJwt() {
    if (!this.config.dashboardJwt) {
      throw new Error(
        'MOTORICAL_JWT is required for developer sandbox tools (dashboard session from motorical login / set-password)'
      );
    }
    return this.config.dashboardJwt;
  }

  async sandboxStatus() {
    const result = await this.request('GET', '/api/developer/sandbox', {
      bearer: this.requireDashboardJwt()
    });
    // A returning agent that calls status instead of re-provisioning still
    // needs motorBlockId for mintPublicToken()/getBearer() (message lookup).
    const blockId = result?.data?.motorBlock?.id;
    if (blockId && !this.config.motorBlockId) this.config.motorBlockId = blockId;
    return result;
  }

  async sandboxProvision({ handle, channel = 'agent' } = {}) {
    const result = await this.request('POST', '/api/developer/sandbox/provision', {
      bearer: this.requireDashboardJwt(),
      body: { handle, channel }
    });
    const mkKey = result?.data?.credentials?.mkApiKey;
    if (mkKey && !this.config.mkApiKey) this._cachedMkKey = mkKey;
    // Without this a cold JWT-only agent can send but never track: getBearer()
    // throws 'motorBlockId is required'. Same precedence rule as mkApiKey —
    // an explicit MOTORICAL_MOTOR_BLOCK_ID always wins.
    const blockId = result?.data?.motorBlock?.id;
    if (blockId && !this.config.motorBlockId) this.config.motorBlockId = blockId;
    return result;
  }

  async sandboxConvert({ domainId }) {
    if (!domainId) throw new Error('domainId is required');
    return this.request('POST', '/api/developer/sandbox/convert', {
      bearer: this.requireDashboardJwt(),
      body: { domainId }
    });
  }

  // These four target the public API the same way listMotorBlocks/getMessage
  // do — never branching on oauthAccessToken() to pick a URL. That branch was
  // the bug: it's null for a delegated call by design (no stored session,
  // auth travels per-call instead), so every one of these calls fell through
  // to /api/domains, which rejects a Delegation header outright.
  //
  // One narrow exception, preserved on purpose: a dashboard-JWT-only caller
  // (no OAuth session, MOTORICAL_JWT set directly) with NO motor block
  // configured yet — the state a brand-new customer is in before their first
  // Motor Block exists, but domains are account-wide and this account may
  // already need one added. mintPublicToken() hard-requires a motorBlockId
  // it doesn't have; /api/domains doesn't need one at all. A delegated call
  // never hits this branch — resolveBlock() in delegatedClient.js always
  // supplies a real motorBlockId before any of these run.
  hasNoBlockToScopeAPublicToken(motorBlockId) {
    // _delegated is set by delegatedClient.js's callView. A delegated call is
    // never the legacy dashboard-JWT caller this fallback exists for: its
    // dashboardJwt is a placeholder, not a credential, so taking this branch
    // means authenticating the dashboard route with the string
    // 'mcp-delegated' — a guaranteed 401. This used to be unreachable because
    // resolveBlock() always supplied a block; account-scoped tools now supply
    // none, so the guard has to be explicit. Found live 2026-09-02.
    if (this._delegated) return false;
    return !(motorBlockId || this.config.motorBlockId) && !this.hasOAuthSession();
  }

  async domainList({ motorBlockId } = {}) {
    if (this.hasNoBlockToScopeAPublicToken(motorBlockId) && this.config.dashboardJwt) {
      return this.request('GET', '/api/domains', { bearer: this.requireDashboardJwt() });
    }
    const bearer = await this.getBearer({ motorBlockId });
    return this.request('GET', this._accountPath('/api/public/v1/domains', motorBlockId), { bearer });
  }

  async domainAdd({ domain, verificationMethod = 'dns', motorBlockId } = {}) {
    if (!domain) throw new Error('domain is required');
    if (this.hasNoBlockToScopeAPublicToken(motorBlockId) && this.config.dashboardJwt) {
      return this.request('POST', '/api/domains', {
        bearer: this.requireDashboardJwt(),
        body: { domain, verificationMethod }
      });
    }
    const bearer = await this.getBearer({ motorBlockId });
    return this.request('POST', this._accountPath('/api/public/v1/domains', motorBlockId), {
      bearer,
      body: { domain, verificationMethod }
    });
  }

  async domainVerify({ domainId, method = 'dns', motorBlockId } = {}) {
    if (!domainId) throw new Error('domainId is required');
    if (this.hasNoBlockToScopeAPublicToken(motorBlockId) && this.config.dashboardJwt) {
      return this.request('POST', `/api/domains/${encodeURIComponent(domainId)}/verify`, {
        bearer: this.requireDashboardJwt(),
        body: { method }
      });
    }
    const bearer = await this.getBearer({ motorBlockId });
    return this.request(
      'POST',
      this._accountPath(`/api/public/v1/domains/${encodeURIComponent(domainId)}/verify`, motorBlockId),
      { bearer, body: { method } }
    );
  }

  async domainCheckDns({ domainId, recordType, motorBlockId } = {}) {
    if (!domainId) throw new Error('domainId is required');
    if (this.hasNoBlockToScopeAPublicToken(motorBlockId) && this.config.dashboardJwt) {
      return this.request('POST', `/api/domains/${encodeURIComponent(domainId)}/check-dns`, {
        bearer: this.requireDashboardJwt(),
        body: recordType ? { recordType } : {}
      });
    }
    const bearer = await this.getBearer({ motorBlockId });
    return this.request(
      'POST',
      this._accountPath(`/api/public/v1/domains/${encodeURIComponent(domainId)}/check-dns`, motorBlockId),
      { bearer, body: recordType ? { recordType } : {} }
    );
  }

  async sandboxAllowlistRequest({ email } = {}) {
    if (!email) throw new Error('email is required');
    return this.request('POST', '/api/developer/sandbox/allowlist/request', {
      bearer: this.requireDashboardJwt(),
      body: { email }
    });
  }

  async sandboxAllowlistConfirm({ email, code } = {}) {
    if (!email) throw new Error('email is required');
    if (!code) throw new Error('code is required');
    return this.request('POST', '/api/developer/sandbox/allowlist/confirm', {
      bearer: this.requireDashboardJwt(),
      body: { email, code }
    });
  }

  async webHandoff({ path } = {}) {
    return this.request('POST', '/api/auth/web-handoff', {
      bearer: this.requireDashboardJwt(),
      body: path ? { path } : {}
    });
  }

  async fetchDocs(path = '/llms.txt') {
    const url = `${this.config.docsBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Docs fetch ${url} → ${res.status}`);
    return res.text();
  }
}
