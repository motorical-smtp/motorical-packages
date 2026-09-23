// The single declarative tool table. server.js, the catalogue emitter, the
// annotations gate and the native protocol dispatcher all read THIS -- there
// is deliberately no second place where a tool's description or schema can be
// stated, because a tool that disagrees with itself across two files is how
// the docs surface went stale before.
//
// `handler` is a FACTORY: (client) => async (args) => rawResult. The client is
// per-request on the hosted server (it carries the caller's delegated
// authority), so a handler must never close over a client at module scope.
// Handlers return the raw client result and THROW on error -- the
// jsonResult()/errorResult() wrapping happens exactly once, at the single
// call site in server.js's registration loop.
import { z } from 'zod';
import * as taskStore from './native/taskStore.js';
import { resolveTask } from './native/taskResolver.js';
import { TOOL_SCOPES, SCOPES } from '@motorical/scope-catalog';

const blockSelector = z.string().uuid().optional()
  .describe('Required when the authorization covers more than one Motor Block');

/**
 * Which Motor Block does a completed send belong to?
 *
 * `args.motorBlockId` is OPTIONAL on motorical_send_email ("Required when the
 * authorization covers more than one Motor Block"), and the real /v1/send
 * response does not echo a block back on the queued branch either -- so the
 * majority of real callers (single-block grants) used to have their task
 * stored with `motorBlockId: undefined`. That broke tasks/list for exactly
 * those callers and piled every such task into one unbounded Redis key. Try
 * the three places a block is genuinely knowable, in decreasing order of
 * authority, and return null rather than a falsy-but-stringifiable value when
 * none of them has one -- taskStore.createTask skips the index write on null.
 */
function effectiveMotorBlockId(client, args, result) {
  // 1. What the caller explicitly named. Already validated as a uuid, and on
  //    the delegated path already checked against the caller's own authority
  //    by resolveBlock() before client.sendEmail ran.
  if (args?.motorBlockId) return String(args.motorBlockId);
  // 2. Anything the send response itself carries. Today only the dryRun
  //    branch of /v1/send populates data.motorBlockId (verified against the
  //    outputSchema below and backend/src/routes/v1.js), and dryRun never
  //    reaches this code -- but if the queued branch ever starts echoing it,
  //    that is the most authoritative answer available and this picks it up
  //    without another change here.
  if (result?.data?.motorBlockId) return String(result.data.motorBlockId);
  // 3. A single-block authorization's only possible answer. createDelegatedClient
  //    sets client.motorBlockIds to the caller's own delegated set (and
  //    resolveBlock() would have refused the send outright if that set had
  //    more than one member and no explicit arg), so a lone member here is
  //    the block this send actually went out on.
  const authorized = client?.motorBlockIds;
  if (Array.isArray(authorized) && authorized.length === 1) return String(authorized[0]);
  // 4. The stdio/local path's configured default (MOTORICAL_MOTOR_BLOCK_ID),
  //    which is also what client.js's own sendEmail falls back to.
  if (client?.config?.motorBlockId) return String(client.config.motorBlockId);
  return null;
}
const isoDate = (bound) => z.string().optional().describe(`ISO date or datetime, ${bound}`);
const webhookIdArg = z.string().describe('The webhook endpoint id, from motorical_webhook_list or the create response');

