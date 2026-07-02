/**
 * DNI List Manager - App bootstrap and toast system.
 * No router — single-view app. Loads the triage view directly.
 */
(function () {
  const config = window.CF_ANALYST_CONFIG || { apiBase: '' };
  const API = config.apiBase;

  async function api(path, opts = {}) {
    const res = await fetch(API + path, { credentials: 'include', ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error || data.message || res.statusText;
      throw new Error(data.hint ? msg + ' — ' + data.hint : msg);
    }
    return data;
  }

  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => { el.remove(); }, 4000);
  }

  async function loadUser() {
    const el = document.getElementById('userEmail');
    try {
      const data = await api('/api/auth/validate');
      if (data.user && el) el.textContent = data.user.email || '';
    } catch (e) {
      console.error('Auth failed:', e);
      if (el) el.textContent = 'Auth error';
    }
  }

  async function init() {
    loadUser();
    try {
      const mod = await import(new URL('views/reports-tls-autopilot.js', window.location.origin).href);
      const render = mod.default || mod.render;
      if (typeof render === 'function') render({ api, showToast });
    } catch (e) {
      console.error('View load failed:', e);
      const listBody = document.getElementById('listBody');
      if (listBody) listBody.innerHTML = '<div class="error-msg">Failed to load: ' + e.message + '</div>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
