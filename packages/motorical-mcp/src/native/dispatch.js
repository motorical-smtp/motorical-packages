// packages/motorical-mcp/src/native/dispatch.js
//
// The 2026-07-28 dispatcher. Pure over a parsed body: no Express, no sockets,
// so it is unit-testable without a transport. It exists because the TypeScript
// SDK tops out at 2025-11-25 and cannot serve server/discover.
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import {
  objectFromShape,
  safeParseAsync,
  getParseErrorMessage,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, toolByName } from '../registry.js';
import { buildDiscoverResult } from './discover.js';
import { resolveTask } from './taskResolver.js';
import * as defaultTaskStore from './taskStore.js';
import { assertMotorBlockAuthorized } from '../delegatedClient.js';
import { RESOURCES, RESOURCE_TEMPLATES, resourceByUri, matchResourceTemplate } from '../resources.js';
import { signRequestState, verifyRequestState } from './requestState.js';

const TOOLS_TTL_MS = 3600000;
const RESOURCES_TTL_MS = 300000; // 5 minutes -- matches resources.js's own CACHE_TTL_MS

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

const CLIENT_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';
const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';

// Mirrors revision.js's own shape check exactly (non-null, non-array object)
// rather than a bare truthiness test, for the same reason: an array is
// truthy and would pass a naive check by accident, and refusing is the safe
// default in that ambiguous case. Applied at BOTH levels below -- the
// clientCapabilities object itself, and the nested extensions object -- so a
// malformed or absent value at either level fails closed to "not declared"
// instead of throwing.
//
// Spec MUST: "Never return a task to a client that did not declare the
// extension." A caller who never declared io.modelcontextprotocol/tasks must
// fall through to the same -32601 Method not found a client gets for any
// unrecognized method -- not a distinguishable "permission denied" that would
// leak the capability's existence to a client that was never offered it.
//
// Per the verified spec (https://modelcontextprotocol.io/extensions/tasks/
// overview, fetched 2026-09-06), a client declares Tasks support by nesting
// the extension's key under an `extensions` object inside its
// clientCapabilities -- not as a bare sibling key directly on
// clientCapabilities. This mirrors the server-side shape in discover.js's
// `capabilities.extensions`.
function declaresTasksCapability(body) {
  const meta = body.params?._meta;
  const capabilities = meta && typeof meta === 'object' ? meta[CLIENT_CAPABILITIES] : null;
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) return false;
  const extensions = capabilities.extensions;
  if (!extensions || typeof extensions !== 'object' || Array.isArray(extensions)) return false;
  const tasks = extensions[TASKS_EXTENSION];
  return Boolean(tasks) && typeof tasks === 'object' && !Array.isArray(tasks);
}

