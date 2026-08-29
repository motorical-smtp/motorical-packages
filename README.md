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

## Both packages here are release-time mirrors, not the dev source

`packages/motorical-mcp/` and `packages/motorical-cli/` here are synced from Motorical's
internal development repository at release time — this is **not** where day-to-day
development happens for either package. If you're looking to contribute, please open an
issue first rather than sending a PR directly against the source here; fixes made
directly in this repo can be overwritten by the next sync. Each package has its own
publish workflow (`.github/workflows/publish-motorical-mcp.yml`,
`publish-motorical-cli.yml`) and its own npmjs.com trusted-publisher registration; they
don't share either. Publishing uses npm's OIDC trusted-publisher flow — no long-lived
npm token is stored anywhere in this repo or its workflows — and produces a signed
[provenance attestation](https://docs.npmjs.com/generating-provenance-statements) visible
on each package's npm page.

One field is intentionally different between each package's two copies of
`package.json`: `repository.url` and `bugs.url` here point at this repo, reflecting
where the package was actually built and published from.

## Repository security settings

- **Branch protection on `main`:** force-pushes and branch deletion are blocked. Direct
  push to `main` is allowed for maintainers — releases are pushed directly rather than
  through a PR, so required-review is deliberately not enabled.
- **Secret scanning + push protection:** enabled.
- **Dependabot security updates:** enabled (vulnerability alerts also on).
- **`sha_pinning_required: true`** at the repo level (Settings → Actions → General) —
  every workflow here pins its actions to commit SHAs rather than mutable tags.
