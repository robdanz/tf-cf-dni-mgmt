# CF-Analyst Architecture: Workers + Pages

## Overview

- **Cloudflare Pages** – Hosts the frontend (HTML, CSS, JS). Serves the shell and lazy-loads view modules on navigation.
- **Cloudflare Worker** – API-only. Handles auth, Cloudflare Gateway/GraphQL, and other backend logic.

## Project Structure

```
cf-analyst/
├── frontend/                 # Pages (static frontend)
│   ├── index.html           # Shell + router
│   ├── assets/
│   │   ├── css/
│   │   └── js/
│   │       ├── app.js       # Router, menu, API client
│   │       └── config.js    # API base URL
│   └── views/               # Lazy-loaded view modules
│       ├── home.js
│       ├── analytics-traffic.js
│       ├── analytics-performance.js
│       └── reports-tls-autopilot.js
├── src/                     # Worker (API only)
│   ├── index.js
│   └── __tests__/
├── wrangler.toml            # Worker config
└── package.json
```

## URLs (after setup)

| Environment | Frontend (Pages)              | API (Worker)                         |
|-------------|-------------------------------|--------------------------------------|
| Local dev   | http://localhost:8788         | http://localhost:8787                |
| Production  | https://cf-analyst.pages.dev  | https://cf-analyst.&lt;subdomain&gt;.workers.dev |

## Custom Domain (optional)

- **Pages**: `analyst.yourdomain.com` → add in Pages project settings
- **Worker**: `api.analyst.yourdomain.com` or `analyst.yourdomain.com/api` → add Worker custom domain + routes
- Or use a single domain with Workers Routes: `analyst.yourdomain.com/` → Pages, `analyst.yourdomain.com/api/*` → Worker

## Terraform (optional)

Terraform can manage:
- `cloudflare_workers_script` – Worker deployment
- `cloudflare_pages_project` – Pages project
- `cloudflare_worker_route` – Custom domain routing
- `cloudflare_record` – DNS

See `terraform/` when added.
