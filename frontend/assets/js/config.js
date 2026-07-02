/**
 * API configuration.
 * Local: Worker on 8787, Pages on 8788.
 * Production: Set via meta tag (dni-mgmt-api-base), or defaults.
 * Worker URL format: https://tf-cf-dni-mgmt.rob-danz.workers.dev
 */
(function (global) {
  const host = global.location?.hostname || '';
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  let apiBase = 'https://tf-cf-dni-mgmt.rob-danz.workers.dev';
  if (isLocal) {
    apiBase = 'http://localhost:8787';
  } else {
    if (typeof document !== 'undefined') {
      const meta = document.querySelector('meta[name="dni-mgmt-api-base"]');
      if (meta?.content?.trim()) apiBase = meta.content.trim();
    }
  }

  global.CF_ANALYST_CONFIG = { apiBase };
})(typeof window !== 'undefined' ? window : this);
