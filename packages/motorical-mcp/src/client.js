/**
 * Thin Motorical HTTP client for MCP tools.
 * Auth rules match docs.motorical.com (mk_live_ → /v1/send; ak_live_ → mint bearer).
 */

import {
  loadCredentials, saveCredentials, isExpired, discover, refreshTokens,
} from './oauth.js';

const DEFAULT_API_BASE = 'https://api.motorical.com';
const DEFAULT_DOCS_BASE = 'https://docs.motorical.com';

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

  async request(method, path, { headers = {}, body, apiKey, bearer } = {}) {
    const url = `${this.config.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const h = { Accept: 'application/json', ...headers };
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
    return this.request('GET', this._scoped('/api/public/v1/motor-blocks', motorBlockId), { bearer });
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

  async domainList() {
    // An OAuth grant reads the scoped public endpoint. It cannot use
    // /api/domains: that route is behind the dashboard-session middleware,
    // which also guards billing and account settings.
    const oauthToken = await this.oauthAccessToken();
    if (oauthToken) {
      // Domains are account-wide, but authenticatePublic keeps MCP grants
      // strictly block-bound rather than silently choosing one, so the
      // selector travels here too. The endpoint scopes by user, not by block.
      return this.request('GET', this._scoped('/api/public/v1/domains'), { bearer: oauthToken });
    }
    return this.request('GET', '/api/domains', {
      bearer: this.requireDashboardJwt()
    });
  }

  async domainAdd({ domain, verificationMethod = 'dns' } = {}) {
    if (!domain) throw new Error('domain is required');
    return this.request('POST', '/api/domains', {
      bearer: this.requireDashboardJwt(),
      body: { domain, verificationMethod }
    });
  }

  async domainVerify({ domainId, method = 'dns' } = {}) {
    if (!domainId) throw new Error('domainId is required');
    return this.request('POST', `/api/domains/${encodeURIComponent(domainId)}/verify`, {
      bearer: this.requireDashboardJwt(),
      body: { method }
    });
  }

  async domainCheckDns({ domainId, recordType } = {}) {
    if (!domainId) throw new Error('domainId is required');
    return this.request('POST', `/api/domains/${encodeURIComponent(domainId)}/check-dns`, {
      bearer: this.requireDashboardJwt(),
      body: recordType ? { recordType } : {}
    });
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
