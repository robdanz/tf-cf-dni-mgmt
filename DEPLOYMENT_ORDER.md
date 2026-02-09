# When Can I Set Secrets?

## Short Answer

No, you don't need to create the worker in Cloudflare before setting secrets. The worker is created automatically on first deployment.

## How It Works

### Option 1: Deploy First, Then Add Secrets (Recommended)

This is the typical workflow:

1. **Deploy your worker first** (creates the worker in Cloudflare):
   ```bash
   npm run deploy
   # or
   npx wrangler deploy
   ```

2. **Then add your secrets**:
   ```bash
   npx wrangler secret put YOUR_SECRET --env production
   ```

The worker is created with the first deployment, and then you can add secrets to it.

### Option 2: Add Secrets After Deployment Using GitHub Actions

When you push to GitHub and the CI/CD pipeline runs:

1. GitHub Actions deploys your worker (or updates it)
2. Worker is created/updated in Cloudflare
3. You can then manually add secrets using the wrangler CLI or Cloudflare dashboard

### Option 3: Secrets Before Deployment? (Not Recommended)

If you try to set secrets before the worker exists, you'll get an error. However, this rarely happens because:

- The worker name in `wrangler.toml` defines what will be created
- First `wrangler deploy` creates the worker
- Then you can add secrets

## Recommended Workflow

### Local Development Setup
```bash
# 1. Install dependencies
npm install

# 2. Set up local development environment
# (add your secrets to .dev.vars)
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your local secrets

# 3. Test locally
npm run dev

# 4. Deploy to Cloudflare (creates worker if it doesn't exist)
npm run deploy
# or for staging:
npx wrangler deploy --env staging
```

### After First Deployment
```bash
# 5. Add production secrets
./scripts/manage-secrets.sh put SECRET_NAME production

# 6. Add staging secrets (optional)
./scripts/manage-secrets.sh put SECRET_NAME staging
```

## API Token Permissions (TLS Auto Pilot + Domain Categorization)

The `CLOUDFLARE_API_TOKEN` must include:
- **Account > Zero Trust** (or Gateway Edit) – for Gateway lists
- **Account > Intel > Read** – for domain categorization (Radar/Intel API)

Without Intel Read, domain categorization shows "No categorization". To verify:
```bash
./scripts/test-intel-domain.sh
```
If you see "Authentication error", add Intel Read in Dashboard → My Profile → API Tokens → Edit token → Permissions.

## Understanding Worker Creation

The worker in Cloudflare is created based on the `name` field in your `wrangler.toml`:

```toml
name = "cf-analyst"  # This is the worker name that will be created
main = "src/index.js"
```

When you run `wrangler deploy`, it:
1. Packages your code
2. Creates a new worker in Cloudflare if it doesn't exist
3. Or updates the existing worker if it does exist

## Current Configuration

Based on your `wrangler.toml`:

- **Production worker**: `cf-analyst`
  - Will be created at: `https://cf-analyst.rob-danz.workers.dev`
  
- **Staging worker**: `cf-analyst-staging`
  - Will be created at: `https://cf-analyst-staging.rob-danz.workers.dev`

## Checking if Worker Exists

To check if your worker exists in Cloudflare:

```bash
# List all workers
npx wrangler whoami

# Try to get worker details
npx wrangler deployments list --name cf-analyst
```

## Common Scenarios

### Scenario 1: First Time Setup
```bash
# This is fine - deploy creates the worker
npm run deploy

# Then add secrets
./scripts/manage-secrets.sh put API_KEY production
```

### Scenario 2: Adding Secrets to Existing Worker
```bash
# Worker already exists from previous deployment
./scripts/manage-secrets.sh put API_KEY production
# Works perfectly!
```

### Scenario 3: Updating Secrets
```bash
# Worker exists, you're just updating the secret value
./scripts/manage-secrets.sh put API_KEY production
# Enter new value when prompted
```

### Scenario 4: Secrets Before Worker Exists (Error)
```bash
# This will fail if worker doesn't exist yet
npx wrangler secret put API_KEY --env production
# Error: Worker not found

# Solution: Deploy first
npm run deploy
# Then add secrets
```

## Best Practice Workflow

1. **Develop locally** with `.dev.vars`
2. **Test locally** with `npm run dev`
3. **Deploy to staging** first:
   ```bash
   npx wrangler deploy --env staging
   ```
4. **Add staging secrets**:
   ```bash
   ./scripts/manage-secrets.sh put SECRET_NAME staging
   ```
5. **Test staging deployment**
6. **Deploy to production**:
   ```bash
   npx wrangler deploy --env production
   ```
7. **Add production secrets**:
   ```bash
   ./scripts/manage-secrets.sh put SECRET_NAME production
   ```

## Summary

- ✅ **Deploy first**: Creates the worker in Cloudflare
- ✅ **Then add secrets**: Worker exists, secrets attach to it
- ❌ **Don't add secrets before deploying**: Worker doesn't exist yet
- 🎯 **Best practice**: Deploy → Test → Add secrets → Verify

The worker is defined in `wrangler.toml` and gets created automatically on first deployment!
