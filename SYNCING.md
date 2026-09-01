# Syncing a package into this mirror

Package sources live in their product repo (e.g. `motorical-backend`
`packages/motorical-mcp`). This repo is the **publish** origin: npm provenance
binds the published tarball to the repository the workflow ran in, and it is
public, which provenance requires.

**Do not copy `package.json` wholesale from the source repo.** Its
`repository.url` points at the source, and npm rejects the publish:

```
422 Unprocessable Entity - Error verifying sigstore provenance bundle:
package.json: "repository.url" is "…/motorical-backend.git",
expected to match "…/motorical-packages" from provenance
```

The failure only appears at publish time — the tarball builds and is signed
first — so it is invisible to every local check. After syncing, confirm:

```bash
python3 -c "import json;print(json.load(open('packages/motorical-mcp/package.json'))['repository']['url'])"
# must be git+https://github.com/motorical-smtp/motorical-packages.git
```
