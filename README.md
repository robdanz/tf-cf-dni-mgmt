# DNI List Manager

Manages Zero Trust Gateway Do-Not-Inspect (DNI) hostname lists. A single Cloudflare Worker serves both the REST API and the static frontend (via Workers Static Assets). Move, remove, and categorize hostnames across Gateway lists.

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars   # add your API token and account ID
npm run stamp                    # generate frontend/assets/js/build-info.js
npm run dev                      # Worker + frontend on :8787
```

Open http://localhost:8787 — the Worker serves the SPA and the API from the same origin.

## Deploy

There is no `npm run deploy` script. Deploy with wrangler directly, after stamping the
build info file (`frontend/assets/js/build-info.js` is gitignored and generated):

```bash
npm run stamp
npx wrangler deploy
```

This publishes the Worker (`src/index.js`) and uploads `frontend/` as static assets in a
single deployment. There is no separate Pages project.

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
