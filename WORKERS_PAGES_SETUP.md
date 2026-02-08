# Workers + Pages Setup Guide

This project uses **Cloudflare Workers** (API) + **Cloudflare Pages** (frontend).

## Prerequisites

- Node.js 18+
- Wrangler CLI (`npm install -g wrangler` or use `npx wrangler`)
- Cloudflare account
- Authenticated: `npx wrangler login` (OAuth, recommended) or `CLOUDFLARE_API_TOKEN` with:
  - **Workers Scripts** Read & Write
  - **Account Settings** Read
  - **Cloudflare Pages** Read & Write (for `pages project create` and `pages deploy`)

## Quick Start

### 1. Create the Pages project (one-time)

```bash
npx wrangler pages project create cf-analyst --production-branch main
```

If you get an authentication error, run `npx wrangler login` for OAuth (full permissions), or ensure your `CLOUDFLARE_API_TOKEN` has **Cloudflare Pages** Read & Write.

### 2. Local development

**Terminal 1 – API Worker**
```bash
npm run dev
```
Runs the Worker on http://localhost:8787

**Terminal 2 – Frontend**
```bash
npm run dev:pages
```
Runs Pages on http://localhost:8788

Open http://localhost:8788 – the frontend will call the Worker API at localhost:8787.

### 3. Deploy

**Deploy Worker (API)**
```bash
npm run deploy
```

**Deploy Pages (frontend)**
```bash
npm run deploy:pages
```

## URLs after deployment

| Service | Local | Production |
|---------|-------|------------|
| Frontend (Pages) | http://localhost:8788 | https://cf-analyst.pages.dev |
| API (Worker) | http://localhost:8787 | https://cf-analyst.&lt;subdomain&gt;.workers.dev |

## Configure frontend for production API

After deploying both, the frontend must know the Worker URL. In production it defaults to `https://cf-analyst.workers.dev`. If your Worker URL is different (e.g. `https://cf-analyst.your-subdomain.workers.dev`):

1. Set `window.__CF_ANALYST_API__ = 'https://your-worker-url.workers.dev'` before loading the app, or
2. Edit `frontend/assets/js/config.js` and set the production `apiBase`.

## Custom domain (optional)

- **Pages**: In Workers & Pages → cf-analyst → Custom domains → add your domain
- **Worker**: Add a custom domain for the Worker in its settings

For a single domain (e.g. `analyst.example.com`), use Cloudflare routing:
- `/` → Pages
- `/api/*` → Worker (via Worker Route)

## Terraform (optional)

To manage resources with Terraform, add a `terraform/` directory with:

- `cloudflare_workers_script` – Worker deployment
- `cloudflare_pages_project` – Pages project
- `cloudflare_worker_route` – Custom domain routing

## Structure

```
cf-analyst/
├── frontend/           # Pages (static)
│   ├── index.html
│   ├── _redirects      # SPA routing
│   ├── assets/
│   └── views/          # Lazy-loaded view modules
├── src/
│   └── index.js        # Worker (API only)
├── wrangler.toml       # Worker config
└── package.json
```
