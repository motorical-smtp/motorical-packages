# @motorical/cli

Developer onboarding for **Motorical Sending SMTP**: email/code signup → unpaid sandbox (`*.sandbox.motorical.com`) → dry-run / allowlisted sends → convert after Motorical Plan.

```bash
npm install -g https://registry.npmjs.org/@motorical/cli/-/cli-1.0.4.tgz
# when named install works: npm install -g @motorical/cli

motorical signup you@example.com
motorical verify <code>
motorical sandbox provision
motorical send --to you@example.com --from-name "Acme Billing"   # dry-run by default
motorical open                        # browser handoff / set password
motorical domain add example.com
motorical domain check-dns <domainId>
motorical convert --checkout
motorical convert --domain-id <uuid>
```

`motorical send` accepts `--from-name` for the inbox display name (maps to HTTP `fromName`). Do not put a display name in `--from` or try to set a `From` header — use `--from-name`.

Config: `~/.config/motorical/config.json`  
API override: `MOTORICAL_API_BASE_URL`

Docs: https://docs.motorical.com/ai · Journey: https://docs.motorical.com/onboarding-sandbox-journey.json
