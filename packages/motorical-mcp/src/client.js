/**
 * Thin Motorical HTTP client for MCP tools.
 * Auth rules match docs.motorical.com (mk_live_ → /v1/send; ak_live_ → mint bearer).
 */

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
    defaultFrom: env.MOTORICAL_DEFAULT_FROM || ''
  };
}

export class MotoricalClient {
  constructor(config = loadConfig()) {
    this.config = config;
    /** @type {string|null} */
    this._cachedBearer = config.bearerToken || null;
    /** @type {string|null} */
    this._cachedMkKey = null;
  }

  requireMk() {
    if (this._cachedMkKey) return this._cachedMkKey;
    if (!this.config.mkApiKey) {
      throw new Error('MOTORICAL_MK_API_KEY is required (mk_live_... Motor Block API key for POST /v1/send)');
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

  async getBearer({ motorBlockId, forceRefresh = false } = {}) {
    if (this._cachedBearer && !forceRefresh) return this._cachedBearer;
    const minted = await this.mintPublicToken({ motorBlockId });
    const token = minted?.data?.token || minted?.token || minted?.access_token;
    if (!token) throw new Error('Token mint succeeded but no token field in response');
    this._cachedBearer = token;
    return token;
  }

  async listMotorBlocks({ motorBlockId } = {}) {
    const bearer = await this.getBearer({ motorBlockId });
    return this.request('GET', '/api/public/v1/motor-blocks', { bearer });
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

    return this.request('POST', '/v1/send', {
      apiKey: this.requireMk(),
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
    return this.request('GET', `/api/public/v1/messages/${encodeURIComponent(messageId)}${q}`, { bearer });
  }

  async getMessageEvents(messageId, { includePII = false, motorBlockId } = {}) {
    if (!messageId) throw new Error('messageId is required');
    const bearer = await this.getBearer({ motorBlockId });
    const q = includePII ? '?includePII=true' : '';
    return this.request('GET', `/api/public/v1/messages/${encodeURIComponent(messageId)}/events${q}`, { bearer });
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
