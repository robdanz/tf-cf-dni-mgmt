/**
 * API configuration.
 * Local: Worker on 8787, Pages on 8788.
 * Production: Set via meta tag (cf-analyst-api-base), window.__CF_ANALYST_API__, or defaults.
 * Worker URL format: https://cf-analyst.rob-danz.workers.dev
 */
(function (global) {
  const host = global.location?.hostname || '';
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  let apiBase = 'https://cf-analyst.rob-danz.workers.dev';
  if (isLocal) {
    apiBase = 'http://localhost:8787';
  } else if (host === 'cf-analyst.tancow.net') {
    apiBase = '';
  } else {
    if (typeof document !== 'undefined') {
      const meta = document.querySelector('meta[name="cf-analyst-api-base"]');
      if (meta?.content?.trim()) apiBase = meta.content.trim();
    }
    if (apiBase === 'https://cf-analyst.rob-danz.workers.dev' && global.__CF_ANALYST_API__) {
      apiBase = global.__CF_ANALYST_API__;
    }
  }

  global.CF_ANALYST_CONFIG = { apiBase };
})(typeof window !== 'undefined' ? window : this);
