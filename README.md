# DNI List Manager

Manages Zero Trust Gateway Do-Not-Inspect (DNI) hostname lists. A single Cloudflare Worker serves both the REST API and the static frontend (via Workers Static Assets). Move, remove, and categorize hostnames across Gateway lists.

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars   # add your API token and account ID
npm run dev                      # Worker + frontend on :8787
```

Open http://localhost:8787 — the Worker serves the SPA and the API from the same origin.

## Access setup (required — do this per account)

The Worker reads the caller's identity from the `Cf-Access-Jwt-Assertion` header, which
**only Cloudflare Access injects**. The frontend sends no token of its own and there is no
cookie or bearer fallback. If the deployed hostname is not behind an Access application,
the SPA loads but every `/api/*` call returns `401 Unauthorized`.

Each account that hosts this app needs its own Access app and its own secrets:

1. Zero Trust dashboard → **Access → Applications → Add an application → Self-hosted**.
   Set the domain to the exact deployed hostname, e.g.
   `tf-cf-dni-mgmt.<subdomain>.workers.dev`. Add a policy allowing the intended users.
   (Access works on `*.workers.dev`; a custom domain is not required.)
2. Copy the app's **Application Audience (AUD) Tag** from its Overview tab.
3. Set the secrets on the Worker:

```bash
npx wrangler secret put ACCESS_TEAM   # the <team> in <team>.cloudflareaccess.com
npx wrangler secret put ACCESS_AUD    # the AUD tag from step 2
npx wrangler secret put CLOUDFLARE_API_TOKEN
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
```

`ACCESS_TEAM` and `ACCESS_AUD` must match the app created in step 1. A missing or
mismatched value fails closed with the same `401` as having no Access app at all.

**Verify:** `curl -sI https://<hostname>/` should return `302` redirecting to
`<team>.cloudflareaccess.com/cdn-cgi/access/login/...`. A `200` with no redirect means
Access is not in front of the hostname and the API will 401.

`localhost` / `127.0.0.1` bypass auth entirely, so local dev needs none of this.

## Deploy

```bash
npm run deploy       # stamp build info, then publish Worker + frontend
npm run deploy:dry   # same, but --dry-run (validate without publishing)
```

One deploy publishes the Worker (`src/index.js`) and uploads `frontend/` as static
assets. There is no separate Pages project and no second command for the frontend.

`npm run dev` and `npm run deploy` both run `npm run stamp` first, which regenerates
`frontend/assets/js/build-info.js` (gitignored) with the current timestamp. Read it back
as `window.__BUILD_TIME__` in the browser console to confirm which build is live.

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
├── wrangler.toml                          # Worker config (name, main, [assets])
└── package.json
```

## License

MIT
