/**
 * DNI List Manager - Router and app bootstrap
 */
(function () {
  const config = window.CF_ANALYST_CONFIG || { apiBase: '' };
  const API = config.apiBase;

  const routes = {
    '/': { view: 'views/reports-tls-autopilot.js', title: 'DNI List Manager', subtitle: 'Zero Trust Gateway Do-Not-Inspect list management' },
    '/dni/lists': { view: 'views/reports-tls-autopilot.js', title: 'DNI List Manager', subtitle: 'Assign list roles and move hostnames' },
  };

  async function api(path) {
    const opts = { credentials: 'include' };
    if (window.__authToken) opts.headers = { 'CF-Authorization': 'Bearer ' + window.__authToken };
    const res = await fetch(API + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error || data.message || res.statusText;
      throw new Error(data.hint ? msg + ' — ' + data.hint : msg);
    }
    return data;
  }

  async function navigate(path) {
    const route = routes[path] || routes['/'];
    const header = document.getElementById('contentHeader');
    const body = document.getElementById('contentBody');
    if (header) {
      header.querySelector('.content-title').textContent = route.title;
      header.querySelector('.content-subtitle').textContent = route.subtitle || '';
    }
    if (body) body.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const mod = await import(new URL(route.view, window.location.origin).href);
      const render = mod.default || mod.render;
      if (typeof render === 'function') {
        const html = await render({ api: () => api, config });
        if (body) body.innerHTML = html;
      }
    } catch (e) {
      console.error(e);
      if (body) body.innerHTML = '<div class="error">Failed to load: ' + e.message + '</div>';
    }

    document.querySelectorAll('.submenu-item').forEach(a => a.classList.remove('active'));
    document.querySelectorAll('.submenu-item[href="' + path + '"]').forEach(a => a.classList.add('active'));
    history.pushState({ path }, '', path);
  }

  async function loadMenu() {
    try {
      const data = await api('/api/menu');
      const menu = document.getElementById('menu');
      if (!menu || !data.items) return;
      menu.innerHTML = data.items.map(item =>
        '<div class="menu-item">' +
          '<div class="menu-item-header" data-id="' + item.id + '">' +
            '<span class="menu-item-icon">' + item.icon + '</span>' +
            '<span>' + item.label + '</span>' +
          '</div>' +
          '<div class="submenu" id="sub-' + item.id + '">' +
            (item.subItems || []).map(s => {
              const path = s.path || '#';
              return '<a href="' + path + '" class="submenu-item" data-path="' + path + '">' + s.label + '</a>';
            }).join('') +
          '</div>' +
        '</div>'
      ).join('');

      menu.querySelectorAll('.menu-item-header').forEach(h => {
        h.addEventListener('click', () => {
          const id = h.getAttribute('data-id');
          document.getElementById('sub-' + id)?.classList.toggle('expanded');
        });
      });

      menu.querySelectorAll('.submenu-item').forEach(a => {
        a.addEventListener('click', function (e) {
          const path = this.getAttribute('data-path') || this.getAttribute('href');
          if (path && path.startsWith('/') && !path.startsWith('//')) {
            e.preventDefault();
            navigate(path);
          }
        });
      });
    } catch (e) {
      console.error('Menu load failed:', e);
    }
  }

  async function loadUser() {
    const avatar = document.getElementById('userAvatar');
    const name = document.getElementById('userName');
    const email = document.getElementById('userEmail');
    try {
      const data = await api('/api/auth/validate');
      if (data.user) {
        if (avatar) avatar.textContent = (data.user.name || data.user.email || 'U').charAt(0).toUpperCase();
        if (name) name.textContent = data.user.name || data.user.email?.split('@')[0] || 'User';
        if (email) email.textContent = data.user.email || '';
      } else {
        if (name) name.textContent = 'Not signed in';
        if (email) email.textContent = '';
      }
    } catch (e) {
      console.error('Auth failed:', e);
      if (name) name.textContent = 'Auth error';
      if (email) email.textContent = '';
    }
  }

  function init() {
    const path = window.location.pathname || '/';
    const route = routes[path] || routes['/'];
    loadMenu().then(() => loadUser()).then(() => navigate(path));

    window.addEventListener('popstate', e => {
      if (e.state?.path) navigate(e.state.path);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.cfAnalyst = { navigate, api: () => api };
})();
