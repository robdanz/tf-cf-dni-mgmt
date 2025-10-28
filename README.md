# CF-Analyst

A Cloudflare Workers project for analytics and data processing.

## Project Structure

```
cf-analyst/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions deployment workflow
├── .gitignore                 # Git ignore rules
├── package.json               # Node.js dependencies and scripts
├── wrangler.toml             # Cloudflare Workers configuration
├── .dev.vars                  # Local development environment variables (not committed)
└── src/
    └── index.js               # Main worker script
```

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Cloudflare account
- GitHub account

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/robdanz/cf-analyst.git
   cd cf-analyst
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your local environment file:
   ```bash
   touch .dev.vars
   ```
   
   Add your environment variables to `.dev.vars`:
   ```
   # Example environment variables
   API_KEY=your-api-key
   DATABASE_URL=your-database-url
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

### Environment Variables

The `.dev.vars` file is used for local development and contains sensitive information. It's automatically ignored by git and should never be committed to the repository.

For production deployment, configure environment variables in:
- **GitHub Actions secrets** (for CI/CD deployment)
- **Cloudflare Workers** (for runtime use in production)

To add secrets to your Cloudflare Worker in production, you can either:

1. **Use the helper script** (recommended):
   ```bash
   ./scripts/manage-secrets.sh put SECRET_NAME production
   ```

2. **Use `wrangler secret put` command**:
   ```bash
   npx wrangler secret put SECRET_NAME --env production
   ```
   This will prompt you to enter the secret value securely.

3. **Set non-sensitive variables via wrangler.toml**:
   ```toml
   [env.production.vars]
   ENVIRONMENT = "production"
   ```

For detailed deployment and secret management instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Deployment

### GitHub Actions (Primary)

This project uses GitHub Actions for automated deployment to Cloudflare Workers.

#### Required Secrets

Configure these secrets in your GitHub repository settings:

- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID

#### Deployment Process

1. Push to `main` or `master` branch
2. GitHub Actions will automatically:
   - Install dependencies
   - Run tests
   - Deploy to Cloudflare Workers


## Scripts

- `npm run dev` - Start development server
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Configuration

### Wrangler Configuration

The `wrangler.toml` file contains the Cloudflare Workers configuration:

- Worker name and entry point
- Environment-specific settings
- KV namespaces, R2 buckets, and Durable Objects (commented out)

### Environment Setup

- **Development**: Uses `.dev.vars` for local environment variables
- **Staging**: Deploys to `cf-analyst-staging` worker
- **Production**: Deploys to `cf-analyst` worker

## Security

- `.dev.vars` is automatically ignored by git
- Environment variables are managed through secure CI/CD systems
- API tokens are stored as encrypted secrets

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `npm test`
4. Run linting: `npm run lint`
5. Create a merge request

## License

MIT
