# DNI List Manager

Manages Zero Trust Gateway Do-Not-Inspect (DNI) hostname lists. A single Cloudflare Worker serves both the REST API and the static frontend (via Workers Static Assets). Move, remove, and categorize hostnames across Gateway lists.

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars   # add your API token and account ID
npm run dev                      # Worker + frontend on :8787
```

Open http://localhost:8787 — the Worker serves the SPA and the API from the same origin.

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
