# DNI List Manager

Manages Zero Trust Gateway Do-Not-Inspect (DNI) hostname lists via a Cloudflare Worker API and Pages frontend. Move, remove, and categorize hostnames across Gateway lists.

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars   # add your API token and account ID
npm run dev                      # Worker on :8787
npm run dev:pages                # Frontend on :8788 (proxies API to :8787)
```

## Deploy

```bash
npm run deploy          # Worker to Cloudflare
npm run deploy:pages    # Frontend to Cloudflare Pages
```

## Project Structure

```
tf-cf-dni-mgmt/
├── src/index.js                           # Worker API
├── frontend/
│   ├── index.html                         # App shell
│   ├── assets/js/config.js                # API base config
│   ├── assets/js/app.js                   # Router + bootstrap
│   └── views/reports-tls-autopilot.js     # DNI list manager view
├── wrangler.toml                          # Worker config
└── package.json
```

## License

MIT
