# DNI List Manager

Manages Zero Trust Gateway Do-Not-Inspect (DNI) hostname lists. A single Cloudflare Worker serves both the REST API and the static frontend (via Workers Static Assets). Move, remove, and categorize hostnames across Gateway lists.

## Deploying to an account (Terraform)

**Terraform is the install path.** `terraform/` provisions everything an account needs, in
order: the Access application, the Worker deploy, and all four Worker secrets. Running
`npm run deploy` on its own is *not* a complete install — it publishes code and nothing
else, leaving the app unauthenticated and every `/api/*` call returning `401`.

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # fill in — gitignored, never commit
terraform init
terraform apply
```

That single apply:

| Resource | What it does |
|---|---|
| `cloudflare_zero_trust_access_application.dni_mgmt` | Creates the self-hosted Access app on `<worker_name>.<subdomain>.workers.dev` |
| `null_resource.worker_deploy` | `npm ci && npm run stamp && wrangler deploy` |
| `null_resource.worker_secrets` | Sets `ACCESS_TEAM`, `ACCESS_AUD`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |

`ACCESS_AUD` is wired straight from the Access app's `.aud` attribute, so the app and the
secret can't drift. The two `null_resource`s depend on the Access app, so **if the app
fails to create, neither the deploy nor the secrets run** — a partial apply leaves the
Worker unauthenticated. Re-run `terraform apply` until it completes cleanly rather than
finishing the steps by hand.

### Attach a policy

`access.tf` deliberately creates the app **with no policy**, so nobody can log in until you
attach one. Attach a reusable policy in Zero Trust → Access → Applications → *DNI List
Manager* → Policies.

This is safe to do by hand: `policies` is left out of the Terraform config, and the v4
provider only sends that field on `HasChange`. Since it never enters config or state, a
later `terraform apply` will not detach the policy you attached.

### Verify

```bash
curl -sI https://<worker_name>.<subdomain>.workers.dev/
```

`302` redirecting to `<team>.cloudflareaccess.com/cdn-cgi/access/login/...` means Access is
correctly in front. A `200` with no redirect means there is no Access app on that hostname,
and the API will 401.

## Why auth fails closed

`src/auth.js` reads the caller's identity from the `Cf-Access-Jwt-Assertion` header, which
**only Cloudflare Access injects**. There is no cookie or bearer fallback and the frontend
sends no token of its own. It verifies the signature against `<team>.cloudflareaccess.com`
JWKS, then checks `aud` / `iss` / `exp`.

A 401 therefore says nothing about the *user* — it almost always means the deployment is
incomplete. The response carries a machine-readable `reason` and an operator-facing `hint`
so you don't have to guess which:

```json
{
  "error": "Unauthorized",
  "reason": "aud_mismatch",
  "hint": "Token audience does not match ACCESS_AUD. The secret must hold the AUD tag of the Access application actually serving this hostname — a stale value from a different or recreated app is the usual cause."
}
```

| `reason` | Meaning |
|---|---|
| `not_configured` | `ACCESS_TEAM` / `ACCESS_AUD` unset — the account was never fully provisioned |
| `no_token` | No Access app in front of the hostname, so no header is injected |
| `jwks_unavailable` | `ACCESS_TEAM` wrong — often the full domain instead of the bare team name |
| `aud_mismatch` | `ACCESS_AUD` doesn't match the app serving this hostname (stale or recreated app) |
| `iss_mismatch` | The app protecting this hostname belongs to a different team |
| `token_expired` | Genuine — re-authenticate |
| `malformed_token`, `unknown_key`, `bad_signature`, `no_identity` | Token-level faults |

The same reason is logged, so `npx wrangler tail` shows it for requests you can't inspect
directly. Hints describe the deployment fault only — never token contents or secret values.

A complete `terraform apply` rules out the whole top half of that table. `localhost` /
`127.0.0.1` bypass auth entirely, so local dev needs none of it.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # API token + account ID; local dev only, never uploaded
npm run dev                      # Worker + frontend on :8787
```

Open http://localhost:8787 — the Worker serves the SPA and the API from the same origin,
with auth bypassed.

## Code-only redeploy

Once an account is fully provisioned, a code change can ship without Terraform:

```bash
npm run deploy       # stamp build info, then publish Worker + frontend
npm run deploy:dry   # same, but --dry-run (validate without publishing)
```

This publishes `src/` and uploads `frontend/` as static assets in one step — there is no
separate Pages project. It does **not** touch secrets or the Access app; `.dev.vars` is
read only by `wrangler dev` and is never uploaded. Use it only for redeploys, never as a
first-time install.

`npm run dev` and `npm run deploy` both run `npm run stamp` first, which regenerates
`frontend/assets/js/build-info.js` (gitignored) with the current timestamp. Read it back as
`window.__BUILD_TIME__` in the browser console to confirm which build is live.

## Project Structure

```
tf-cf-dni-mgmt/
├── src/
│   ├── index.js                           # Worker: routing, API handlers, ASSETS fallback
│   ├── auth.js                            # Cloudflare Access JWT verification
│   └── domain.js                          # eTLD+1 handling via tldts
├── frontend/
│   ├── index.html                         # App shell
│   ├── assets/js/config.js                # API base config
│   ├── assets/js/app.js                   # Router + bootstrap
│   └── views/reports-tls-autopilot.js     # DNI list manager view
├── terraform/                             # The install path — provisions an account
│   ├── access.tf                          # Access app (intentionally policy-less)
│   ├── worker.tf                          # Worker deploy + the four Worker secrets
│   └── terraform.tfvars.example           # Copy to terraform.tfvars (gitignored)
├── wrangler.toml                          # Worker config (name, main, [assets])
└── package.json
```

## License

MIT
