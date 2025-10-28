# Setting Up Sensitive Variables for Production Worker

Your sensitive variables need to be securely stored in Cloudflare so your Worker can use them at runtime.

## Understanding the Two Types of Credentials

1. **Deployment Credentials** (already set):
   - `CLOUDFLARE_API_TOKEN` - Used by GitHub Actions to deploy your worker
   - `CLOUDFLARE_ACCOUNT_ID` - Used by GitHub Actions to deploy your worker
   - These are stored in GitHub Secrets and are NOT available to your worker

2. **Worker Runtime Secrets** (need to be set):
   - Any API keys, tokens, or sensitive data your worker needs to function
   - These are stored in Cloudflare and ARE available to your worker

## Setting Up Worker Runtime Secrets

### Step 1: Identify What Secrets Your Worker Needs

Think about what sensitive data your worker will need:
- External API keys (OpenAI, Stripe, etc.)
- Database connection strings
- Authentication tokens
- Third-party service credentials

### Step 2: Add Secrets to Cloudflare

Use the helper script to add secrets securely:

```bash
# For production
./scripts/manage-secrets.sh put YOUR_SECRET_NAME production

# For staging
./scripts/manage-secrets.sh put YOUR_SECRET_NAME staging
```

Example:
```bash
./scripts/manage-secrets.sh put OPENAI_API_KEY production
# You'll be prompted to enter the secret value
```

Or use wrangler directly:
```bash
npx wrangler secret put YOUR_SECRET_NAME --env production
```

### Step 3: Access Secrets in Your Worker

In your `src/index.js`, secrets are available via the `env` parameter:

```javascript
export default {
  async fetch(request, env, ctx) {
    // Access your secret
    const apiKey = env.YOUR_SECRET_NAME;
    
    // Use it in your code
    const response = await fetch('https://api.example.com', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    return response;
  },
};
```

### Step 4: List Current Secrets

To see what secrets are currently set:
```bash
./scripts/manage-secrets.sh list production
```

Or:
```bash
npx wrangler secret list --env production
```

## Security Best Practices

1. ✅ **Never commit secrets** to your repository
2. ✅ **Use `.dev.vars`** for local development (already ignored by git)
3. ✅ **Use `wrangler secret put`** for production secrets
4. ✅ **Separate staging and production** secrets
5. ✅ **Rotate secrets regularly** for security
6. ✅ **Use descriptive names** for your secrets
7. ✅ **Document what each secret is for** (in comments, not in code)

## Example Workflow

Let's say you need to add an OpenAI API key:

```bash
# 1. List current secrets
./scripts/manage-secrets.sh list production

# 2. Add the secret (you'll be prompted for the value)
./scripts/manage-secrets.sh put OPENAI_API_KEY production

# 3. Deploy your worker
npm run deploy

# 4. In your code, use it:
# const response = await fetch('https://api.openai.com/v1/chat/completions', {
#   headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}` }
# });
```

## Removing Secrets

To remove a secret:
```bash
./scripts/manage-secrets.sh delete SECRET_NAME production
```

## Current Configuration

Right now, you have:
- ✅ GitHub Secrets configured for deployment
- ✅ `.dev.vars` file for local development
- ✅ Helper script for managing production secrets

You just need to add your specific worker secrets using the commands above.

## Need Help?

See the [DEPLOYMENT.md](DEPLOYMENT.md) file for more detailed information about managing secrets and deployments.
