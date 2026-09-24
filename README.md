# Motorical packages

Public source for Motorical’s agent/developer tooling published on npm.

**Agents: start here.** [docs.motorical.com/agents](https://docs.motorical.com/agents) has the route
chooser, rulebook, and journeys for every situation — machine twin at
[docs.motorical.com/agents.json](https://docs.motorical.com/agents.json).

**Most agents should not install anything.** If your client supports remote MCP servers with OAuth
(Claude Code, Cursor, Claude.ai connectors), connect the hosted server — no install, no keys held by the agent:
[docs.motorical.com/ai-mcp-hosted](https://docs.motorical.com/ai-mcp-hosted). Use the local package below only
when your client cannot do remote OAuth, when you need the dashboard-session-only tools, or for headless
automation with API keys. Writing code that sends mail needs no package: see
[docs.motorical.com/ai](https://docs.motorical.com/ai).


| Package | npm | Docs |
|---------|-----|------|
| `@motorical/mcp` | [npmjs.com/package/@motorical/mcp](https://www.npmjs.com/package/@motorical/mcp) | [docs.motorical.com/ai-mcp](https://docs.motorical.com/ai-mcp) |
| `@motorical/scope-catalog` | [npmjs.com/package/@motorical/scope-catalog](https://www.npmjs.com/package/@motorical/scope-catalog) | — |

`@motorical/cli` is **retired** for now and is no longer documented or supported; its source is kept, frozen, in `packages/motorical-cli/`. Use the hosted MCP server or the REST API instead.

## Install

```bash
npm install -g @motorical/mcp
npm install @motorical/scope-catalog
```

Or from this repo:

```bash
cd packages/motorical-mcp && npm install -g .
cd ../motorical-scope-catalog && npm install .
```

## Layout

```
packages/
  motorical-cli/            # retired, source frozen (not published, not supported)
  motorical-mcp/             # MCP server for Cursor / Claude Desktop
  motorical-scope-catalog/  # OAuth/MCP scope metadata library, no bin — a dependency, not a tool
```

## Docs for agents

- https://docs.motorical.com/llms.txt
- https://docs.motorical.com/onboarding-sandbox-journey.json
- https://docs.motorical.com/openapi.json

This repository is **not** the Motorical API backend. It only contains public packages meant to be installed or depended on outside Motorical's own infrastructure.

## Every package here is a release-time mirror, not the dev source

Each package directory here is synced from Motorical's internal development repository
at release time — this is **not** where day-to-day development happens for any of them.
If you're looking to contribute, please open an issue first rather than sending a PR
directly against the source here; fixes made directly in this repo can be overwritten by
the next sync. Each package has its own publish workflow
(`.github/workflows/publish-motorical-mcp.yml`, `publish-motorical-cli.yml` (disabled: package retired),
`publish-motorical-scope-catalog.yml`) and its own npmjs.com trusted-publisher
registration; they don't share either. Publishing uses npm's OIDC trusted-publisher flow
— no long-lived npm token is stored anywhere in this repo or its workflows — and produces
a signed [provenance attestation](https://docs.npmjs.com/generating-provenance-statements)
visible on each package's npm page.

One field is intentionally different between each package's two copies of
`package.json`: `repository.url` here points at this repo, reflecting where the package
was actually built and published from (`bugs.url` is left pointing at the internal dev
repo on every package here, including the two pre-existing ones — despite what an earlier
version of this README claimed, that field was never actually changed during a sync).

## Repository security settings

- **Branch protection on `main`:** force-pushes and branch deletion are blocked. Direct
  push to `main` is allowed for maintainers — releases are pushed directly rather than
  through a PR, so required-review is deliberately not enabled.
- **Secret scanning + push protection:** enabled.
- **Dependabot security updates:** enabled (vulnerability alerts also on).
- **`sha_pinning_required: true`** at the repo level (Settings → Actions → General) —
  every workflow here pins its actions to commit SHAs rather than mutable tags.
