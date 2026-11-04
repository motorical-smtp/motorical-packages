// Builds canned transcripts in the shape `claude -p --output-format stream-json --verbose` produces, plus the person's turns (which the
// multi-turn runner injects, because the CLI does not echo the prompt). Used by the scenes' good/bad transcripts and by the grader tests,
// so a grader is proven on known inputs before any live run spends money.
export const PREFIX = 'mcp__motorical__';

export class Script {
  constructor() { this.events = []; this.n = 0; }

  /** A turn from the person (the opening prompt or a scripted reply). */
  person(text) { this.events.push({ type: 'user', person: true, message: { role: 'user', content: [{ type: 'text', text }] } }); return this; }

  /** Assistant prose in the middle of a turn. */
  say(text) { this.events.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } }); return this; }

  /** A Motorical tool call and the platform's answer. `result` may be an object (serialised) or a string; `error: true` marks a refusal. */
  call(name, input = {}, result = { success: true }, { error = false } = {}) {
    const id = `toolu_${(this.n += 1)}`;
    this.events.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name: `${PREFIX}${name}`, input }] } });
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    this.events.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: error, content: [{ type: 'text', text }] }] } });
    return this;
  }

  /** The end of a turn: the agent's closing words (also recorded as the `result` event, like the CLI does). */
  end(text) {
    this.say(text);
    this.events.push({ type: 'result', result: text, is_error: false, session_id: 'canned' });
    return this;
  }

  build() { return this.events; }
}

export const script = () => new Script();
