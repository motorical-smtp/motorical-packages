#!/usr/bin/env node
/**
 * Motorical CLI — developer sandbox onboarding + send helpers.
 * Usage: motorical <command> [options]
 */
import { homedir } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const DEFAULT_API = 'https://api.motorical.com';
const CONFIG_DIR = join(homedir(), '.config', 'motorical');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(patch) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const next = { ...loadConfig(), ...patch, updatedAt: new Date().toISOString() };
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

function clearConfig() {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH);
}

function apiBase(cfg = loadConfig()) {
  return (process.env.MOTORICAL_API_BASE_URL || cfg.apiBaseUrl || DEFAULT_API).replace(/\/$/, '');
}

function persistSession(email, data, extra = {}) {
  const accessToken = data?.token || data?.accessToken || data?.data?.token;
  const refreshToken = data?.refreshToken || data?.data?.refreshToken;
  const patch = { ...extra };
  if (email) patch.email = email;
  if (accessToken) patch.accessToken = accessToken;
  if (refreshToken) patch.refreshToken = refreshToken;
  return saveConfig(patch);
}

async function refreshAccessToken() {
  const cfg = loadConfig();
  const refreshToken = process.env.MOTORICAL_REFRESH_TOKEN || cfg.refreshToken;
  if (!refreshToken) {
    throw new Error('No refreshToken stored. Run: motorical login  (or motorical verify)');
  }
  const data = await api(
    'POST',
    '/api/auth/refresh',
    { body: { refreshToken } },
    { _retried: true }
  );
  persistSession(cfg.email, data);
  return data.token || data.accessToken;
}

