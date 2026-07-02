/**
 * API configuration.
 * Production: same origin (Worker serves both API and frontend).
 * Local dev: Worker on 8787.
 */
(function (global) {
  const host = global.location?.hostname || '';
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  const apiBase = isLocal ? 'http://localhost:8787' : '';

  global.CF_ANALYST_CONFIG = { apiBase };
})(typeof window !== 'undefined' ? window : this);
