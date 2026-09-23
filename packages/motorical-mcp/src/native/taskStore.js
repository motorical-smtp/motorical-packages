// packages/motorical-mcp/src/native/taskStore.js
//
// The MCP server has never talked to Redis or Postgres directly before this
// -- it mints a 60s delegation JWT and calls the backend for everything (see
// fleet/hosts/ovh24.yaml's note on this unit). This is the first exception,
// and deliberately a narrow one: task records hold no send content, no
// recipient PII beyond bare addresses already visible to the caller's own
// token, and nothing this store can't safely lose (a lost task just means
// the caller falls back to motorical_get_message directly).
//
// Redis dialect: ioredis. motorical-mcp-server runs on ovh24, same host as
// motorical-backend-api -- ioredis is ovh24's dialect (the SMTP gateways on
// mail/mail1 are node-redis; mixing them up has caused two live defects
// fleet-wide -- check the host, not habit). Connects to 127.0.0.1:6379:
// Redis is centralized ON ovh24, so a process running on ovh24 never needs
// the tailnet hop mail/mail1 use.
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

const TASK_TTL_SECONDS = 72 * 60 * 60; // 72h, per the spec: deferrals retry for hours.
const KEY_PREFIX = 'mcp:task:';
const INDEX_PREFIX = 'mcp:tasks-by-block:';

// The Redis password is a KMS/fallback-resolved secret fleet-wide (2026-07-28
// migration) -- never a plaintext env value. This unit has no bootstrap.js
// wrapper and has never needed one; reading the SAME plaintext fallback file
// backend/bootstrap.js's SECRETS list already resolves REDIS_PASSWORD from
// is simpler than adding the whole KMS-decrypt path for one more secret, and
// matches this file's own existing pattern of reading
// /etc/motorical/jwt_private.pem directly at startup (see serve.js).
const REDIS_PASSWORD_FALLBACK_PATH = process.env.REDIS_PASSWORD_FALLBACK_PATH
  || '/etc/motorical/redis-password-fallback';

function resolveRedisPassword() {
  if (process.env.REDIS_PASSWORD_FOR_MCP) return process.env.REDIS_PASSWORD_FOR_MCP;
  try {
    return fs.readFileSync(REDIS_PASSWORD_FALLBACK_PATH, 'utf8').trim();
  } catch (err) {
    throw new Error(
      `taskStore: could not read Redis password from ${REDIS_PASSWORD_FALLBACK_PATH} `
      + `or REDIS_PASSWORD_FOR_MCP: ${err.message}`
    );
  }
}

let sharedClient = null;
function defaultClient() {
  if (!sharedClient) {
    sharedClient = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      password: resolveRedisPassword(),
      retryStrategy: (times) => Math.min(times * 50, 2000),
      // ioredis's own default (10000ms) preserved when unset -- this line
      // changes nothing for any existing consumer. The override exists so a
      // caller that genuinely needs a fast-failing connection (namely
      // waitForOutcome.test.js's real-store path, which has no injectable
      // seam into this module-scope client -- see registry.js) can set
      // REDIS_CONNECT_TIMEOUT_MS to bound a silently-unreachable/blackholed
      // target's retry loop, rather than each of ioredis's default 20
      // per-request retries (maxRetriesPerRequest) being free to take up to
      // the full connect timeout before giving up.
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 10000),
    });
  }
  return sharedClient;
}

