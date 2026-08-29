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

As of 2026-08-29 (`motorical-mcp`) and the same day (`motorical-cli`, synced to `1.0.6`),
`packages/motorical-mcp/` and `packages/motorical-cli/` here are synced from the private
`motorical-smtp/motorical-backend` repo at release time — this is **not** where
day-to-day development happens for either package. Do not fix bugs directly here; fix
them in `motorical-backend` and re-sync, or the fix will be silently overwritten at the
next release. Each package has its own publish workflow
(`.github/workflows/publish-motorical-mcp.yml`, `publish-motorical-cli.yml`) living here
specifically because `npm publish --provenance` requires a public source repo, which
`motorical-backend` correctly is not — and its own npmjs.com trusted-publisher
registration (`motorical-smtp/motorical-packages` + that exact workflow filename); they
don't share either the workflow or the registration.

One field is intentionally different between each package's two copies of
`package.json`: `repository.url` and `bugs.url` here point at
`motorical-smtp/motorical-packages` (this repo), reflecting where the package was
actually built and published from — do not "fix" this to match `motorical-backend`. Full
release process (written for `motorical-mcp`, applies identically to `motorical-cli` —
swap the package/workflow name):
[motorical-docs/services/motorical-mcp.md](https://github.com/motorical-smtp/motorical-docs/blob/main/services/motorical-mcp.md).

## Repository security settings (as of 2026-08-29)

Hardened as a follow-on to an account-wide GitHub Actions worm incident found and
cleaned up the same day (unrelated repo, `ai-support-chat` — full writeup in the
maintainer's private notes, not in this repo). This repo is the account's only public
release surface with a live publish pipeline, so it got the closest look:

- **Branch protection on `main`:** force-pushes and branch deletion are blocked.
  Direct push to `main` is still allowed and required-review is deliberately **not**
  enabled — the documented release process above (step 2: "commit and push to
  `motorical-packages`'s `main`") is a solo-maintainer, direct-push flow and this
  setting was chosen specifically not to break it. The protection exists to stop the
  *ai-support-chat* failure mode (a compromised credential deleting `main` and
  repointing the repo's default branch to an attacker-created branch), not to add
  process overhead here.
- **Secret scanning + push protection: enabled.** Free for public repos. Push
  protection blocks a commit containing a recognized secret pattern before it lands in
  public history.
- **Dependabot security updates: enabled** (vulnerability alerts were already on).
- **`sha_pinning_required: true`** at the repo level (Settings → Actions → General).
  `publish-motorical-mcp.yml` already pinned both actions to commit SHAs by hand
  (see the workflow file) — this setting makes that mandatory for any future workflow
  added here, rather than relying on remembering to do it again. `publish-motorical-cli.yml`,
  added after this setting was turned on, was SHA-pinned from the start.

None of this changes the publish workflow or the release steps above — it only
constrains what a compromised credential or a careless future change could do to this
repo.