async function api(method, path, { token, body, apiKey } = {}, { _retried } = {}) {
  const url = `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers.Authorization = `ApiKey ${apiKey}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
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
    const isAuthPath = path.includes('/auth/refresh') || path.includes('/auth/login');
    if (
      res.status === 401 &&
      !_retried &&
      !isAuthPath &&
      !apiKey &&
      (loadConfig().refreshToken || process.env.MOTORICAL_REFRESH_TOKEN)
    ) {
      try {
        const next = await refreshAccessToken();
        return api(method, path, { token: next, body, apiKey }, { _retried: true });
      } catch {
        // fall through to original error
      }
    }
    const msg = data?.error || data?.message || res.statusText;
    const err = new Error(`${method} ${path} → ${res.status}: ${msg}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function prompt(question, { silent = false } = {}) {
  if (!silent) {
    const rl = createInterface({ input, output });
    try {
      return (await rl.question(question)).trim();
    } finally {
      rl.close();
    }
  }
  // Minimal silent (password) — still echoes on some terminals; prefer env.
  process.stdout.write(question);
  return new Promise((resolve) => {
    let buf = '';
    const onData = (c) => {
      const s = c.toString();
      if (s === '\n' || s === '\r' || s === '\r\n') {
        process.stdin.off('data', onData);
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.stdout.write('\n');
        resolve(buf.trim());
      } else if (s === '\u0003') {
        process.exit(130);
      } else {
        buf += s;
      }
    };
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

function printJson(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function requireToken(cfg = loadConfig()) {
  const token = process.env.MOTORICAL_JWT || cfg.accessToken;
  if (!token) {
    throw new Error('Not logged in. Run: motorical login  (or motorical signup)');
  }
  return token;
}

async function cmdSignup(args) {
  const email = args[0] || (await prompt('Email: '));
  const channel = args.includes('--agent') ? 'agent' : 'cli';
  const data = await api('POST', '/api/auth/register', {
    body: { email, onboardingChannel: channel }
  }).catch(async (err) => {
    // register may not accept onboardingChannel — retry minimal
    if (err.status === 400 || err.status === 422) {
      return api('POST', '/api/auth/register', { body: { email } });
    }
    throw err;
  });
  saveConfig({ email, onboardingChannel: channel, pendingSignup: true });
  console.log('Verification code sent to', email);
  console.log(data?.message || 'Check your inbox, then: motorical verify <code>');
}

async function cmdVerify(args) {
  const cfg = loadConfig();
  const resume = args.includes('--resume');
  const code = args.find((a) => /^\d{6}$/.test(a));
  const email =
    args.find((a) => a.includes('@')) ||
    cfg.email ||
    (await prompt('Email: '));
  const channel = args.includes('--agent') || cfg.onboardingChannel === 'agent' ? 'agent' : 'cli';

  if (!resume) {
    if (!code) {
      throw new Error('Usage: motorical verify <6-digit-code> [email]   or: motorical verify --resume [email]');
    }
    await api('POST', '/api/auth/verify-code', { body: { email, code } });
  } else {
    console.log('Resume: skipping verify-code (account already verified, setting password only)');
  }

  // Prefer a browser-chosen password. CLI may set a temporary one so the
  // session JWT works; web handoff then forces establish-password.
  let password = process.env.MOTORICAL_PASSWORD || '';
  let temporary = false;
  if (!password) {
    const { randomBytes } = await import('node:crypto');
    password = `Tmp.${randomBytes(18).toString('base64url')}`;
    temporary = true;
  }
  const set = await api('POST', '/api/auth/set-password', {
    body: { email, password, channel }
  });
  const token = set?.token || set?.accessToken || set?.data?.token;
  if (!token) {
    const login = await api('POST', '/api/auth/login', { body: { email, password } });
    persistSession(email, login, {
      pendingSignup: false,
      onboardingChannel: channel,
      cliPasswordPending: true
    });
  } else {
    persistSession(email, set, {
      pendingSignup: false,
      onboardingChannel: channel,
      cliPasswordPending: true
    });
  }
  console.log('Account ready.');
  if (temporary) {
    console.log('Next: motorical sandbox provision');
    console.log('Then open the dashboard and choose your password:');
    console.log('  motorical open');
  } else {
    console.log('Next: motorical sandbox provision  ·  then: motorical open');
  }
}

async function cmdOpen(args) {
  const token = requireToken();
  const pathIdx = args.indexOf('--path');
  const path = pathIdx >= 0 ? args[pathIdx + 1] : undefined;
  const data = await api('POST', '/api/auth/web-handoff', {
    token,
    body: path ? { path } : {}
  });
  const url = data.url || data.data?.url;
  if (!url) throw new Error('No handoff URL returned');
  console.log(url);
  if (data.requirePasswordSetup) {
    console.log('\nBrowser will ask you to set a dashboard password (CLI onboarding).');
  }
  // Best-effort open on macOS/linux when not --print-only
  if (!args.includes('--print-only')) {
    try {
      const { spawn } = await import('node:child_process');
      const opener =
        process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
      console.log('Opened in your browser.');
    } catch {
      console.log('Open the URL above in your browser.');
    }
  }
}

async function cmdLogin(args) {
  const email = args[0] || (await prompt('Email: '));
  const password =
    process.env.MOTORICAL_PASSWORD || (await prompt('Password: ', { silent: true }));
  const login = await api('POST', '/api/auth/login', { body: { email, password } });
  const token = login.token || login.accessToken || login.data?.token;
  if (!token) throw new Error('Login succeeded but no token in response');
  persistSession(email, login, { pendingSignup: false });
  console.log('Logged in as', email);
  if (login.refreshToken) {
    console.log('Refresh token stored (motorical refresh / auto on 401).');
  }
}

async function cmdRefresh() {
  await refreshAccessToken();
  console.log('Access token refreshed.');
}

async function cmdLogout() {
  clearConfig();
  console.log('Logged out (local config cleared)');
}

async function cmdSandboxProvision(args) {
  const token = requireToken();
  const handleIdx = args.indexOf('--handle');
  const handle = handleIdx >= 0 ? args[handleIdx + 1] : undefined;
  const channel = args.includes('--agent') ? 'agent' : 'cli';
  const data = await api('POST', '/api/developer/sandbox/provision', {
    token,
    body: { handle, channel }
  });
  const creds = data?.data?.credentials;
  if (creds?.mkApiKey) {
    saveConfig({
      mkApiKey: creds.mkApiKey,
      motorBlockId: data.data.motorBlock?.id,
      sandboxDomain: data.data.domain?.domain,
      defaultFrom: creds.fromAddress,
      smtpUsername: creds.smtp?.username,
      smtpPassword: creds.smtp?.password
    });
  }
  printJson(data);
  if (creds?.mkApiKey) {
    console.log('\nCredentials saved to', CONFIG_PATH);
    console.log('Try: motorical send --to you@example.com --subject "hi" --text "hello"');
    console.log('Dashboard (set your password): motorical open');
  }
}

async function cmdSandboxStatus() {
  const token = requireToken();
  const data = await api('GET', '/api/developer/sandbox', { token });
  printJson(data);
}

async function cmdSend(args) {
  const cfg = loadConfig();
  const mk = process.env.MOTORICAL_MK_API_KEY || cfg.mkApiKey;
  if (!mk) throw new Error('No mk_live key. Run sandbox provision or set MOTORICAL_MK_API_KEY');

  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const dryRun = !args.includes('--real');
  const to = get('--to') || cfg.email;
  const subject = get('--subject') || 'Motorical sandbox test';
  const text = get('--text') || 'Hello from Motorical CLI (sandbox).';
  const from = get('--from') || cfg.defaultFrom;
  const fromName = get('--from-name');
  if (!to || !from) {
    throw new Error('Need --to and --from (or provisioned defaultFrom / config email)');
  }

  const data = await api('POST', '/v1/send', {
    apiKey: mk,
    body: { from, to, subject, text, dryRun, ...(fromName ? { fromName } : {}) }
  });
  printJson(data);
  if (dryRun) {
    console.log('\n(dry-run default). Pass --real to attempt a live send (allowlist enforced).');
  }
}

async function cmdDomainAdd(args) {
  const token = requireToken();
  const domain = args[0];
  if (!domain) throw new Error('Usage: motorical domain add example.com');
  const data = await api('POST', '/api/domains', {
    token,
    body: { domain, verificationMethod: 'dns' }
  });
  printJson(data);
  console.log('\nAdd the DNS records shown in the dashboard / response, then: motorical domain verify', data?.data?.id || data?.domain?.id || '<domainId>');
}

async function cmdDomainVerify(args) {
  const token = requireToken();
  const domainId = args[0];
  if (!domainId) throw new Error('Usage: motorical domain verify <domainId>');
  const data = await api('POST', `/api/domains/${domainId}/verify`, {
    token,
    body: { method: 'dns' }
  });
  printJson(data);
  if (data?.sendReady === false) {
    console.log(
      '\nOwnership ok but not send-ready yet. After DNS propagates, re-run verify or: motorical domain check-dns',
      domainId
    );
  } else if (data?.sendReady) {
    console.log('\nSend-ready: DKIM + SPF flags set. You can POST /v1/send from this domain.');
  }
}

async function cmdDomainCheckDns(args) {
  const token = requireToken();
  const domainId = args[0];
  if (!domainId) throw new Error('Usage: motorical domain check-dns <domainId>');
  const recordType = args.includes('--record')
    ? args[args.indexOf('--record') + 1]
    : undefined;
  const data = await api('POST', `/api/domains/${domainId}/check-dns`, {
    token,
    body: recordType ? { recordType } : {}
  });
  printJson(data);
  if (data?.sendReady) {
    console.log('\nSend-ready for /v1/send.');
  } else {
    console.log('\nNot send-ready yet. Fix DNS from summary, wait for propagation, retry.');
  }
}

async function resolveCheckoutPlanId(explicitPlan) {
  const listed = await api('GET', '/api/billing/plans');
  const plans = Array.isArray(listed?.plans) ? listed.plans : Array.isArray(listed) ? listed : [];
  if (!plans.length) {
    throw new Error('No active plans from GET /api/billing/plans');
  }

  if (explicitPlan) {
    const byId = plans.find((p) => p.id === explicitPlan);
    if (byId) return byId.id;
    const needle = String(explicitPlan).toLowerCase().replace(/[_-]+/g, ' ').trim();
    const byName = plans.find((p) => String(p.name || '').toLowerCase() === needle)
      || plans.find((p) => String(p.name || '').toLowerCase().includes(needle));
    if (byName) return byName.id;
    // Allow raw UUID even if not in list (edge)
    if (/^[0-9a-f-]{36}$/i.test(explicitPlan)) return explicitPlan;
    throw new Error(
      `Unknown plan "${explicitPlan}". Available: ${plans.map((p) => `${p.name} (${p.id})`).join(', ')}`
    );
  }

  const entry =
    plans.find((p) => String(p.name || '').toLowerCase() === 'motorical plan') ||
    plans.find((p) => String(p.name || '').toLowerCase().includes('motorical')) ||
    plans[0];
  return entry.id;
}

async function cmdConvert(args) {
  const token = requireToken();
  const domainId = args.find((a, i) => args[i - 1] === '--domain-id') || args[0];
  if (args.includes('--checkout')) {
    const explicitPlan = args.find((a, i) => args[i - 1] === '--plan');
    const planId = await resolveCheckoutPlanId(explicitPlan);
    const planMeta = (await api('GET', '/api/billing/plans')).plans?.find((p) => p.id === planId);
    const body = {
      planId,
      successUrl: 'https://motorical.com/billing?sandbox=converted',
      cancelUrl: 'https://motorical.com/billing?sandbox=cancel'
    };
    try {
      const checkout = await api('POST', '/api/billing/create-checkout-session', {
        token,
        body
      });
      console.log(
        `Checkout for ${planMeta?.name || planId} (${planId})${planMeta?.amount != null ? ` — ${planMeta.amount / 100} ${String(planMeta.currency || 'eur').toUpperCase()}/mo` : ''}`
      );
      console.log('Open checkout URL:');
      console.log(checkout.url || checkout.data?.url || checkout);
      console.log('\nAfter subscription is active and your real domain is verified:');
      console.log('  motorical convert --domain-id <uuid>');
      return;
    } catch (e) {
      console.error('Checkout failed:', e.message);
      console.error('Use the dashboard billing page, then convert with --domain-id');
      throw e;
    }
  }
  if (!domainId || domainId === '--checkout') {
    throw new Error('Usage: motorical convert --checkout [--plan <name|uuid>] | motorical convert --domain-id <uuid>');
  }
  const data = await api('POST', '/api/developer/sandbox/convert', {
    token,
    body: { domainId }
  });
  printJson(data);
  saveConfig({
    developerSandbox: false,
    sandboxDomain: null,
    defaultFrom: data?.data?.domain ? `noreply@${data.data.domain}` : undefined
  });
}

function help() {
  console.log(`Motorical CLI — developer sandbox onboarding

Usage:
  motorical signup [email] [--agent]
  motorical verify [code] [email]
  motorical verify --resume [email]   # already-verified, password-less account
  motorical login [email]
  motorical refresh                 # rotate access JWT via stored refreshToken
  motorical logout
  motorical open [--path /usage] [--print-only]
  motorical sandbox provision [--handle name] [--agent]
  motorical sandbox status
  motorical send --to addr --from addr [--from-name "Display"] [--subject s] [--text t] [--real]
  motorical domain add example.com
  motorical domain verify <domainId>       # ownership + refreshes DKIM/SPF send-ready flags
  motorical domain check-dns <domainId>    # flip dkim_configured/spf_configured after DNS is live
  motorical convert --checkout [--plan <name|uuid>]
  motorical convert --domain-id <uuid>

Config: ${CONFIG_PATH}
API:    ${apiBase()} (override MOTORICAL_API_BASE_URL)
`);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  try {
    switch (cmd) {
      case 'signup':
        await cmdSignup(rest);
        break;
      case 'verify':
        await cmdVerify(rest);
        break;
      case 'login':
        await cmdLogin(rest);
        break;
      case 'refresh':
        await cmdRefresh();
        break;
      case 'logout':
        await cmdLogout();
        break;
      case 'open':
        await cmdOpen(rest);
        break;
      case 'sandbox':
        if (rest[0] === 'provision') await cmdSandboxProvision(rest.slice(1));
        else if (rest[0] === 'status') await cmdSandboxStatus();
        else help();
        break;
      case 'send':
        await cmdSend(rest);
        break;
      case 'domain':
        if (rest[0] === 'add') await cmdDomainAdd(rest.slice(1));
        else if (rest[0] === 'verify') await cmdDomainVerify(rest.slice(1));
        else if (rest[0] === 'check-dns') await cmdDomainCheckDns(rest.slice(1));
        else help();
        break;
      case 'convert':
        await cmdConvert(rest);
        break;
      case 'help':
      case undefined:
        help();
        break;
      default:
        console.error('Unknown command:', cmd);
        help();
        process.exit(1);
    }
  } catch (err) {
    console.error(err.message);
    if (err.data) printJson(err.data);
    process.exit(1);
  }
}

main();