function build(client) {
  return {
    // `expectedRecipients` (the full recipient address list) used to be stored
    // on every record and was never read back ANYWHERE: resolveTask uses only
    // task.emailLogId and task.motorBlockId, and re-fetches the recipient
    // breakdown fresh from the backend on every poll via
    // getMessageRecipients. That made it 72h of recipient PII sitting in Redis
    // with no consumer -- exposure surface for zero function. Dropped.
    async createTask({ emailLogId, motorBlockId }) {
      const taskId = randomUUID();
      const record = { taskId, emailLogId, motorBlockId, createdAt: new Date().toISOString() };
      await client.set(KEY_PREFIX + taskId, JSON.stringify(record), 'EX', TASK_TTL_SECONDS);
      // No block, no index entry. Writing the index unconditionally meant a
      // task whose motorBlockId was undefined (the common single-block-grant
      // send, where the caller omits the optional arg and /v1/send's response
      // carries no block either) landed in the single global key
      // `mcp:tasks-by-block:undefined` -- a set that no caller can ever
      // usefully list (they'd ask for their real block id) and whose TTL was
      // refreshed on every such send, so it grew without bound in production.
      // Skipping the write costs only tasks/list enumeration for that task;
      // tasks/get and motorical_wait_for_outcome still resolve it by taskId.
      if (motorBlockId) {
        await client.sadd(INDEX_PREFIX + motorBlockId, taskId);
        await client.expire(INDEX_PREFIX + motorBlockId, TASK_TTL_SECONDS);
      }
      return { taskId };
    },

    async getTask(taskId) {
      const raw = await client.get(KEY_PREFIX + taskId);
      return raw ? JSON.parse(raw) : null;
    },

    async listTasksForMotorBlock(motorBlockId) {
      const ids = await client.smembers(INDEX_PREFIX + motorBlockId);
      // The index's TTL matches the task TTL but is set independently (SADD
      // doesn't refresh an existing key's TTL the way SET EX does), so a
      // member can outlive its own task record on the SAME expiry window's
      // rounding edge. Filter dead members out rather than let a caller of
      // tasks/list get back an id that 404s on tasks/get a moment later.
      const live = [];
      for (const id of ids) {
        const exists = await client.get(KEY_PREFIX + id);
        if (exists) live.push(id);
        else await client.srem(INDEX_PREFIX + motorBlockId, id);
      }
      return live;
    },

    async closeTaskStore() {
      await client.quit();
    },
  };
}

// The singleton store itself is built lazily too -- not just the client inside
// defaultClient(). Building it eagerly at module scope (`build(defaultClient())`
// as a top-level const) would call defaultClient() -> resolveRedisPassword() the
// instant anything imports this module, including a test that only wants
// __testOnly_withClient and never touches the real client. Deferring construction
// until one of these functions actually runs keeps `import` side-effect-free.
let defaultStore = null;
// Test-only override of the default-store RESOLUTION (see
// __testOnly_setDefaultStore at the bottom of this file). Checked before the
// lazy singleton so a test can point every module-level export below at an
// injected fake without the real client -- and therefore
// resolveRedisPassword() -- ever being constructed.
let defaultStoreOverride = null;
function getDefaultStore() {
  if (defaultStoreOverride) return defaultStoreOverride;
  if (!defaultStore) defaultStore = build(defaultClient());
  return defaultStore;
}

export async function createTask(args) {
  return getDefaultStore().createTask(args);
}

export async function getTask(taskId) {
  return getDefaultStore().getTask(taskId);
}

export async function listTasksForMotorBlock(motorBlockId) {
  return getDefaultStore().listTasksForMotorBlock(motorBlockId);
}

// Deliberately does NOT go through getDefaultStore(): "close the store" must
// never be the thing that BUILDS one. A test whose after() hook closes
// defensively (the common shape in this suite) would otherwise construct the
// real ioredis client -- and call resolveRedisPassword() -- at teardown, on a
// machine where nothing else in the file ever touched Redis.
export async function closeTaskStore() {
  const store = defaultStoreOverride || defaultStore;
  if (!store) return undefined;
  return store.closeTaskStore();
}

// Test-only seam: build a store over an injected client (a fake in unit
// tests, a real ioredis pointed at a test DB index in integration tests)
// without touching the module-scope singleton every other caller shares.
export function __testOnly_withClient(client) {
  return build(client);
}

// Test-only seam #2, for the callers __testOnly_withClient alone cannot reach.
// registry.js imports this module as a NAMESPACE at module scope
// (`import * as taskStore`) and closes over it inside its tool handlers, and
// dispatch.js takes it as a default parameter -- so a test that exercises the
// real registered handler (dispatch.test.js, http.test.js,
// waitForOutcome.test.js) has no argument to inject a fake through and was
// forced onto the real Redis-backed singleton. That made those three tests
// fail with ENOENT on every machine lacking ovh24's
// /etc/motorical/redis-password-fallback -- including every developer laptop,
// and including a PRE-EXISTING test (http.test.js) that this branch broke.
//
// Pointing the resolution at an injected store (build one with
// __testOnly_withClient) fixes that without weakening the code under test:
// the handler still runs for real, only its store is a fake. Pass null to
// restore the real lazy-singleton behaviour -- do that in an after() hook, or
// the override leaks into every later test in the same process.
export function __testOnly_setDefaultStore(store) {
  defaultStoreOverride = store || null;
}
