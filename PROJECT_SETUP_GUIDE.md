# Cloudflare Workers Project Setup Guide

Use this guide to set up a new Cloudflare Workers project with GitHub Actions deployment.

## Quick Start Prompt for AI

```
I want to set up a new Cloudflare Workers project at github/robdanz/PROJECT-NAME.

Requirements:
1. Initialize a Cloudflare Workers project
2. Use Node.js 20+ (required for wrangler v4)
3. Configure GitHub Actions for automated deployment
4. Deploy to Cloudflare Workers via GitHub Actions
5. Create .dev.vars file for local development (should never be committed)
6. Use wrangler v4 with proper configuration

The project should have:
- package.json with wrangler v4
- wrangler.toml with environment configuration
- .gitignore excluding .dev.vars and node_modules
- GitHub Actions workflow for deployment
- Basic worker code in src/index.js
```

## Prerequisites

### 1. Cloudflare Account Setup

**Create Cloudflare API Token:**
1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use "Edit Cloudflare Workers" template or create custom token with:
   - **Workers Scripts:Edit** permission
   - **Account:Cloudflare Workers:Edit** permission
   - **Zone:Read** permission (if using custom domains)

### 2. GitHub Repository Setup

```bash
# Create new repository on GitHub at github.com/robdanz/PROJECT-NAME

# Initialize local project
git init
git add .
git commit -m "Initial commit: Cloudflare Workers project setup"
git remote add origin https://github.com/robdanz/PROJECT-NAME.git
git push -u origin main
```

### 3. Configure GitHub Secrets

Go to: https://github.com/robdanz/PROJECT-NAME/settings/secrets/actions

Add these secrets:
- **Name**: `CLOUDFLARE_API_TOKEN`
  **Value**: Your Cloudflare API token from step 1
- **Name**: `CLOUDFLARE_ACCOUNT_ID`
  **Value**: Your Cloudflare account ID (found in Cloudflare dashboard)

## Required Configuration Files

### package.json

```json
{
  "name": "PROJECT-NAME",
  "version": "1.0.0",
  "description": "Cloudflare Workers project",
  "main": "src/index.js",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "jest",
    "lint": "eslint src/"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20231218.0",
    "@types/jest": "^29.5.8",
    "eslint": "^8.54.0",
    "jest": "^29.7.0",
    "prettier": "^3.1.0",
    "typescript": "^5.3.2",
    "wrangler": "^4.45.1"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/__tests__/**/*.test.js"],
    "transform": {}
  }
}
```

### wrangler.toml

```toml
name = "PROJECT-NAME"
main = "src/index.js"
compatibility_date = "2024-12-01"

[env.production]
name = "PROJECT-NAME"
vars = { ENVIRONMENT = "production" }

[env.staging]
name = "PROJECT-NAME-staging"
vars = { ENVIRONMENT = "staging" }
```

### .gitignore

Must include:
```
node_modules/
.dev.vars
.env
.env.local
dist/
build/
.wrangler/
*.log
```

### .github/workflows/deploy.yml

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'  # Important: wrangler v4 requires Node 20+
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run tests
      run: npm test
      
    - name: Deploy to Cloudflare Workers
      if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master'
      run: npx wrangler deploy --env production
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

## Key Points to Remember

### 1. Node.js Version
- **MUST use Node.js 20+** for wrangler v4
- Update in GitHub Actions: `node-version: '20'`

### 2. Wrangler Version
- **MUST use wrangler v4** (4.x+)
- Install with: `npm install --save-dev wrangler@^4.45.1`

### 3. API Token Format
- Wrangler v4 uses **environment variables**, NOT command-line flags
- Use `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as env vars

### 4. Environment Configuration
- **ALWAYS** specify environment: `npx wrangler deploy --env production`
- Use `--env production` or `--env staging` to target specific environments

### 5. Configuration Structure
- `vars` must be defined in each environment section, not at top level
- Separate `[env.production]` and `[env.staging]` sections

### 6. Local Development
- Create `.dev.vars` file (NEVER commit it)
- Add to `.gitignore`
- Contains: `CLOUDFLARE_API_TOKEN=...` and `CLOUDFLARE_ACCOUNT_ID=...`

### 7. GitHub Secrets
- Must be set before deployment can succeed
- Check at: `Settings → Secrets and variables → Actions`

## Testing Locally

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Run tests
npm test

# Deploy to Cloudflare
npm run deploy
```

## Common Errors and Fixes

### "Unable to authenticate request [code: 10001]"
- **Fix**: Check API token has correct permissions (Workers Scripts:Edit)
- **Fix**: Verify API token is correctly set in GitHub Secrets

### "Wrangler requires at least Node.js v20"
- **Fix**: Update `node-version: '20'` in GitHub Actions

### "Unknown arguments: api-token, account-id"
- **Fix**: Remove CLI flags, use environment variables instead

### "vars exists at the top level but not on env"
- **Fix**: Move vars into `[env.production]` and `[env.staging]` sections

## Checklist for New Projects

- [ ] Create Cloudflare API token with correct permissions
- [ ] Initialize Git repository
- [ ] Create `.dev.vars` file locally (never commit)
- [ ] Add `.dev.vars` to `.gitignore`
- [ ] Create `package.json` with wrangler v4
- [ ] Create `wrangler.toml` with environment configs
- [ ] Create `.github/workflows/deploy.yml`
- [ ] Set up GitHub repository
- [ ] Add GitHub Secrets (API token and account ID)
- [ ] Push initial code
- [ ] Verify deployment succeeds

## After Initial Setup

1. Add worker secrets using: `./scripts/manage-secrets.sh put SECRET_NAME production`
2. Access secrets in worker via `env.SECRET_NAME`
3. Monitor deployments at: `https://github.com/robdanz/PROJECT-NAME/actions`

## Useful Commands

```bash
# Local development
npm run dev

# Run tests
npm test

# Deploy to production
npm run deploy

# Deploy to staging
npx wrangler deploy --env staging

# List secrets
npx wrangler secret list --env production

# Add secret
npx wrangler secret put SECRET_NAME --env production

# Delete secret
npx wrangler secret delete SECRET_NAME --env production
```

## Project Structure

```
PROJECT-NAME/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions workflow
├── src/
│   ├── index.js                # Main worker code
│   └── __tests__/
│       └── index.test.js       # Tests
├── .dev.vars                   # Local environment (NOT committed)
├── .gitignore                  # Git ignore rules
├── package.json                # Dependencies
├── wrangler.toml               # Cloudflare config
└── README.md                    # Documentation
```

---

**Remember**: The three most important things are:
1. Node.js 20+
2. Wrangler v4
3. Properly configured GitHub Secrets
