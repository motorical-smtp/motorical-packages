#!/usr/bin/env node
/**
 * Live smoke against production APIs.
 * Creates temporary mk/ak keys via dashboard JWT, exercises MCP client, revokes keys.
 *
 * Usage (on ovh24 with backend access):
 *   node test/live-smoke.js
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { MotoricalClient } from '../src/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const BACKEND = path.resolve(__dirname, '../../../backend');
const backendRequire = createRequire(path.join(BACKEND, 'package.json'));
backendRequire('dotenv').config({ path: path.join(BACKEND, '.env') });

const { generateToken } = backendRequire(path.join(BACKEND, 'src/middleware/auth.js'));
const { getTokenVersion } = backendRequire(path.join(BACKEND, 'src/config/redis.js'));

const USER_ID = '1d003971-2ea7-46b3-8995-4ceb38f9bc77';
const BLOCK_ID = '39b3f504-7e41-4b3f-871a-75bc77676267';
const API = process.env.MOTORICAL_API_BASE_URL || 'http://127.0.0.1:3001';
const FROM = process.env.MOTORICAL_DEFAULT_FROM || 'ops@centervpn.net';
const TO = process.env.MOTORICAL_SMOKE_TO || 'liepinsgirts@gmail.com';

async function api(method, pathName, { token, body } = {}) {
  const res = await fetch(`${API}${pathName}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${pathName} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  const version = await getTokenVersion(USER_ID);
  const jwt = generateToken(USER_ID, version);

  console.error('[smoke] creating temporary API keys…');
  const mkResp = await api('POST', `/api/motor-blocks/${BLOCK_ID}/api-keys`, {
    token: jwt,
    body: { name: `mcp-smoke-${Date.now()}`, scopes: ['send:email'] }
  });
  const mkKey = mkResp?.token || mkResp?.data?.token;
  const mkPrefix = mkResp?.prefix || mkResp?.data?.prefix;

  const akResp = await api('POST', '/api/account/api-keys', {
    token: jwt,
    body: { name: `mcp-smoke-ak-${Date.now()}` }
  });
  const akKey = akResp?.data?.token || akResp?.token;
  const akPrefix = akResp?.data?.prefix || akResp?.prefix;

  if (!mkKey || !akKey) {
    throw new Error(`Failed to create keys: mk=${!!mkKey} ak=${!!akKey} mkResp=${JSON.stringify(mkResp)} akResp=${JSON.stringify(akResp)}`);
  }

  try {
    const client = new MotoricalClient({
      apiBaseUrl: API.includes('127.0.0.1') ? 'https://api.motorical.com' : API,
      docsBaseUrl: 'https://docs.motorical.com',
      mkApiKey: mkKey,
      akApiKey: akKey,
      bearerToken: '',
      motorBlockId: BLOCK_ID,
      defaultFrom: FROM
    });

    // Prefer public edge for send/public if local backend path differs for /v1
    client.config.apiBaseUrl = 'https://api.motorical.com';

    console.error('[smoke] get_send_status…');
    const status = await client.getSendApiStatus();
    console.error('[smoke] status ok', !!status);

    console.error('[smoke] mint_public_token…');
    const minted = await client.mintPublicToken({ motorBlockId: BLOCK_ID });
    const token = minted?.data?.token || minted?.token;
    if (!token) throw new Error('no token minted');

    console.error('[smoke] list_motor_blocks…');
    const blocks = await client.listMotorBlocks();
    const list = blocks?.data || blocks;
    if (!Array.isArray(list) && !list?.length && !blocks?.success) {
      console.error('[smoke] blocks response', JSON.stringify(blocks).slice(0, 300));
    }

    console.error('[smoke] send_email dryRun…');
    const send = await client.sendEmail({
      from: FROM,
      to: TO,
      subject: 'Motorical MCP smoke dry-run',
      text: 'mcp smoke',
      dryRun: true
    });
    if (send?.dryRun !== true && send?.data?.acceptanceStatus !== 'validated' && !send?.success) {
      throw new Error(`unexpected send response: ${JSON.stringify(send)}`);
    }
    console.error('[smoke] dry-run send ok');

    console.error('[smoke] fetch docs llms…');
    const llms = await client.fetchDocs('/llms.txt');
    if (!llms.includes('Motorical')) throw new Error('llms.txt unexpected');

    console.error('[smoke] PASSED');
  } finally {
    console.error('[smoke] revoking temporary keys…');
    try {
      if (mkPrefix) {
        await api('DELETE', `/api/motor-blocks/${BLOCK_ID}/api-keys/${mkPrefix}`, { token: jwt }).catch(() =>
          api('DELETE', `/api/motor-blocks/${BLOCK_ID}/api-keys/${encodeURIComponent(mkPrefix)}`, { token: jwt })
        );
      }
    } catch (e) {
      console.error('[smoke] mk revoke warn:', e.message);
    }
    try {
      if (akPrefix) await api('DELETE', `/api/account/api-keys/${akPrefix}`, { token: jwt });
    } catch (e) {
      console.error('[smoke] ak revoke warn:', e.message);
    }
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[smoke] FAILED', err);
  process.exit(1);
});