export const TOOLS = [
  {
    name: 'motorical_get_send_status',
    description:
      'Check Motorical transactional email HTTP Send API status (GET /v1/status). No auth required.',
    inputSchema: {},
    // GET /v1/status returns a hardcoded status block (backend/src/routes/v1.js) --
    // docs-site/static/openapi.json documents only a bare 200 description for this
    // path, no schema, so `success` (the one field every /v1 JSON response carries)
    // is the sole required key; everything else is optional in case the static
    // block grows or shrinks fields later.
    outputSchema: {
      success: z.boolean(),
      message: z.string().optional(),
      data: z.object({
        service: z.string().optional(),
        serviceStatus: z.string().optional(),
        version: z.string().optional(),
        timestamp: z.string().optional(),
        endpoints: z.record(z.string(), z.string()).optional()
      }).optional()
    },
    annotations: { title: 'Check Send API status', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async () => client.getSendApiStatus(),
  },

  {
    name: 'motorical_mint_public_token',
    description:
      'Mint a short-lived Public Analytics API bearer token using MOTORICAL_AK_API_KEY (ak_live_...) ' +
      'or, when none is configured, MOTORICAL_JWT. ' +
      'Use for /api/public/v1 logs, analytics, webhooks, config. Not for POST /v1/send.',
    inputSchema: {
      motorBlockId: z.string().uuid().optional().describe('Defaults to MOTORICAL_MOTOR_BLOCK_ID'),
      scopes: z.array(z.string()).optional(),
      ttlSeconds: z.number().int().min(60).max(900).optional()
    },
    annotations: { title: 'Mint public API token', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: (client) => async (args) => client.mintPublicToken(args),
  },

  {
    name: 'motorical_list_motor_blocks',
    description:
      'List Motor Blocks (isolated sending streams) visible to a Public API bearer token (auto-mints with ak_live_ if needed).',
    inputSchema: {
      motorBlockId: z.string().uuid().optional().describe('Optional. Listing is account-wide; a block is only used when minting a legacy public token on the non-OAuth path.')
    },
    annotations: { title: 'List Motor Blocks', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.listMotorBlocks(args),
  },

  {
    name: 'motorical_send_email',
    description:
      'Transactional email: send or validate via POST /v1/send using MOTORICAL_MK_API_KEY (mk_live_...). ' +
      'Defaults to dryRun:true. Real sends require dryRun:false AND confirmRealSend:true. ' +
      'Do not use OAuth access tokens or Bearer tokens here. ' +
      'For developer-sandbox accounts, a non-allowlisted recipient is redirected to the account ' +
      'email rather than rejected — check the response\'s sandboxRedirect field.',
    inputSchema: {
      from: z.string().email().optional().describe('Defaults to MOTORICAL_DEFAULT_FROM'),
      fromName: z
        .string()
        .max(78)
        .optional()
        .describe('Optional From display name (do not put From in headers — use this field)'),
      to: z.union([z.string().email(), z.array(z.string().email())]),
      subject: z.string().min(1),
      text: z.string().optional(),
      html: z.string().optional(),
      dryRun: z.boolean().optional().describe('Default true — validate without queueing'),
      confirmRealSend: z
        .boolean()
        .optional()
        .describe('Required true when dryRun is false'),
      idempotencyKey: z.string().optional(),
      motorBlockId: z
        .string()
        .uuid()
        .optional()
        .describe('Required when the authorization covers more than one Motor Block')
    },
    // POST /v1/send (docs-site/static/openapi.json) always returns `success` and
    // `message`; `data` is present on every 2xx too but its own fields vary by
    // branch -- dryRun responses carry status/domain/motorBlockId/hasText/hasHtml,
    // queued (real-send or idempotent-replay) responses carry id/acceptanceStatus,
    // and `dryRun`/`idempotent`/`sandboxRedirect` are each present on only one
    // branch -- so every field below except `success` is optional.
    outputSchema: {
      success: z.boolean(),
      dryRun: z.boolean().optional(),
      idempotent: z.boolean().optional(),
      message: z.string().optional(),
      status: z.enum(['accepted']).optional().describe('Present only on a real send — accepted for delivery, NOT delivered'),
      delivered: z.null().optional().describe('Always null on the synchronous response — a 202 is never delivery'),
      nextAction: z.object({
        tool: z.literal('motorical_wait_for_outcome'),
        args: z.object({ taskId: z.string() }),
      }).optional(),
      data: z.object({
        id: z.string().optional(),
        acceptanceStatus: z.string().optional(),
        status: z.string().optional(),
        from: z.string().optional(),
        fromName: z.string().nullable().optional(),
        to: z.array(z.string()).optional(),
        subject: z.string().optional(),
        domain: z.string().optional(),
        motorBlockId: z.string().optional(),
        bodySize: z.number().optional(),
        hasText: z.boolean().optional(),
        hasHtml: z.boolean().optional(),
        recipientCount: z.number().optional(),
        timestamp: z.string().optional(),
        sandboxRedirect: z.object({
          requestedTo: z.array(z.string()).optional(),
          deliveredTo: z.array(z.string()).optional(),
          reason: z.string().optional()
        }).nullable().optional()
      }).optional()
    },
    annotations: { title: 'Send transactional email', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    // dryRun (default true) never reaches the `data.id`-bearing branch below,
    // so it never creates a task — matches the spec's own constraint exactly
    // because it falls out of the response shape, not a separate `if`.
    handler: (client) => async (args) => {
      const result = await client.sendEmail(args);
      if (result?.dryRun || !result?.data?.id) return result;
      // The send has ALREADY SUCCEEDED by this line. Task creation is a
      // convenience for tracking its outcome; it is not the product, and it
      // must never be able to turn a delivered-to-the-queue message into a
      // reported failure. Unguarded, a throw here (Redis blip on ovh24, or --
      // always -- the published npm package on a user's own machine, which has
      // no /etc/motorical/redis-password-fallback at all) propagates out of the
      // handler and both the SDK path and tools/call wrap it as isError:true.
      // The natural agent response to "send failed" is to retry, so the cost of
      // getting this wrong is duplicate mail plus double quota and billing
      // consumption for a message that already went out.
      //
      // Degrade instead: still kill the "202 == delivered" lie (status/delivered
      // do not depend on Redis), just omit nextAction, because there is no task
      // to wait on. Logged so the failure is visible in ops rather than silent.
      let taskId = null;
      try {
        ({ taskId } = await taskStore.createTask({
          emailLogId: result.data.id,
          motorBlockId: effectiveMotorBlockId(client, args, result),
        }));
      } catch (err) {
        console.error(
          `motorical_send_email: send ${result.data.id} succeeded but outcome-task creation failed `
          + `(no nextAction returned; use motorical_get_message with this id instead): ${err.message}`
        );
      }
      return {
        ...result,
        status: 'accepted',
        delivered: null,
        ...(taskId ? { nextAction: { tool: 'motorical_wait_for_outcome', args: { taskId } } } : {}),
      };
    },
  },

  {
    name: 'motorical_wait_for_outcome',
    description:
      'Wait for a real send\'s actual delivery outcome (not just the 202 acceptance). Bounded ' +
      'server-side wait with backoff, capped under typical client timeouts. If the result is ' +
      'still_pending, wait retryAfterMs and call this again with the same taskId.',
    inputSchema: {
      taskId: z.string().describe('From motorical_send_email\'s nextAction after a real (non-dryRun) send'),
      // Same opt-in motorical_get_message/motorical_get_message_events already
      // expose. Without it every recipient address comes back masked
      // (a***@x.com), so a send to alice@x.com and andrew@x.com resolves to two
      // identical-looking entries -- the agent can see that one bounced but not
      // WHICH, which defeats most of the point of per-recipient outcomes. The
      // route refuses includePII:true from a token without the logs.pii scope,
      // so this is a request, not a grant. Default stays masked.
      includePII: z.boolean().optional()
        .describe('Return unmasked recipient addresses. Requires the logs.pii scope; default false (masked).'),
    },
    outputSchema: {
      status: z.enum(['completed', 'still_pending', 'not_found']),
      retryAfterMs: z.number().optional(),
      result: z.object({
        recipients: z.array(z.object({
          address: z.string(),
          status: z.enum(['delivered', 'bounced', 'pending']),
          dsnCode: z.string().nullable().optional(),
          at: z.string().nullable().optional(),
        })),
        expectedCount: z.number(),
        allTerminal: z.boolean(),
        // Forwarded verbatim from the backend's GET /messages/:id/recipients
        // response (Task 10) via taskResolver.js -- declared here so a
        // schema-driven re-parse of structuredContent (dispatch.js's
        // validateArguments already documents "Zod STRIPS unknown keys" for
        // the same objectFromShape/safeParseAsync machinery) can't silently
        // drop either field.
        pii_masked: z.boolean().optional(),
        pii_unmask_path: z.string().nullable().optional(),
      }).optional(),
    },
    annotations: { title: 'Wait for delivery outcome', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    // The one handler that isn't a one-line pass-through: bounded polling
    // lives here, not in taskResolver.js, because taskResolver.js is also
    // called by native tasks/get (Task 8), which must resolve ONCE per
    // request -- polling belongs to the tool surface that has no other way
    // to wait, not to the shared resolver both surfaces call.
    handler: (client) => async (args) => {
      const backoffMs = [2000, 15000, 60000];
      const deadline = Date.now() + 25000;
      let attempt = 0;
      while (true) {
        const outcome = await resolveTask(args.taskId, client, taskStore, {
          includePII: args.includePII === true,
        });
        if (outcome.status !== 'still_pending') return outcome;
        if (Date.now() >= deadline) return outcome;
        const wait = backoffMs[Math.min(attempt, backoffMs.length - 1)];
        if (Date.now() + wait >= deadline) return outcome;
        await new Promise((resolve) => setTimeout(resolve, wait));
        attempt += 1;
      }
    },
  },

  {
    name: 'motorical_get_message',
    description: 'Get a message by send UUID (GET /api/public/v1/messages/{id}). Auto-mints bearer if needed.',
    inputSchema: {
      messageId: z.string().uuid(),
      includePII: z.boolean().optional(),
      motorBlockId: z.string().uuid().optional()
    },
    // GET /api/public/v1/messages/{id} -> #/components/schemas/MessageResponse ->
    // MessageResponse.data: #/components/schemas/MessageResource (docs-site/static/openapi.json).
    // `success` is the only field neither nullable nor conditional there.
    outputSchema: {
      success: z.boolean(),
      data: z.object({
        id: z.string().optional(),
        smtpMessageId: z.string().nullable().optional(),
        currentOutcome: z.string().optional(),
        isTerminal: z.boolean().optional(),
        from: z.string().optional(),
        recipient: z.string().optional(),
        subject: z.string().optional(),
        queuedAt: z.string().optional(),
        processedAt: z.string().nullable().optional(),
        deliveredAt: z.string().nullable().optional(),
        bouncedAt: z.string().nullable().optional(),
        smtpCode: z.string().nullable().optional(),
        smtpResponse: z.string().nullable().optional(),
        // Task 10 backend change: present whenever `recipient` above is
        // conditionally masked. Declared here so it survives a schema-driven
        // re-parse instead of being silently dropped as an undeclared field.
        pii_masked: z.boolean().optional(),
        pii_unmask_path: z.string().nullable().optional()
      }).optional()
    },
    annotations: { title: 'Get message by ID', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getMessage(args.messageId, args),
  },

  {
    name: 'motorical_get_message_events',
    description:
      'Get delivery lifecycle events for a message (GET /api/public/v1/messages/{id}/events).',
    inputSchema: {
      messageId: z.string().uuid(),
      includePII: z.boolean().optional(),
      motorBlockId: z.string().uuid().optional()
    },
    // GET /api/public/v1/messages/{id}/events -- docs-site/static/openapi.json
    // documents only a bare 200 description for this path (no schema), so this
    // is taken from the actual handler/service instead (backend/src/routes/
    // public/index.js's `/messages/:id/events` route, which spreads
    // messageOutcome.toPublicDto() and adds motorBlockId + events; the event
    // shape is messageOutcome.getTimeline()'s per-row map). `success` is the
    // only field guaranteed present regardless of outcome/event state.
    outputSchema: {
      success: z.boolean(),
      data: z.object({
        motorBlockId: z.string().optional(),
        id: z.string().optional(),
        smtpMessageId: z.string().nullable().optional(),
        currentOutcome: z.string().optional(),
        isTerminal: z.boolean().optional(),
        from: z.string().optional(),
        recipient: z.string().optional(),
        subject: z.string().optional(),
        queuedAt: z.string().optional(),
        processedAt: z.string().nullable().optional(),
        deliveredAt: z.string().nullable().optional(),
        bouncedAt: z.string().nullable().optional(),
        smtpCode: z.string().nullable().optional(),
        smtpResponse: z.string().nullable().optional(),
        // Task 10 backend change: present whenever `recipient` above is
        // conditionally masked. Declared here so it survives a schema-driven
        // re-parse instead of being silently dropped as an undeclared field.
        pii_masked: z.boolean().optional(),
        pii_unmask_path: z.string().nullable().optional(),
        events: z.array(z.object({
          eventType: z.string().optional(),
          smtpCode: z.string().nullable().optional(),
          message: z.string().nullable().optional(),
          at: z.string().optional(),
          processedAt: z.string().nullable().optional(),
          deliveredAt: z.string().nullable().optional(),
          bouncedAt: z.string().nullable().optional(),
          retryCount: z.number().optional()
        })).optional()
      }).optional()
    },
    annotations: { title: 'Get message delivery events', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getMessageEvents(args.messageId, args),
  },

  {
    name: 'motorical_sandbox_status',
    description:
      'Get developer sandbox status (domain, Motor Block, outbound lock, allowlist). ' +
      'Check data.stage to determine provisioning state: "not_started" (no sandbox yet — call ' +
      'motorical_sandbox_provision), "sandbox_active" (sandbox exists, outbound-locked), or "live" ' +
      '(converted to production, no lock). allowlist/caps are always present in the response regardless ' +
      'of stage — do not infer provisioning state from their presence.',
    inputSchema: {},
    annotations: { title: 'Get developer sandbox status', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async () => client.sandboxStatus(),
  },

  {
    name: 'motorical_sandbox_allowlist_request',
    description:
      'Request to add a new recipient to the developer sandbox outbound allowlist. ' +
      'Sends a 6-digit confirmation code to that address (not the account owner) — ' +
      'call motorical_sandbox_allowlist_confirm with the code the recipient receives. Requires MOTORICAL_JWT.',
    inputSchema: {
      email: z.string().email()
    },
    annotations: { title: 'Request sandbox allowlist addition', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: (client) => async (args) => client.sandboxAllowlistRequest(args),
  },

  {
    name: 'motorical_sandbox_allowlist_confirm',
    description:
      'Confirm a sandbox allowlist recipient using the 6-digit code sent by ' +
      'motorical_sandbox_allowlist_request. On success the address is added to the ' +
      'allowlist and can receive real (non-dryRun) sandbox sends. Requires MOTORICAL_JWT.',
    inputSchema: {
      email: z.string().email(),
      code: z.string().length(6)
    },
    annotations: { title: 'Confirm sandbox allowlist code', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: (client) => async (args) => client.sandboxAllowlistConfirm(args),
  },

  {
    name: 'motorical_sandbox_provision',
    description:
      'Provision unpaid developer sandbox (*.sandbox.motorical.com + outbound-locked Motor Block). ' +
      'Over hosted OAuth, this NEVER returns credentials -- the response has credentialsAvailable:false ' +
      'instead. The new Motor Block is added to your authorization, but an access token minted before ' +
      'provisioning does not list it -- if a send returns "Motor block is not covered by this authorization", ' +
      'refresh the OAuth token and retry. Credentials become available via a dashboard link after ' +
      'motorical_sandbox_convert. Only the local @motorical/mcp stdio server (dashboard-JWT auth) ' +
      'still returns mk_live_ once, since it is the customer\'s own long-running process on their own ' +
      'infrastructure -- securing whatever it returns is the customer\'s own responsibility on that path.',
    inputSchema: {
      handle: z.string().optional(),
      channel: z.enum(['cli', 'agent', 'web']).optional()
    },
    annotations: { title: 'Provision developer sandbox', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: (client) => async (args) => client.sandboxProvision(args),
  },

  {
    name: 'motorical_sandbox_convert',
    description:
      'Convert sandbox Motor Block onto a verified customer domain. Requires an active Motorical ' +
      'plan -- if none exists, this call throws with err.data.code === "subscription_required" and ' +
      'err.data.upgradeUrl naming where a human can subscribe; retry this same call once they have. ' +
      'If no sandbox exists yet (check motorical_sandbox_status first -- data.stage: "not_started"), call ' +
      'motorical_sandbox_provision instead; this endpoint returns 404 "No developer sandbox to convert" otherwise. ' +
      'The response always includes activeAuthMethod (the Motor Block\'s configured auth method -- ' +
      '"Password", "API Key", "OAuth 2.0", or "mTLS" -- read-only, changing it is dashboard-only). ' +
      'Over hosted OAuth it also includes credentialsLocation, a link to the dashboard where the customer ' +
      'can view or regenerate the actual credential value -- this tool never returns the raw value itself.',
    inputSchema: {
      domainId: z.string().uuid()
    },
    annotations: { title: 'Convert sandbox to production', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    handler: (client) => async (args) => client.sandboxConvert(args),
  },

  {
    name: 'motorical_domain_add',
    description:
      'Add a customer domain (POST /api/domains). Returns verification DNS instructions. ' +
      'For cname_managed DKIM publish the CNAME in verification.records.dkim / dnsRecords (not a TXT p= key). ' +
      'On 409 (domain already registered), call motorical_domain_list first to check whether it is already on ' +
      'this account before asking the user to resolve the conflict. Requires MOTORICAL_JWT.',
    inputSchema: {
      domain: z.string().min(3),
      verificationMethod: z.enum(['dns', 'email']).optional(),
      motorBlockId: z
        .string()
        .uuid()
        .optional()
        .describe('Optional. This operation acts on the whole account, so a Motor Block is never needed; pass one only to record which block the call was made on behalf of.'),
      idempotencyKey: z.string().optional().describe('Optional. Pass the same value on a retry to get the exact original response back, instead of a duplicate.')
    },
    annotations: { title: 'Add a customer domain', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: (client) => async (args) => client.domainAdd(args),
  },

  {
    name: 'motorical_domain_list',
    description:
      'List domains already on this account (GET /api/domains) — id, domain, verified, DNS auth flags. ' +
      'Call this before motorical_domain_add on a 409 conflict to self-diagnose whether the domain is already ' +
      'yours (proceed with the existing id) or genuinely owned by someone else (stop, do not guess). Requires MOTORICAL_JWT.',
    inputSchema: {
      motorBlockId: z
        .string()
        .uuid()
        .optional()
        .describe('Optional. This operation acts on the whole account, so a Motor Block is never needed; pass one only to record which block the call was made on behalf of.')
    },
    annotations: { title: 'List account domains', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.domainList(args),
  },

  {
    name: 'motorical_domain_verify',
    description:
      'Verify domain ownership and refresh DKIM/SPF/DMARC send-readiness flags (POST /api/domains/{id}/verify). ' +
      'Requires confirm:true — this call is destructive/consequential. Returns sendReady. Requires MOTORICAL_JWT.',
    inputSchema: {
      domainId: z.string().uuid(),
      method: z.enum(['dns', 'email']).optional(),
      motorBlockId: z
        .string()
        .uuid()
        .optional()
        .describe('Optional. This operation acts on the whole account, so a Motor Block is never needed; pass one only to record which block the call was made on behalf of.'),
      confirm: z.boolean().optional().describe('Required: true. Confirms this destructive action.')
    },
    annotations: { title: 'Verify domain ownership', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    mrtr: {
      confirmArg: 'confirm',
      message: (args) => `Verify domain ${args.domainId}? This changes account-visible DNS/send-readiness state.`,
    },
    handler: (client) => async (args) => client.domainVerify(args),
  },

  {
    name: 'motorical_domain_check_dns',
    description:
      'Live-check DKIM/SPF/DMARC and persist dkim_configured/spf_configured (POST /api/domains/{id}/check-dns). ' +
      'Required before /v1/send when ownership is verified but send returns DOMAIN_DNS_INCOMPLETE. Requires MOTORICAL_JWT.',
    inputSchema: {
      domainId: z.string().uuid(),
      recordType: z.enum(['dkim', 'spf', 'dmarc', 'mx']).optional(),
      motorBlockId: z
        .string()
        .uuid()
        .optional()
        .describe('Optional. This operation acts on the whole account, so a Motor Block is never needed; pass one only to record which block the call was made on behalf of.')
    },
    annotations: { title: 'Live-check domain DNS', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: (client) => async (args) => client.domainCheckDns(args),
  },

  {
    name: 'motorical_web_handoff',
    description:
      'Mint a one-time CLI→browser handoff URL (POST /api/auth/web-handoff). ' +
      'Open the URL so the human can set a dashboard password / use the UI. Requires MOTORICAL_JWT.',
    inputSchema: {
      path: z.string().optional().describe('Optional in-app path after handoff, e.g. /usage')
    },
    annotations: { title: 'Create browser handoff link', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: (client) => async (args) => client.webHandoff(args),
  },

  {
    name: 'motorical_signup_handoff',
    description:
      'Bridge a human with no Motorical account onto this OAuth client (POST /api/auth/signup-handoff). ' +
      'Call with no continuationToken first: returns a one-time URL for the human to open in a browser, ' +
      'which runs signup if needed and then the normal OAuth consent screen for this client -- one ' +
      'browser visit gets them to a usable session. No credential is ever returned by this tool. Call ' +
      'again with the continuationToken once the human says they are done; status stays awaiting_browser ' +
      'until the account is verified with a password set. Only ever reachable on the unauthenticated ' +
      'signup audience (mcp.motorical.com/v1/signup/mcp) -- every other server requires a bearer already.',
    inputSchema: {
      clientId: z.string().url().optional().describe('Required on the first call: this CIMD OAuth client\'s https:// client_id.'),
      redirectUri: z.string().url().optional().describe('Required on the first call: must match one of clientId\'s registered redirect_uris.'),
      resource: z.string().url().optional().describe('Required on the first call: the RFC 8707 resource (canonical MCP server URI) the agent ultimately wants a token for.'),
      codeChallenge: z.string().optional().describe('Required on the first call: PKCE code_challenge.'),
      codeChallengeMethod: z.literal('S256').optional().describe('Required on the first call: PKCE method, always S256.'),
      scope: z.string().optional(),
      state: z.string().optional(),
      continuationToken: z.string().optional().describe('From a prior call\'s response. Present this instead of the other fields to check status.'),
    },
    // idempotentHint: false. A call with no continuationToken mints a FRESH
    // 64-hex code and a fresh 30-minute Redis record every single time — the
    // opposite of idempotent. Declaring it true invites a host to auto-retry a
    // timed-out or errored call, which quietly multiplies handoff records and
    // burns the mint rate limit (backend rateLimiter.js's
    // signupHandoffMintRateLimit) on an unauthenticated route. The
    // continuationToken branch IS a pure read, but one annotation covers both
    // and the honest value for the pair is the non-idempotent one.
    annotations: { title: 'Bridge a new user to signup + OAuth consent', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: (client) => async (args) => client.signupHandoff(args),
  },

  // ---- Analytics & health tools ----
  // Each wraps one existing Public API route one-to-one. See
  // motorical-docs/plans/2026-09-02-mcp-analytics-health-tools-implementation.md.
  // .optional() on purpose, matching every pre-existing block-scoped tool: a
  // grant covering exactly one Motor Block resolves it automatically, so the
  // caller only has to name one when the grant covers several. Making it
  // required forces single-block users to supply an id they should never need,
  // and turns the multi-block case into a Zod type error instead of
  // resolveBlock's actionable message.

  {
    name: 'motorical_get_overview',
    description:
      'Sending overview for one Motor Block over a date range — volume, delivery and bounce '
      + 'rates, and current usage against plan limits (GET /api/public/v1/motor-blocks/{id}/overview).',
    inputSchema: {
      motorBlockId: blockSelector,
      from: isoDate('inclusive'),
      to: isoDate('inclusive')
    },
    annotations: { title: 'Get Motor Block overview', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getOverview(args),
  },

  {
    name: 'motorical_get_daily_summary',
    description: 'Per-day send counts and outcomes for one Motor Block (GET /api/public/v1/motor-blocks/{id}/daily-summary).',
    inputSchema: {
      motorBlockId: blockSelector,
      days: z.number().int().positive().optional().describe('How many days back, counting today')
    },
    annotations: { title: 'Get daily send summary', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getDailySummary(args),
  },

  {
    name: 'motorical_get_metrics',
    description: 'Time-series send metrics for one Motor Block, bucketed by hour or day (GET /api/public/v1/motor-blocks/{id}/metrics).',
    inputSchema: {
      motorBlockId: blockSelector,
      from: isoDate('inclusive'),
      to: isoDate('inclusive'),
      interval: z.enum(['hour', 'day']).optional().describe('Bucket size; defaults to the API default')
    },
    annotations: { title: 'Get send metrics', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getMetrics(args),
  },

  {
    name: 'motorical_get_deliverability',
    description: 'Deliverability broken down by recipient domain (GET /api/public/v1/motor-blocks/{id}/deliverability).',
    inputSchema: {
      motorBlockId: blockSelector,
      from: isoDate('inclusive'),
      to: isoDate('inclusive'),
      limit: z.number().int().positive().optional().describe('Max recipient domains returned')
    },
    annotations: { title: 'Get deliverability by domain', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getDeliverability(args),
  },

  {
    name: 'motorical_get_reputation',
    description: 'Current sending reputation for one Motor Block (GET /api/public/v1/motor-blocks/{id}/reputation).',
    inputSchema: { motorBlockId: blockSelector },
    annotations: { title: 'Get sending reputation', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getReputation(args),
  },

  {
    name: 'motorical_get_anomalies',
    description: 'Detected sending anomalies for one Motor Block — volume spikes, bounce surges, unusual patterns (GET /api/public/v1/motor-blocks/{id}/anomalies).',
    inputSchema: { motorBlockId: blockSelector },
    annotations: { title: 'Get sending anomalies', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getAnomalies(args),
  },

  {
    name: 'motorical_get_providers',
    description: 'Send outcomes grouped by receiving mailbox provider (GET /api/public/v1/motor-blocks/{id}/providers).',
    inputSchema: {
      motorBlockId: blockSelector,
      from: isoDate('inclusive'),
      to: isoDate('inclusive'),
      limit: z.number().int().positive().optional().describe('Max providers returned')
    },
    annotations: { title: 'Get outcomes by provider', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getProviders(args),
  },

  {
    name: 'motorical_get_error_codes',
    description: 'SMTP error codes seen for one Motor Block, with counts and diagnostics (GET /api/public/v1/motor-blocks/{id}/error-codes).',
    inputSchema: {
      motorBlockId: blockSelector,
      from: isoDate('inclusive'),
      to: isoDate('inclusive'),
      limit: z.number().int().positive().optional().describe('Max distinct error codes returned')
    },
    annotations: { title: 'Get SMTP error codes', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getErrorCodes(args),
  },

  {
    name: 'motorical_get_rate_limits',
    description: "Current hourly and daily send usage against this Motor Block's limits (GET /api/public/v1/motor-blocks/{id}/rate-limits).",
    inputSchema: { motorBlockId: blockSelector },
    annotations: { title: 'Get Motor Block rate limits', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getRateLimits(args),
  },

  {
    name: 'motorical_get_account_rate_limits',
    description:
      'Account-wide send ceiling and current usage across every Motor Block '
      + '(GET /api/public/v1/account/rate-limits). Account-scoped: no Motor Block needed.',
    inputSchema: {
      motorBlockId: z.string().uuid().optional()
        .describe('Optional. This operation acts on the whole account, so a Motor Block is never needed; pass one only to record which block the call was made on behalf of.')
    },
    annotations: { title: 'Get account rate limits', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getAccountRateLimits(args),
  },

  {
    name: 'motorical_get_onboarding_state',
    description:
      'Where this account stands right now: stage, whether it can actually send '
      + '(ready_to_send), what\'s blocking it, and the one next tool to call to move forward '
      + '(GET /api/public/v1/account/state). Account-scoped: no Motor Block needed.',
    inputSchema: {
      motorBlockId: z.string().uuid().optional()
        .describe('Optional. This operation acts on the whole account, so a Motor Block is never needed; pass one only to record which block the call was made on behalf of.')
    },
    annotations: { title: 'Get onboarding/account state', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getAccountState(args),
  },

  {
    name: 'motorical_get_logs',
    description:
      'Search send logs for one Motor Block (GET /api/public/v1/motor-blocks/{id}/logs). '
      + 'Paginate with cursor. Recipient addresses are masked unless the token carries logs.pii, '
      + 'which OAuth tokens never do.',
    inputSchema: {
      motorBlockId: blockSelector,
      from: isoDate('inclusive'),
      to: isoDate('inclusive'),
      currentOutcome: z.string().optional().describe('Filter to one delivery outcome, e.g. delivered, bounced, deferred'),
      query: z.string().optional().describe('Free-text match against recipient, subject or message id'),
      limit: z.number().int().positive().optional().describe('Page size'),
      cursor: z.string().optional().describe('Opaque cursor from a previous page'),
      includePII: z.boolean().optional().describe('Unmask recipient addresses. Requires the logs.pii scope, which is never granted to OAuth tokens — the API returns 403.')
    },
    annotations: { title: 'Search send logs', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getLogs(args),
  },

  {
    name: 'motorical_get_message_by_smtp_id',
    description:
      'Look up one message by its SMTP Message-ID header (GET /api/public/v1/messages?smtpMessageId=). '
      + 'This is a lookup, not a listing: an exact id is required and at most one message is returned. '
      + 'Use motorical_get_message when you have the internal send UUID instead.',
    inputSchema: {
      smtpMessageId: z.string().describe('The exact SMTP Message-ID, angle brackets included'),
      motorBlockId: blockSelector,
      includePII: z.boolean().optional().describe('Unmask the recipient address. Requires the logs.pii scope, which is never granted to OAuth tokens — the API returns 403.')
    },
    annotations: { title: 'Get message by SMTP Message-ID', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getMessageBySmtpId(args),
  },

  {
    name: 'motorical_get_config',
    description: "Configuration of one Motor Block — its sending domain, limits, delivery settings, and activeAuthMethod (\"Password\"/\"API Key\"/\"OAuth 2.0\"/\"mTLS\", read-only -- changing it is dashboard-only) (GET /api/public/v1/motor-blocks/{id}/config).",
    inputSchema: { motorBlockId: blockSelector },
    annotations: { title: 'Get Motor Block config', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getConfig(args),
  },

  {
    name: 'motorical_get_domain_health',
    description: "DNS and email-authentication health for the Motor Block's sending domain — SPF, DKIM, DMARC, MX (GET /api/public/v1/motor-blocks/{id}/domain-health).",
    inputSchema: {
      motorBlockId: blockSelector,
      refresh: z.boolean().optional().describe('Re-run the live DNS checks now instead of returning the last cached result')
    },
    annotations: { title: 'Get domain health', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.getDomainHealth(args),
  },

  {
    name: 'motorical_webhook_list',
    description: 'List webhook endpoints registered on one Motor Block (GET /api/public/v1/motor-blocks/{id}/webhooks).',
    inputSchema: { motorBlockId: blockSelector },
    annotations: { title: 'List webhook endpoints', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.webhookList(args),
  },

  {
    name: 'motorical_webhook_create',
    description:
      'Register a new webhook endpoint on one Motor Block (POST /api/public/v1/motor-blocks/{id}/webhooks). '
      + 'The response includes the full signing secret exactly once — store it immediately, it is only masked on every later read.',
    inputSchema: {
      motorBlockId: blockSelector,
      url: z.string().url().describe('HTTPS endpoint that will receive webhook deliveries'),
      events: z.array(z.string()).optional().describe('Event types to subscribe to; defaults to all event types when omitted'),
      idempotencyKey: z.string().optional().describe('Optional. Pass the same value on a retry to get the exact original response back, instead of a duplicate.')
    },
    annotations: { title: 'Create webhook endpoint', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: (client) => async (args) => client.webhookCreate(args),
  },

  {
    name: 'motorical_webhook_update',
    description: 'Update a webhook endpoint\'s url, events, or enabled state (PUT /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}). Only the fields you pass are changed.',
    inputSchema: {
      motorBlockId: blockSelector,
      webhookId: webhookIdArg,
      url: z.string().url().optional(),
      events: z.array(z.string()).optional(),
      enabled: z.boolean().optional(),
      idempotencyKey: z.string().optional().describe('Optional. Pass the same value on a retry to get the exact original response back, instead of a duplicate.')
    },
    annotations: { title: 'Update webhook endpoint', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.webhookUpdate(args),
  },

  {
    name: 'motorical_webhook_delete',
    description: 'Delete a webhook endpoint (DELETE /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}).',
    inputSchema: {
      motorBlockId: blockSelector,
      webhookId: webhookIdArg,
      confirm: z.boolean().optional().describe('Required: true. Confirms this destructive action.')
    },
    annotations: { title: 'Delete webhook endpoint', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    mrtr: {
      confirmArg: 'confirm',
      message: (args) => `Delete webhook ${args.webhookId}? This cannot be undone.`,
    },
    handler: (client) => async (args) => client.webhookDelete(args),
  },

  {
    name: 'motorical_webhook_test',
    description: 'Send a synthetic test delivery to a webhook endpoint (POST /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/test).',
    inputSchema: { motorBlockId: blockSelector, webhookId: webhookIdArg },
    annotations: { title: 'Send test webhook delivery', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: (client) => async (args) => client.webhookTest(args),
  },

  {
    name: 'motorical_webhook_get_deliveries',
    description: 'Recent delivery attempts for one webhook endpoint (GET /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/deliveries).',
    inputSchema: {
      motorBlockId: blockSelector,
      webhookId: webhookIdArg,
      limit: z.number().int().positive().max(200).optional().describe('Default 50, max 200')
    },
    annotations: { title: 'Get webhook delivery attempts', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.webhookGetDeliveries(args),
  },

  {
    name: 'motorical_webhook_get_stats',
    description: 'Delivery success/failure counts and average latency for one webhook endpoint over a time window (GET /api/public/v1/motor-blocks/{id}/webhooks/{webhookId}/stats).',
    inputSchema: {
      motorBlockId: blockSelector,
      webhookId: webhookIdArg,
      hours: z.number().int().positive().max(168).optional().describe('Default 24, max 168 (7 days)')
    },
    annotations: { title: 'Get webhook delivery stats', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (client) => async (args) => client.webhookGetStats(args),
  },
];

// Requires-scope (and, where it applies, auth-method) text is GENERATED here,
// once, rather than hand-typed into 35 description strings — this file's own
// header comment says there is deliberately no second place a tool's
// description can be stated, and hand-editing every literal would have
// created exactly that. AUTH_METHOD_LIMITED names the two tools that need a
// dashboard session regardless of scope (UNAVAILABLE_TOOL_FOR_METHOD in
// delegatedClient.js) — everything else with a TOOL_SCOPES entry works over
// either a dashboard JWT or OAuth/Delegation once the scope is granted.
const AUTH_METHOD_LIMITED = new Set([
  'motorical_sandbox_allowlist_request',
  'motorical_sandbox_allowlist_confirm',
]);

for (const tool of TOOLS) {
  const scopes = TOOL_SCOPES[tool.name];
  if (!scopes || scopes.length === 0) continue;
  const scopeText = scopes
    .map((s) => `${s} (${SCOPES[s].agentDescription})`)
    .join('; ');
  let suffix = ` Requires OAuth scope: ${scopeText}.`;
  if (AUTH_METHOD_LIMITED.has(tool.name)) {
    suffix += ' Needs a dashboard session, not OAuth — granting this scope does not make this tool callable over a hosted OAuth/Delegation connection.';
  }
  tool.description += suffix;
}

const byName = new Map(TOOLS.map((t) => [t.name, t]));

export function toolByName(name) {
  return byName.get(name);
}

// Mirrors servers.js's scope gate: a tool with no annotations must never load.
// Clients treat an unannotated tool as the most dangerous case, so a missing
// annotation is not cosmetic -- it changes how a host prompts the user.
//
// The gate checks TYPE, not merely presence: `=== undefined` would have let
// `destructiveHint: null` (or 'false', or 0) load, and a host reading a
// non-boolean hint has no defined behaviour -- the very ambiguity annotations
// exist to remove.
const ANNOTATION_TYPES = {
  title: 'string',
  readOnlyHint: 'boolean',
  destructiveHint: 'boolean',
  idempotentHint: 'boolean',
  openWorldHint: 'boolean',
};
for (const t of TOOLS) {
  if (!t.annotations) throw new Error(`registry.js: tool "${t.name}" has no annotations`);
  for (const [f, expected] of Object.entries(ANNOTATION_TYPES)) {
    if (typeof t.annotations[f] !== expected) {
      throw new Error(
        `registry.js: tool "${t.name}" annotations.${f} must be a ${expected}, got ${
          t.annotations[f] === null ? 'null' : typeof t.annotations[f]
        }`
      );
    }
  }
}
