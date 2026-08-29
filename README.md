# Motorical packages

Public source for Motorical’s agent/developer tooling published on npm:

| Package | npm | Docs |
|---------|-----|------|
| `@motorical/cli` | [npmjs.com/package/@motorical/cli](https://www.npmjs.com/package/@motorical/cli) | [docs.motorical.com/ai](https://docs.motorical.com/ai) |
| `@motorical/mcp` | [npmjs.com/package/@motorical/mcp](https://www.npmjs.com/package/@motorical/mcp) | [docs.motorical.com/ai-mcp](https://docs.motorical.com/ai-mcp) |

## Install

```bash
npm install -g @motorical/cli
npm install -g @motorical/mcp
```

Or from this repo:

```bash
cd packages/motorical-cli && npm install -g .
cd ../motorical-mcp && npm install -g .
```

## Layout

```
packages/
  motorical-cli/   # `motorical` bin — sandbox onboarding + send helpers
  motorical-mcp/   # MCP server for Cursor / Claude Desktop
```

## Docs for agents

- https://docs.motorical.com/llms.txt
- https://docs.motorical.com/onboarding-sandbox-journey.json
- https://docs.motorical.com/openapi.json

This repository is **not** the Motorical API backend. It only contains the public CLI and MCP packages.

## `motorical-mcp` is a release-time mirror, not the dev source

As of 2026-08-29, `packages/motorical-mcp/` here is synced from the private
`motorical-smtp/motorical-backend` repo at release time — it is **not** where day-to-day
development happens. Do not fix bugs directly here; fix them in `motorical-backend` and
re-sync, or the fix will be silently overwritten at the next release. The publish
workflow (`.github/workflows/publish-motorical-mcp.yml`) lives here specifically because
`npm publish --provenance` requires a public source repo, which `motorical-backend`
correctly is not.

One field is intentionally different between the two repos' copies of `package.json`:
`repository.url` and `bugs.url` here point at `motorical-smtp/motorical-packages` (this
repo), reflecting where the package was actually built and published from — do not
"fix" this to match `motorical-backend`. Full release process:
[motorical-docs/services/motorical-mcp.md](https://github.com/motorical-smtp/motorical-docs/blob/main/services/motorical-mcp.md).
