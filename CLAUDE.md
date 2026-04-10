# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CF1 Cockpit is a Cloudflare One analytics dashboard split into two independently deployed pieces:
- **Worker** (`src/index.js`) — REST API, runs on Cloudflare Workers
- **Frontend** (`frontend/`) — Static SPA, deployed to Cloudflare Pages

The app has no database. All data is fetched live from Cloudflare REST APIs and GraphQL.

## Commands

```bash
npm run dev           # Worker dev server on :8787
npm run dev:pages     # Pages dev server on :8788 (proxies API to :8787)
npm run deploy        # Deploy Worker to Cloudflare
npm run deploy:pages  # Deploy frontend to Cloudflare Pages

npm test              # Run Jest tests
npm run test:watch    # Jest in watch mode
npm run lint          # ESLint on src/
npm run lint:fix      # ESLint with auto-fix
npm run format        # Prettier on src/
```

Local secrets go in `.dev.vars` (gitignored):
```
CLOUDFLARE_API_TOKEN=<token>
CLOUDFLARE_ACCOUNT_ID=<account-id>
```

## Architecture

### Worker (`src/index.js`)

Single-file Worker. Routing is a `switch` on `url.pathname`. Each route dispatches to a named handler function in the same file.

**API endpoints:**
- `/api/auth/validate` — JWT validation
- `/api/menu` — sidebar nav data
- `/api/gateway/lists` — GET/PATCH Gateway lists (TLS Auto Pilot)
- `/api/gateway/lists/move` — move a hostname between lists
- `/api/gateway/lists/remove` — remove a hostname from a list
- `/api/gateway/rules` — Gateway policy rules
- `/api/intel/domain` — domain categorization via Intel API
- `/api/http-insights` — L7 HTTP traffic (GraphQL `gatewayL7RequestsAdaptiveGroups`)
- `/api/dns-insights` — DNS queries (GraphQL `gatewayResolverQueriesAdaptiveGroups`)
- `/api/user-insights` — per-user traffic (same L7 dataset, grouped by email)
- `/api/network-insights` — L4 sessions (GraphQL `gatewayL4DownstreamSessionsAdaptiveGroups`)
- `/health` — liveness check

**Auth:** JWT is read from (in order) `CF-Authorization` header → `CF_Authorization` cookie → `Authorization: Bearer` header. Local dev (`localhost`) skips validation and injects a test user.

**CORS:** Whitelisted origins (`cf-analyst.tancow.net`, `cf-analyst.pages.dev`, localhost) get `credentials: true`. All others get `*`.

**Custom domain proxy:** Requests to `cf-analyst.tancow.net` that aren't `/api/*` are proxied to the Pages deployment, so the Worker acts as a reverse proxy for the custom domain.

**Domain handling (`psl` library):** `getRegistrableDomain()` extracts eTLD+1; `stripFirstLabel()` removes the leftmost label while respecting PSL floors. Both are used in the TLS Auto Pilot list move logic.

### Frontend (`frontend/`)

Vanilla JS, no build step, no bundler.

- `frontend/index.html` — app shell (sidebar + content area)
- `frontend/assets/js/config.js` — sets `window.CF_ANALYST_CONFIG.apiBase` based on hostname
- `frontend/assets/js/app.js` — router, `api()` helper, menu loader
- `frontend/views/*.js` — lazy-loaded view modules

**Routing:** `app.js` maintains a `routes` map of path → view file. Navigation calls `import()` dynamically to load the view module, then calls its default export `render({ api, config })` which returns an HTML string injected into `#contentBody`.

**API calls:** All frontend calls go through the `api(path)` helper in `app.js`, which appends `apiBase`, includes credentials, and forwards the JWT via `CF-Authorization` header if `window.__authToken` is set.

**View module contract:** Every view in `frontend/views/` exports a default async function:
```js
export default async function render({ api, config }) {
  const apiGet = api();
  const data = await apiGet('/api/some-endpoint?...');
  return `<div>...html...</div>`;
}
```

### API responses

Errors use `{ error: "...", hint: "..." }` shape. `hint` is surfaced to the user in the frontend and should guide them toward fixing the issue (e.g., missing API token permissions).

### Environment / deployment targets

| Environment | Worker name | Pages project |
|---|---|---|
| Production | `cf-analyst` | `cf-analyst` |
| Staging | `cf-analyst-staging` | — |

Custom domain `cf-analyst.tancow.net` routes through the Worker (same-origin setup), so the Worker proxies non-API requests to Pages.
