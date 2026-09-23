/**
 * In-process rate limiter for the ONE unauthenticated MCP route (`signup`).
 *
 * Security follow-up to MCP P5: `authenticateMcp` (http.js) deliberately skips
 * bearer verification for the server marked `public: true` in servers.js --
 * a caller with no Motorical account yet has no token to present. That is the
 * one place in this process where http.js's own stated threat model ("an
 * unauthenticated caller must never be able to make this process spend
 * CPU/memory parsing a request body") was not backed by an actual ceiling.
 * This module is that ceiling.
 *
 * Deliberately hand-rolled, not express-rate-limit: this package
 * (@motorical/mcp) does not otherwise depend on any rate-limiting library --
 * that dependency lives in backend/'s package.json, a separate npm package
 * with its own tree -- and motorical-mcp-server runs as a single Node
 * process per host, with no cluster/worker_threads fan-out (serve.js calls
 * `app.listen` exactly once and binds loopback-only; Nginx terminates TLS and
 * proxies to that one process). A per-process in-memory fixed-window counter
 * is therefore not a distributed-systems shortcut -- it is the correctly
 * sized fix for one process guarding one route, not general middleware
 * infrastructure.
 *
 * This middleware is mounted in http.js BEFORE express.json(), matching the
 * ordering authenticateMcp already establishes. Because of that ordering it
 * never sees a parsed body, so it cannot distinguish a cheap `initialize` /
 * `tools/list` from an expensive `tools/call` -- it counts every POST that
 * reaches it. That is deliberate: selectively counting only `tools/call`
 * would require parsing JSON first, which is exactly the cost this
 * middleware exists to avoid spending before the caller has proven anything
 * about itself. A human onboarding once still comfortably fits the budget
 * below (initialize + tools/list + tools/call, plus room for a retry).
 */

// 10 requests / 15 minutes per IP -- the same ceiling as the backend's own
// signupHandoffMintRateLimit (backend/src/middleware/rateLimiter.js), reused
// for consistency: both exist to bound the same "a human onboards once"
// event, just at different layers of the same request.
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 10;

// Actually bounds the Map's size (see prune() below) if this is ever hit
// from many distinct caller-supplied IPs (a real distributed flood, or many
// spoofed X-Real-IP/CF-Connecting-IP values from an already-on-host caller).
// Checked opportunistically -- only when the map is already over cap -- so
// a request that is itself still within its own window pays nothing extra.
const MAX_TRACKED_IPS = 20000;

/**
 * The real client IP, not an intermediate proxy's own address.
 *
 * mcp.motorical.com sits behind Cloudflare in production. That means
 * `$remote_addr` at the Nginx origin -- and therefore `X-Real-IP`, which that
 * Nginx config unconditionally sets to `$remote_addr` -- is Cloudflare's edge
 * IP, not the end user's. Bucketing on that would key the limiter by
 * Cloudflare PoP: a handful of unrelated humans signing up through the same
 * edge IP could exhaust the shared budget for everyone else behind it --
 * exactly the shared-bucket failure this limiter exists to prevent, just
 * relocated one hop up the chain.
 *
 * `Cf-Connecting-Ip` is the fix, and it must come first: Cloudflare sets it
 * itself at its edge from the real TCP connection and overwrites any
 * client-supplied value of the same name for traffic that actually transits
 * Cloudflare, so a caller cannot spoof it on that path. This is the same
 * convention already established in this codebase --
 * backend/src/middleware/accountApiKeyAuth.js and apiKeyAuth.js both resolve
 * real client IP as `cf-connecting-ip` first, ahead of `x-forwarded-for`.
 *
 * `X-Real-IP` stays as the next fallback (still correct if this process is
 * ever reached by a path that isn't behind Cloudflare -- e.g. a direct
 * loopback caller during local dev/testing, where Nginx's `$remote_addr` IS
 * the real peer), then the first hop of `X-Forwarded-For`, then the raw
 * socket address.
 */
function clientIp(req) {
  // SECURITY ASSUMPTION (confirmed 2026-09-08): mcp.motorical.com is reachable
  // ONLY through Cloudflare's edge. Cloudflare sets Cf-Connecting-Ip itself at
  // its edge from the real TCP connection and overwrites any client-supplied
  // value for traffic that actually transits Cloudflare. This makes it safe to
  // trust unconditionally. If ovh24's network topology ever changes (e.g.
  // becomes directly reachable outside Cloudflare, or gains a second ingress
  // path that bypasses Cloudflare), this trust assumption must be re-verified
  // before this code can be considered safe.
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Build a fresh limiter instance. Each `createHttpApp` call gets its own
 * (see http.js), so separate app instances -- separate tests, or a future
 * separate deployment -- never share counters.
 */
export function createSignupRateLimiter({
  windowMs = DEFAULT_WINDOW_MS,
  max = DEFAULT_MAX,
  maxTrackedIps = MAX_TRACKED_IPS,
} = {}) {
  const hits = new Map(); // ip -> { count, resetAt }

  // Prune expired entries first (the common case: most of the map is stale
  // windows). If the map is STILL over cap after that -- meaning `maxTrackedIps`
  // distinct IPs are all within their own active window at once -- expired-only
  // pruning deletes nothing, and without a second step the map would grow
  // unbounded while every subsequent request pays an O(n) sweep that changes
  // nothing. So when still over cap, evict the oldest entries by `resetAt`
  // (soonest-expiring first) until back under the cap. Worst case this makes a
  // handful of legitimate callers get one extra allowance in a blue moon --
  // far better than an unbounded map or a sweep that never shrinks it.
  function prune(now) {
    for (const [ip, rec] of hits) {
      if (rec.resetAt <= now) hits.delete(ip);
    }
    if (hits.size > maxTrackedIps) {
      const oldestFirst = [...hits.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
      const excess = hits.size - maxTrackedIps;
      for (let i = 0; i < excess; i += 1) hits.delete(oldestFirst[i][0]);
    }
  }

  const middleware = function signupRateLimit(req, res, next) {
    const ip = clientIp(req);
    const now = Date.now();

    let rec = hits.get(ip);
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(ip, rec);
    }
    rec.count += 1;

    const resetSeconds = Math.max(0, Math.ceil((rec.resetAt - now) / 1000));
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - rec.count)));
    res.set('RateLimit-Reset', String(resetSeconds));

    if (rec.count > max) {
      res.set('Retry-After', String(resetSeconds));
      // Shape matches every other error body in http.js: `{ error: <code> }`,
      // nothing else -- no echo of caller input, consistent with the file's
      // own "never the raw error/input" rule for its other responses.
      return res.status(429).json({ error: 'rate_limited' });
    }

    if (hits.size > maxTrackedIps) prune(now);
    return next();
  };

  // Test-only introspection hook (mirrors the `__testOnly_*` convention used
  // elsewhere in this package, e.g. native/taskStore.js): lets a test assert
  // the Map's actual size stays bounded after eviction, without exporting
  // `hits` itself or otherwise widening the module's real interface.
  middleware.__testOnly_trackedCount = () => hits.size;

  return middleware;
}