// registry.js's `inputSchema`/`outputSchema` are Zod RAW SHAPES -- plain
// objects whose values are Zod validator instances -- not JSON Schema.
// JSON.stringify on a Zod validator is meaningless, so those fields must be
// converted before they go on the wire, or tools/list advertises garbage and
// no client can call a single tool.
//
// We reproduce EXACTLY what the legacy path does (server/mcp.js's
// registerTool -> getZodSchemaObject -> objectFromShape, then the
// ListToolsRequestSchema handler's normalizeObjectSchema + toJsonSchemaCompat
// call), not a hand-replicated approximation of it:
//
// 1. Build the Zod object with the SDK's OWN `objectFromShape`
//    (server/zod-compat.js) -- NOT `z.object(shape)`. These are not always
//    the same schema: objectFromShape special-cases a zero-key shape to
//    default to a Zod v4-Mini empty object (`z4mini.object({})`), while every
//    non-empty raw shape in this registry (all Zod v3) goes through
//    `z3rt.object(shape)`, the same underlying `zod` module this package
//    already depends on. Using `z.object({})` for the empty case would build
//    a v3 object where legacy built a v4-Mini one, and the two convert to
//    JSON Schema differently.
// 2. Convert with the SDK's OWN `toJsonSchemaCompat` (server/zod-json-schema-
//    compat.js), passing the SAME options server/mcp.js's
//    ListToolsRequestSchema handler passes at its two call sites --
//    {strictUnions: true, pipeStrategy: 'input'} for inputSchema,
//    {strictUnions: true, pipeStrategy: 'output'} for outputSchema. These are
//    not optional flourishes: pipeStrategy defaults to 'input' when omitted,
//    so an outputSchema containing `.pipe()` would silently diverge (measured:
//    legacy emits type:'number', a call with no options emits type:'string').
//    Passing the SDK's own arguments to the SDK's own function is parity with
//    the legacy path, not hand-replication of it.
//
// Both deep imports sit outside the package's documented top-level exports
// ("."/"./client"/"./server"/etc.) but are reachable through the catch-all
// "./*" -> "./dist/esm/*" wildcard exactly the way every other deep import in
// this file (server/mcp.js, server/streamableHttp.js, server/stdio.js)
// already does -- confirmed by direct dynamic imports before writing this
// file. (A naive `dist/esm/server/...` specifier double-prefixes through that
// same wildcard and 404s; the bare `server/...` form is the one that
// resolves.)
//
// There is deliberately NO special case for an empty/undefined shape here.
// `registerTool()` on the legacy path converts a raw shape into a real Zod
// object object at REGISTRATION time (getZodSchemaObject), so by the time the
// list handler runs, tool.inputSchema is already a Zod schema instance and
// `normalizeObjectSchema()` takes its "already a schema" branch -- it never
// returns undefined, so the legacy list handler's own `EMPTY_OBJECT_JSON_
// SCHEMA` literal fallback is dead code for every tool registered this way.
// Concretely, for `motorical_get_send_status` (inputSchema: {}), legacy's
// `obj` is the v4-Mini empty object from step 1, and toJsonSchemaCompat is
// called on THAT -- producing
// `{ type: 'object', properties: {}, $schema: '...' }`, which carries a
// `$schema` key the old native-side literal `{ type: 'object', properties: {}
// }` did not. Routing every shape (empty included) through the same two steps
// above reproduces this exactly instead of guessing at it.
function jsonSchemaFromShape(shape, pipeStrategy) {
  return toJsonSchemaCompat(objectFromShape(shape ?? {}), { strictUnions: true, pipeStrategy });
}

function toolDefinition(t) {
  return {
    name: t.name,
    description: t.description,
    inputSchema: jsonSchemaFromShape(t.inputSchema, 'input'),
    annotations: t.annotations,
    // Mirrors the SDK: outputSchema is emitted only when the tool declared
    // one at all (`tool.outputSchema` truthy after registration) -- not
    // gated on the shape being non-empty. Every outputSchema in this
    // registry happens to be non-empty today, but the legacy path's own gate
    // is presence, not shape size (getZodSchemaObject(undefined) is the only
    // thing that returns undefined here), so this mirrors that rather than a
    // stricter condition that happens to agree only by accident.
    ...(t.outputSchema ? { outputSchema: jsonSchemaFromShape(t.outputSchema, 'output') } : {}),
  };
}

function visibleTools(server) {
  return TOOLS.filter((t) => server.tools.includes(t.name));
}

// The legacy path's own refusal shape. server/mcp.js's CallTool handler throws
// an McpError for a validation failure and then CATCHES it one line later,
// returning createToolError(error.message) -- a CallToolResult with isError
// true and NO structuredContent, whose text carries the SDK's own
// "MCP error -32602: " prefix. It is deliberately NOT a JSON-RPC error object;
// verified by execution against this SDK version. Building the message through
// McpError rather than hand-writing that prefix keeps the two paths from
// drifting if the SDK ever changes how it renders one.
//
// If the platform later decides a JSON-RPC -32602 is the more correct wire
// answer for a validation failure, BOTH paths must change together -- the
// whole point of this block is that they agree.
const validationErrorResult = (message) => ({
  content: [{ type: 'text', text: new McpError(ErrorCode.InvalidParams, message).message }],
  isError: true,
});

