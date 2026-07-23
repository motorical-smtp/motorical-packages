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
