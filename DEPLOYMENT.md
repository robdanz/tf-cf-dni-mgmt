# Deployment Guide

This guide explains how to securely deploy secrets to your Cloudflare Worker in production.

## Overview

There are **two types of secrets** used in this project:

1. **GitHub Secrets** - Used by GitHub Actions to deploy your worker
2. **Cloudflare Secrets** - Used by your worker at runtime in production

## Setting Up GitHub Secrets (for CI/CD)

These are needed for GitHub Actions to deploy to Cloudflare:

1. Go to your GitHub repository: `https://github.com/robdanz/cf-analyst`
2. Navigate to: **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these secrets:
   - `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token
   - `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

These secrets are only used during the deployment process and are never exposed to the worker runtime.

## Setting Up Cloudflare Worker Secrets (for Production)

These are the secrets your worker will use when running in production on Cloudflare's edge.

### Option 1: Using Wrangler CLI (Recommended for Sensitive Data)

For sensitive data like API keys, tokens, etc., use the `wrangler secret put` command:

```bash
# Set a secret for production
npx wrangler secret put SECRET_NAME --env production

# Set a secret for staging
npx wrangler secret put SECRET_NAME --env staging
```

This will:
- Prompt you to enter the secret value securely
- Encrypt and store it in Cloudflare
- Make it available to your worker at runtime

Example:
```bash
npx wrangler secret put DATABASE_URL --env production
# Enter your database URL when prompted
```

### Option 2: Using wrangler.toml (for Non-Sensitive Variables)

For non-sensitive environment variables, you can add them to `wrangler.toml`:

```toml
[env.production.vars]
ENVIRONMENT = "production"
DEBUG = "false"

[env.staging.vars]
ENVIRONMENT = "staging"
DEBUG = "true"
```

⚠️ **Warning**: Never put sensitive data in `wrangler.toml` as it's committed to your repository.

## How Secrets Work

### Development (Local)
- Uses `.dev.vars` file (not committed to git)
- Secrets are available via the `env` parameter in your worker

### Production (Cloudflare)
- Uses secrets set via `wrangler secret put`
- Secrets are encrypted and stored securely
- Available to your worker at runtime

## Example: Accessing Secrets in Your Worker

```javascript
export default {
  async fetch(request, env, ctx) {
    // Secrets set via "wrangler secret put" are available in env
    const apiKey = env.SECRET_NAME;
    
    // Your code here
    return new Response('Hello World');
  },
};
```

## Current Setup

Based on your `.dev.vars` file, you already have:
- `CLOUDFLARE_API_TOKEN` - Used for deployment (GitHub Actions)
- `CLOUDFLARE_ACCOUNT_ID` - Used for deployment (GitHub Actions)

These are already set up in GitHub Actions secrets. For any additional secrets your worker needs (like API keys for external services), you'll need to add them to Cloudflare using `wrangler secret put`.

## Best Practices

1. **Never commit secrets** to your repository
2. **Use `.dev.vars`** for local development (already in `.gitignore`)
3. **Use `wrangler secret put`** for production secrets
4. **Separate staging and production** secrets
5. **Rotate secrets regularly** for security

## Troubleshooting

### Secrets not available in production?
- Make sure you've run `wrangler secret put` for that environment
- Check that the worker name matches in `wrangler.toml`

### GitHub Actions deployment failing?
- Verify `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set in GitHub secrets
- Check that the API token has the correct permissions

### Local development not working?
- Ensure `.dev.vars` file exists and has the required variables
- Run `npm run dev` to start the local server
