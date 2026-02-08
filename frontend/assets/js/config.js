/**
 * API configuration.
 * Local: Worker on 8787, Pages on 8788.
 * Production: Set window.__CF_ANALYST_API__ before load, or edit apiBase below.
 * Worker URL format: https://cf-analyst.<your-subdomain>.workers.dev
 */
(function (global) {
  const host = global.location?.hostname || '';
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  global.CF_ANALYST_CONFIG = {
    apiBase: isLocal
      ? 'http://localhost:8787'
      : (global.__CF_ANALYST_API__ || 'https://cf-analyst.workers.dev'),  // Replace with your Worker URL after deploy
  };
})(typeof window !== 'undefined' ? window : this);
