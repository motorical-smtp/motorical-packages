// packages/motorical-mcp/src/native/discover.js
import { NATIVE_VERSION } from './revision.js';
import { instructionsFor } from '../instructions.js';

// One hour. The tool list for a scoped path changes only when this package is
// redeployed, so a long TTL is honest and saves every client a round trip.
const DISCOVER_TTL_MS = 3600000;

export function buildDiscoverResult({ server, version }) {
  return {
    resultType: 'complete',
    supportedVersions: [NATIVE_VERSION],
    // Advertise ONLY what dispatchNative actually answers. It handles exactly
    // three methods -- server/discover, tools/list, tools/call -- so `tools` is
    // the whole truthful set. `resources` was measured returning -32601 Method
    // not found before Task 8 implemented native resource dispatch for the
    // analytics server (the one tool motorical_get_onboarding_state that needs
    // them). It is now genuinely served, so it is advertised SCOPED to that one
    // server, not broadcast to all six paths -- mirroring exactly why Tasks
    // ended up not advertised on every path: it can only be created by
    // motorical_send_email, which analytics-scoped paths do not expose at all.
    //
    // `prompts` was also measured returning -32601 and stays withheld until
    // native dispatch is implemented for it.
    //
    // Tasks is DELIBERATELY NOT ADVERTISED, though it is implemented.
    // dispatch.js really does answer tasks/get and tasks/list, and they are
    // tested -- but two conformance gaps make advertising them premature, and
    // this file's own rule above ("the advertisement must match what is
    // callable") is what forbids it:
    //
    //   1. Not callable everywhere it would be advertised. This capability
    //      object would be identical for all six server paths, but tasks/get can
    //      only resolve tasks created by motorical_send_email -- a tool the
    //      analytics-scoped paths do not expose at all. Advertising on a path
    //      where nothing can ever create a task promises a working surface that
    //      is inert there.
    //   2. The response shape is not the spec's. tasks/get returns this
    //      package's own {status: 'completed'|'still_pending'|'not_found'}
    //      resolver output, not the Tasks spec's `Task` object (whose status
    //      vocabulary differs and which carries required fields this does not
    //      emit), and task creation does not follow the spec's own
    //      task-creation protocol.
    //
    // Removing the advertisement is the cheap half of the fix: dispatch.js
    // gates both methods on the CLIENT's declared capability, so with nothing
    // advertised no real client can discover, declare, or reach them -- the
    // code stays in place, correct and tested, ready for a follow-up that
    // finishes spec conformance and re-adds
    // `extensions: { 'io.modelcontextprotocol/tasks': {} }` here deliberately.
    capabilities: {
      tools: {},
      ...(server.key === 'analytics' ? { resources: {} } : {}),
    },
    _meta: {
      'io.modelcontextprotocol/serverInfo': { name: `motorical-${server.key}`, version },
    },
    instructions: instructionsFor(server.key),
    ttlMs: DISCOVER_TTL_MS,
    // PUBLIC is correct only because `allowedTools` is per PATH, not per user:
    // every caller on this path is told exactly the same thing. The spec allows
    // a public response to be shared across access tokens, so if this ever
    // becomes user-dependent it MUST change to 'private'.
    cacheScope: 'public',
  };
}
