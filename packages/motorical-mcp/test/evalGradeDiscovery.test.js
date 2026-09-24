import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gradeDiscovery } from '../eval/gradeDiscovery.js';
import { DISCOVERY_SCENARIOS } from '../eval/discoveryScenarios.js';

// Same shape as evalGrade.test.js's transcript() helper, plus a WebFetch
// tool_use variant since gradeDiscovery reads fetched URLs, not just prose.
function transcript({ finalText = '', fetchedUrls = [] } = {}) {
  return [
    ...fetchedUrls.map((url) => ({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'WebFetch', input: { url } }] },
    })),
    { type: 'result', result: finalText },
  ];
}

const scenario = (id) => DISCOVERY_SCENARIOS.find((s) => s.id === id);

describe('gradeDiscovery', () => {
  test('every discovery scenario has a unique id, a front door, and a persona', () => {
    const ids = DISCOVERY_SCENARIOS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate scenario id');
    for (const s of DISCOVERY_SCENARIOS) {
      assert.ok(s.frontDoor, `${s.id}: missing frontDoor`);
      assert.ok(s.persona, `${s.id}: missing persona`);
      assert.ok(s.prompt && s.prompt.length > 20, `${s.id}: prompt too thin`);
    }
  });

  test('reachedHub is true when the agent fetches the hub URL', () => {
    const r = gradeDiscovery({
      transcript: transcript({ fetchedUrls: ['https://docs.motorical.com/agents'] }),
      scenario: scenario('motorical_com_only'),
    });
    assert.equal(r.reachedHub, true);
  });

  test('reachedHub is true when the agent only NAMES the hub URL in its final answer', () => {
    const r = gradeDiscovery({
      transcript: transcript({ finalText: 'Start at https://docs.motorical.com/agents for the route chooser.' }),
      scenario: scenario('github_repo_only'),
    });
    assert.equal(r.reachedHub, true);
  });

  test('reachedHub is false when neither a fetch nor the final answer names it', () => {
    const r = gradeDiscovery({
      transcript: transcript({ finalText: 'Install the npm package and read its README.' }),
      scenario: scenario('npm_package_only'),
    });
    assert.equal(r.reachedHub, false);
  });

  test('namedHostedMcp is true when mcp.motorical.com is fetched or mentioned', () => {
    const r = gradeDiscovery({
      transcript: transcript({ fetchedUrls: ['https://mcp.motorical.com/'] }),
      scenario: scenario('bare_mcp_url'),
    });
    assert.equal(r.namedHostedMcp, true);
  });

  test('suggestedRetiredCli flags a shell-only answer that reaches for the retired CLI', () => {
    const r = gradeDiscovery({
      transcript: transcript({ finalText: 'Run `npm install -g @motorical/cli` then `motorical signup you@example.com`.' }),
      scenario: scenario('shell_only_no_mcp_client'),
    });
    assert.equal(r.suggestedRetiredCli, true);
  });

  test('a clean shell-only answer using REST onboarding does not false-flag the CLI check', () => {
    const r = gradeDiscovery({
      transcript: transcript({ finalText: 'Run curl against POST /api/auth/register, then verify-code, then set-password.' }),
      scenario: scenario('shell_only_no_mcp_client'),
    });
    assert.equal(r.suggestedRetiredCli, false);
  });

  test('returns the scenario id and raw signal, not a single verdict', () => {
    const r = gradeDiscovery({
      transcript: transcript({ finalText: 'See https://docs.motorical.com/agents.' }),
      scenario: scenario('docs_home_only'),
    });
    assert.equal(r.scenarioId, 'docs_home_only');
    assert.ok(Array.isArray(r.urlsTouched));
    assert.equal(typeof r.finalText, 'string');
  });
});
