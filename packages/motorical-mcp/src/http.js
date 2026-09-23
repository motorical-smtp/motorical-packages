/**
 * Streamable HTTP transport for the MCP resource server.
 *
 * One Express app, one port, one route per server in the catalogue. Each route
 * verifies against its OWN canonical URI, which is what makes a narrow server
 * carry narrow authority.
 */

import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMotoricalMcpServer, PACKAGE_VERSION } from './server.js';
import { SERVERS, byPath, MCP_HOST } from './servers.js';
import { resourceMetadataUrl } from './resourceAuth.js';
import { detectRevision } from './native/revision.js';
import { dispatchNative } from './native/dispatch.js';
import { createSignupRateLimiter } from './signupRateLimit.js';

const AUTHORIZATION_SERVER = 'https://motorical.com';

export function createHttpApp({ verifier, signer, clientFactory }) {
  const app = express();

  // One counter set per app instance, scoped to the ONE public (`srv.public`)
  // server -- see signupRateLimit.js for why this is hand-rolled and why an
  // in-memory counter is safe for this single-process deployment.
  const signupRateLimit = createSignupRateLimiter();

  app.get('/healthz', (req, res) => res.json({ ok: true, servers: SERVERS.map((s) => s.key) }));

  // RFC 9728 protected resource metadata, one document per server. The path is
  // inserted after the well-known segment, which is the rule for a resource
  // whose canonical URI carries a path.
  for (const srv of SERVERS) {
    app.get(`/.well-known/oauth-protected-resource${srv.path}`, (req, res) => {
      res.set('Cache-Control', 'public, max-age=3600');
      // resourceMetadataUrl owns the RFC 9728 path rule; asserting it here
      // keeps the served route and the challenge header from ever drifting.
      if (resourceMetadataUrl(srv.canonicalUri) !== `${MCP_HOST}${req.path}`) {
        return res.status(500).json({ error: 'metadata_route_mismatch' });
      }
      res.json({
        resource: srv.canonicalUri,
        authorization_servers: [AUTHORIZATION_SERVER],
        scopes_supported: srv.scopes,
        bearer_methods_supported: ['header'],
        resource_documentation: 'https://docs.motorical.com/api-reference/authentication',
      });
    });
  }

  // Auth runs BEFORE any body parsing: an unauthenticated caller must never be
  // able to make this process spend CPU/memory parsing a request body — that
  // is a cheap DoS on an internet-facing endpoint. This middleware resolves
  // the exact server (404 on no match), verifies the token against that
  // server's own canonical URI, and stashes the result on `req` for the route
  // handler; only a request that clears this gets a body parser at all.
  async function authenticateMcp(req, res, next) {
    const srv = byPath(req.path);
    if (!srv) return res.status(404).json({ error: 'not_found' });

    // The one deliberate bypass, and it is narrow on purpose: only a server
    // explicitly marked `public: true` in the catalogue (servers.js) skips
    // verification -- every other server still falls through to the bearer
    // check below, unchanged. req.mcpClaims is null here (not omitted, not
    // {}) so a downstream handler that forgets to branch on srv.public fails
    // loudly (TypeError on claims.whatever) instead of silently treating an
    // unauthenticated caller as having some empty-but-truthy claims object.
    if (srv.public) {
      req.mcpClaims = null;
      req.mcpServerDef = srv;
      return next();
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

    try {
      req.mcpClaims = await verifier.verify(token, srv.canonicalUri);
      req.mcpServerDef = srv;
      return next();
    } catch (err) {
      if (err.challenge) res.set('WWW-Authenticate', err.challenge);
      // Never echo the token or the raw error: both leak.
      return res.status(err.status || 401).json({ error: err.code || 'invalid_token' });
    }
  }

  // Rate-limit ONLY the public (`srv.public`) server's route, and only that
  // one -- keyed off the server object `authenticateMcp` already resolved via
  // `byPath`, never a hardcoded path string that could drift from servers.js.
  // Every other server stays exactly as unmetered-at-this-layer (and still
  // outright refused with 401/404) as before this change. Placed BEFORE
  // express.json() for the same reason auth is: a flood of oversized bodies
  // against the one route with no auth gate must never reach the body parser.
  function publicServerRateLimit(req, res, next) {
    if (req.mcpServerDef?.public) return signupRateLimit(req, res, next);
    return next();
  }

  app.post('/v1/:slug/mcp', authenticateMcp, publicServerRateLimit, express.json({ limit: '1mb' }), async (req, res) => {
    const srv = req.mcpServerDef;
    const claims = req.mcpClaims;

    // Everything from here on can throw (client construction, server
    // construction, connect, handleRequest) — none of it is awaited by
    // Express itself, so an unhandled rejection would otherwise leave the
    // client hanging until timeout with the transport still open. Catch it
    // all, close what was opened, and answer once — never the raw error.
    let mcpServer;
    let transport;
    try {
      // Header routing (2026-07-28): Nginx can route and rate-limit per tool
      // without parsing a body. Emitted on both paths; harmless to legacy
      // clients, which never look at these headers.
      //
      // Validate before emitting. These values are caller-controlled and this
      // block runs BEFORE the fork, so it runs on legacy requests too: an
      // unvalidated `res.set` here converts a clean JSON-RPC -32602 into an
      // HTTP 500 for any existing client. res.setHeader throws on non-latin1
      // characters (`tool_🙂`) and on CR/LF (header injection), and the throw
      // lands in the outer catch. An over-long value does not throw at all --
      // it is emitted, and then exceeds Nginx's default proxy_buffer_size
      // (4k/8k) on ovh24, so the caller gets "upstream sent too big header" ->
      // 502 in production only, invisible to every local test. The typeof
      // guard also stops String({}) emitting the literal "[object Object]".
      //
      // Printable ASCII, 1-128 chars, is a superset of every real method and
      // tool name (`tools/call`, `motorical_send_email`) and a subset of what
      // both Node and Nginx handle safely. Anything else is simply not
      // emitted; the request still gets its normal JSON-RPC answer.
      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
        const SAFE_HEADER_VALUE = /^[\x21-\x7e]{1,128}$/;
        const method = req.body.method;
        if (typeof method === 'string' && SAFE_HEADER_VALUE.test(method)) res.set('Mcp-Method', method);
        const toolName = req.body.params?.name;
        if (typeof toolName === 'string' && SAFE_HEADER_VALUE.test(toolName)) res.set('Mcp-Name', toolName);
      }

      // The fork. Tie-break is legacy (see native/revision.js) -- a native
      // client mis-routed to the legacy path merely degrades to 2025-11-25; a
      // legacy client mis-routed here breaks outright, which is why this
      // check runs AFTER auth/body-parsing and INSIDE this try: a throw from
      // clientFactory or dispatchNative is caught exactly like every other
      // failure below, never left to hang the client.
      if (detectRevision(req.body) === 'native') {
        const nativeClient = clientFactory({ claims, server: srv, signer });
        const response = await dispatchNative(req.body, {
          server: srv,
          client: nativeClient,
          version: PACKAGE_VERSION,
        });
        // null means the request was a JSON-RPC notification: it MUST NOT be
        // answered with a body of any kind. 202 Accepted, nothing else.
        if (response === null) return res.status(202).end();
        return res.json(response);
      }

      // createMotoricalMcpServer returns { server }, where `server` is the
      // SDK's McpServer. Bind it to its own name so the nesting stays legible.
      ({ server: mcpServer } = createMotoricalMcpServer({
        client: clientFactory({ claims, server: srv, signer }),
        // Advertise only what this connected server can actually call — a
        // client on /v1/motorical_analytics/mcp must never be offered
        // motorical_send_email just because the process also serves other
        // scoped paths.
        allowedTools: srv.tools,
        serverKey: srv.key,
      }));
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { transport.close(); mcpServer.close?.(); });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      // The response body is deliberately generic -- the raw error must never
      // reach the caller -- but that used to mean the error vanished entirely,
      // leaving a 500 on ovh24 with nothing to diagnose it from. Log it here;
      // this process runs under systemd, so console.error lands in journald.
      // Only the route-matched path (validated by byPath) is logged alongside
      // it: request-body fields are caller-controlled and do not belong in a
      // log line.
      console.error(`[mcp] request failed on ${req.path}:`, err);
      if (transport) {
        try { await transport.close(); } catch (_) { /* already closing */ }
      }
      if (!res.headersSent) {
        res.status(500).json({ error: 'server_error' });
      }
    }
  });

  // A GET or DELETE on a server path is a session operation this stateless
  // deployment does not support; answer explicitly rather than 404.
  app.all('/v1/:slug/mcp', (req, res) => res.status(405).json({ error: 'method_not_allowed' }));

  return app;
}
