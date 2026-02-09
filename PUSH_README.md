# Ready to Push to GitHub

## Pre-push checklist

- [ ] **Secrets**: `.dev.vars` is in `.gitignore` and will not be committed
- [ ] **Config**: No API tokens or account IDs in committed files
- [ ] **CORS**: Worker uses `Access-Control-Allow-Origin: *`, so any origin (Pages, localhost) can call the API

## GitHub repository setup

The Worker is connected directly to the GitHub repo. Cloudflare deploys on push—no GitHub Actions required.

### Worker runtime secrets (after first deploy)

The Worker needs these at runtime (different from GitHub Secrets):

```bash
# After first deploy, run:
./scripts/manage-secrets.sh put CLOUDFLARE_API_TOKEN production
./scripts/manage-secrets.sh put CLOUDFLARE_ACCOUNT_ID production
```

### Create Pages project (one-time, if needed)

If the Pages project doesn’t exist:

```bash
npx wrangler pages project create cf-analyst --production-branch main
```

## After first push

1. **Get your Worker URL**: Cloudflare Dashboard → Workers & Pages → cf-analyst → See URL  
   Format: `https://cf-analyst.rob-danz.workers.dev`

2. The frontend is already configured with the Worker URL via the meta tag in `index.html`. Redeploy Pages (or push) so the frontend uses it.

## URLs

| Service | Production |
|---------|------------|
| Frontend | https://cf-analyst.pages.dev |
| API (Worker) | https://cf-analyst.rob-danz.workers.dev |

CORS is configured to allow cross-origin requests; no extra CORS settings are required.