// Mirrors server/mcp.js's validateToolInput: normalize the raw shape to a Zod
// object (objectFromShape, the same call jsonSchemaFromShape above uses, so the
// schema that is ENFORCED is the schema that was ADVERTISED), safeParse the
// arguments, and refuse before the handler is ever constructed. Returning
// parseResult.data rather than the raw arguments is load-bearing: Zod STRIPS
// unknown keys, and client.sendEmail spreads ...rest into the POST /v1/send
// body, so a forwarded unknown key is not inert.
async function validateArguments(tool, args) {
  const parsed = await safeParseAsync(objectFromShape(tool.inputSchema ?? {}), args);
  if (parsed.success) return { ok: true, args: parsed.data };
  const detail = getParseErrorMessage('error' in parsed ? parsed.error : 'Unknown error');
  return {
    ok: false,
    result: validationErrorResult(
      `Input validation error: Invalid arguments for tool ${tool.name}: ${detail}`
    ),
  };
}

// Mirrors server/mcp.js's validateToolOutput, including its two skips: a tool
// that declared no outputSchema is not checked, and an isError result is not
// checked either (an upstream failure follows no tool's success schema).
async function validateOutput(tool, result) {
  if (!tool.outputSchema || result.isError) return null;
  if (!result.structuredContent) {
    return validationErrorResult(
      `Output validation error: Tool ${tool.name} has an output schema but no structured content was provided`
    );
  }
  const parsed = await safeParseAsync(objectFromShape(tool.outputSchema), result.structuredContent);
  if (parsed.success) return null;
  const detail = getParseErrorMessage('error' in parsed ? parsed.error : 'Unknown error');
  return validationErrorResult(
    `Output validation error: Invalid structured content for tool ${tool.name}: ${detail}`
  );
}

// JSON-RPC 2.0: a request object with no `id` member is a NOTIFICATION, and the
// server MUST NOT reply to it -- not with a result, and explicitly not with an
// error object. The dispatcher was answering an unroutable notification with
// {jsonrpc, id: null, error: {code: -32601}}, which the spec forbids; over HTTP
// the correct answer is 202 Accepted with no body (http.js does that when this
// returns null). The method still runs first, so a notification's side effects
// are not silently dropped -- only its response is suppressed.
// notifications/initialized is hard-routed legacy in revision.js, so the common
// case never reaches here; this closes the rest.
function isNotification(body) {
  return !body || typeof body !== 'object' || !('id' in body);
}

export async function dispatchNative(body, ctx) {
  const response = await handleRequest(body, ctx);
  return isNotification(body) ? null : response;
}

