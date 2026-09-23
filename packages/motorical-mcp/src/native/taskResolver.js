//
// The one place both motorical_wait_for_outcome (works on both protocol
// paths today) and native tasks/get (2026-07-28 only) ask "is this send
// actually done." Deliberately calls the client the SAME way
// getMessage/getMessageEvents already do -- through the public API, never a
// direct DB connection -- so this unit's "reads no DB password" security
// posture (fleet/hosts/ovh24.yaml) stays true after this ships.
//
// Resolution is PULL: this function does nothing until called. No webhook
// hook, no background sweep -- see the design spec's own reasoning
// (Section B) for why that coupling isn't worth it here.
const POLL_INTERVAL_MS = 15000; // the middle of the spec's 2s -> 15s -> 60s ladder; see Task 6 for the ladder itself

// `includePII` is an opt-in, not a grant: GET /messages/:id/recipients 403s a
// true from a caller whose token lacks the logs.pii scope, exactly as it does
// for motorical_get_message/getMessageEvents. It has to be threadable, though,
// because the default (masked) output renders alice@x.com and andrew@x.com as
// the SAME string a***@x.com -- so a two-recipient send where one bounced is
// reported as "something bounced," with no way to say which. Defaults to false
// so nothing gets unmasked by accident.
export async function resolveTask(taskId, client, taskStore, { includePII = false } = {}) {
  const task = await taskStore.getTask(taskId);
  if (!task) return { status: 'not_found' };

  const raw = await client.getMessageRecipients(task.emailLogId, {
    motorBlockId: task.motorBlockId,
    includePII,
  });
  // pii_masked/pii_unmask_path are forwarded verbatim from the backend's
  // response (Task 10), not recomputed from the `includePII` argument here.
  // The backend already resolved the authoritative value at the point where
  // it decided whether to mask -- after its own scope check (a 403 there
  // means this call never reaches this line at all). Recomputing `!includePII`
  // locally would duplicate that decision in a second place for no reason.
  const { recipients, expectedCount, allTerminal, pii_masked, pii_unmask_path } = raw.data;

  if (allTerminal) {
    return { status: 'completed', result: { recipients, expectedCount, allTerminal, pii_masked, pii_unmask_path } };
  }
  return { status: 'still_pending', retryAfterMs: POLL_INTERVAL_MS };
}