async function handleRequest(body, { server, client, version, taskStore = defaultTaskStore }) {
  const { id = null, method } = body || {};

  if (method === 'server/discover') {
    return ok(id, buildDiscoverResult({ server, version }));
  }

  if (method === 'tools/list') {
    return ok(id, {
      resultType: 'complete',
      tools: visibleTools(server).map(toolDefinition),
      ttlMs: TOOLS_TTL_MS,
      cacheScope: 'public',
    });
  }

  if (method === 'tools/call') {
    const name = body.params?.name;
    // Authority check FIRST. A tool absent from this scoped server must be
    // refused before its handler is constructed, let alone run -- the
    // advertisement and what is callable have to agree in both directions.
    if (!name || !server.tools.includes(name)) {
      return fail(id, -32602, `Unknown tool for this server: ${name}`);
    }
    const tool = toolByName(name);
    if (!tool) return fail(id, -32602, `Unknown tool: ${name}`);

    // Schema enforcement, exactly as the legacy path does it. Without this the
    // server advertises an inputSchema it does not enforce, and the two paths
    // -- whose whole discipline is that they must agree -- accept different
    // arguments for the same tool name.
    const validated = await validateArguments(tool, body.params?.arguments ?? {});
    if (!validated.ok) return ok(id, validated.result);

    // MRTR interception: a tool flagged in the registry with an `mrtr` block
    // must not run its handler until the caller has explicitly confirmed, on
    // the EXACT arguments that were shown to them. The requestState token
    // (Task 5's signRequestState/verifyRequestState) binds the confirmation
    // to those args' hash so a client can't send an "accept" alongside
    // different arguments than what the original prompt described.
    if (tool.mrtr) {
      const inputResponse = body.params?.inputResponses?.[tool.mrtr.confirmArg];
      if (inputResponse) {
        const requestState = body.params?.requestState;
        const validState = typeof requestState === 'string'
          && verifyRequestState(requestState, { tool: name, args: validated.args });
        if (!validState) {
          return ok(id, {
            resultType: 'input_required',
            inputRequests: {
              [tool.mrtr.confirmArg]: {
                method: 'elicitation/create',
                params: { mode: 'form', message: tool.mrtr.message(validated.args), requestedSchema: { type: 'object', properties: {} } },
              },
            },
            requestState: signRequestState({ tool: name, args: validated.args }),
          });
        }
        if (inputResponse.action === 'accept') {
          validated.args[tool.mrtr.confirmArg] = true;
          // fall through to the normal handler call below, now with confirm:true injected
        } else {
          return ok(id, { resultType: 'complete', content: [{ type: 'text', text: 'Cancelled — no changes made.' }], isError: false });
        }
      } else {
        return ok(id, {
          resultType: 'input_required',
          inputRequests: {
            [tool.mrtr.confirmArg]: {
              method: 'elicitation/create',
              params: { mode: 'form', message: tool.mrtr.message(validated.args), requestedSchema: { type: 'object', properties: {} } },
            },
          },
          requestState: signRequestState({ tool: name, args: validated.args }),
        });
      }
    }

    try {
      const data = await tool.handler(client)(validated.args);
      const result = {
        resultType: 'complete',
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data && typeof data === 'object' ? data : { value: data },
        isError: false,
      };
      return ok(id, (await validateOutput(tool, result)) ?? result);
    } catch (err) {
      // A failing upstream call is a TOOL error the model can reason about,
      // never a transport error that kills the session. Note: the SDK skips
      // output-schema validation entirely when isError is true, so this
      // payload shape is never schema-checked -- deliberately, since upstream
      // failures don't follow any tool's success outputSchema.
      const payload = { error: err.message, status: err.status || null, details: err.data || null };
      return ok(id, {
        resultType: 'complete',
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: true,
      });
    }
  }

  if (method === 'tasks/get' && declaresTasksCapability(body)) {
    const taskId = body.params?.taskId;
    if (!taskId) return fail(id, -32602, 'taskId is required');
    // resolveTask calls client.getMessageRecipients, which on the real
    // delegated client (delegatedClient.js) can throw -- either a genuine
    // upstream/transport failure, or its own resolveBlock() authorization
    // check rejecting a task whose motorBlockId this caller's delegation
    // doesn't cover. Either way this must become a well-formed JSON-RPC
    // error, exactly the way tools/call's own try/catch above turns a
    // failing upstream call into a payload the model can reason about
    // instead of a transport failure -- never an unhandled rejection that
    // surfaces as http.js's bare, non-JSON-RPC 500.
    let outcome;
    try {
      // Mirrors motorical_wait_for_outcome's own new optional arg: without a
      // way to ask for unmasked addresses, two recipients sharing a prefix come
      // back indistinguishable. The route still enforces logs.pii.
      outcome = await resolveTask(taskId, client, taskStore, {
        includePII: body.params?.includePII === true,
      });
    } catch (err) {
      return fail(id, -32603, err.message);
    }
    if (outcome.status === 'not_found') return fail(id, -32602, `Unknown task: ${taskId}`);
    return ok(id, { resultType: 'complete', ...outcome });
  }

  if (method === 'tasks/list' && declaresTasksCapability(body)) {
    const motorBlockId = body.params?.motorBlockId;
    if (!motorBlockId) return fail(id, -32602, 'motorBlockId is required');
    // Authority check, same discipline as tools/call's "Unknown tool for this
    // server" refusal a few lines up: a motorBlockId not covered by the
    // caller's own delegated authority must be refused before the store is
    // ever touched, or any caller with a valid token for this path could read
    // another tenant's live task ids just by naming their motorBlockId.
    // client.motorBlockIds is set by delegatedClient.js's createDelegatedClient
    // to the caller's own authorized set; assertMotorBlockAuthorized is the
    // SAME check resolveBlock/optionalBlock enforce for every tool call, not a
    // parallel one built for this method.
    try {
      assertMotorBlockAuthorized(client.motorBlockIds ?? [], motorBlockId);
    } catch (err) {
      return fail(id, -32602, err.message);
    }
    const taskIds = await taskStore.listTasksForMotorBlock(motorBlockId);
    return ok(id, {
      resultType: 'complete',
      tasks: taskIds.map((taskId) => ({ taskId })),
      ttlMs: 0,
      cacheScope: 'private',
    });
  }

  // Resource/resource-template surface is analytics-server-only (Global
  // Constraints) -- same reasoning tools/list already applies per-server via
  // visibleTools(). A resource-not-found error is -32602 (Invalid Params) per
  // the verified spec (modelcontextprotocol.io/specification/2026-07-28/
  // server/resources, fetched 2026-09-06) -- NOT -32601, which is reserved
  // for a genuinely unrecognized method.
  if (method === 'resources/list') {
    const resources = server.key === 'analytics' ? RESOURCES.map(({ handler, ...meta }) => meta) : [];
    return ok(id, { resultType: 'complete', resources, ttlMs: RESOURCES_TTL_MS, cacheScope: 'private' });
  }

  if (method === 'resources/templates/list') {
    const resourceTemplates = server.key === 'analytics'
      ? RESOURCE_TEMPLATES.map(({ handler, match, ...meta }) => meta)
      : [];
    return ok(id, { resultType: 'complete', resourceTemplates, ttlMs: RESOURCES_TTL_MS, cacheScope: 'private' });
  }

  if (method === 'resources/read') {
    if (server.key !== 'analytics') return fail(id, -32602, `Resource not found: ${body.params?.uri}`);
    const uri = body.params?.uri;
    if (!uri) return fail(id, -32602, 'uri is required');

    const staticResource = resourceByUri(uri);
    const templateMatch = matchResourceTemplate(uri);
    if (!staticResource && !templateMatch) return fail(id, -32602, `Resource not found: ${uri}`);

    // -32602 (Invalid Params) is only correct for "this resource genuinely
    // does not exist" -- a deterministic fact about the REQUEST, independent
    // of backend/network state. Two different failure classes reach this
    // point and must not be collapsed into one error code:
    //
    //   * A STATIC resource's handler (resources.js's RESOURCES entries --
    //     today, only the account-state resource). It has no uri variables,
    //     so `resourceByUri` already found it above; every error it can
    //     throw is therefore a backend/transport failure (e.g.
    //     client.getAccountState()'s HTTP call failing) -- never a genuine
    //     "not found" of its own. That is a server-side/upstream problem,
    //     -32603 (Internal Error), the same code tasks/get's own
    //     resolveTask-throws branch a few lines up already uses for an
    //     upstream failure, as distinct from its `not_found` outcome's
    //     -32602.
    //
    //   * A TEMPLATE resource's handler (RESOURCE_TEMPLATES -- domain and
    //     motor-block lookups). Per resources.js, the ONLY throw in either
    //     template handler today is its own "not found" case (`Domain not
    //     found: x` / `Motor Block not found: x`), so -32602 is correct here.
    //     A future template handler that throws for some OTHER reason (e.g.
    //     its own upstream call failing) would be misclassified by this
    //     string-agnostic split -- string-matching the message to
    //     distinguish that case is fragile and deliberately not done; if that
    //     ever becomes a real failure mode, the handler itself should signal
    //     it (e.g. a typed error) rather than this dispatcher guessing from
    //     text.
    try {
      const result = staticResource
        ? await staticResource.handler(client)()
        : await templateMatch.template.handler(client)(templateMatch.variables);
      return ok(id, { resultType: 'complete', ...result, ttlMs: RESOURCES_TTL_MS, cacheScope: 'private' });
    } catch (err) {
      if (staticResource) return fail(id, -32603, err.message);
      return fail(id, -32602, err.message);
    }
  }

  return fail(id, -32601, `Method not found: ${method}`);
}
