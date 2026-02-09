export default async function render({ api }) {
  const apiFn = api();
  let lists = [];
  let errorMsg = '';
  let debugMsg = '';
  try {
    const data = await apiFn('/api/gateway/lists');
    lists = data.lists || [];
    if (data.error) errorMsg = data.error;
    if (data.hint) errorMsg = (errorMsg ? errorMsg + ' ' : '') + data.hint;
    if (data.debug) debugMsg = data.debug;
  } catch (e) {
    return '<div class="error">Failed to load lists: ' + e.message + '. Ensure the API Worker is running and CORS is enabled.</div>';
  }

  const opts = lists.map(l => '<option value="' + l.id + '">' + (l.name || l.id) + ' (' + (l.items?.length || 0) + ')</option>').join('');
  const errorBlock = errorMsg ? '<div class="error" style="margin-bottom:1rem">' + errorMsg + '</div>' : '';
  const debugBlock = debugMsg && lists.length === 0 ? '<div style="padding:1rem;background:#f8f9fa;border-radius:8px;color:#666;margin-bottom:1rem">' + debugMsg + '</div>' : '';

  const html = `
    ${errorBlock}
    ${debugBlock}
    <div class="card">
      <h2 class="card-title">1. Assign list roles</h2>
      <p style="margin-bottom: 1rem; color: #666;">Select which hostname list corresponds to each role:</p>
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 1rem;"><label style="min-width: 220px;">TLS Hosts Bypass (Auto Pilot):</label><select id="autopilotList" style="flex: 1; max-width: 360px;"><option value="">-- Select --</option>${opts}</select></div>
        <div style="display: flex; align-items: center; gap: 1rem;"><label style="min-width: 220px;">Bypass Domains (curated):</label><select id="bypassList" style="flex: 1; max-width: 360px;"><option value="">-- Select --</option>${opts}</select></div>
        <div style="display: flex; align-items: center; gap: 1rem;"><label style="min-width: 220px;">Block Domains:</label><select id="blockList" style="flex: 1; max-width: 360px;"><option value="">-- Select --</option>${opts}</select></div>
      </div>
      <button id="refreshLists" style="margin-top: 1rem; padding: 0.5rem 1rem; cursor: pointer;">Refresh</button>
    </div>
    <div class="card">
      <h2 class="card-title">2. Move hostnames</h2>
      <p style="margin-bottom: 1rem; color: #666;">Select the Auto Pilot list above, then move hostnames to Bypass or Block.</p>
      <div id="hostnameListContainer"><div class="loading">Select the TLS Hosts Bypass list above.</div></div>
    </div>
    <div id="messageArea"></div>
  `;

  setTimeout(() => initTlsAutopilot(lists), 0);
  return html;
}

function hostnameToDomain(hostname) {
  const parts = String(hostname || '').split('.');
  if (parts.length <= 2) return hostname;
  return parts.slice(1).join('.');
}

function showMoveDialog(success, message, targetLabel, removedCount) {
  const overlay = document.createElement('div');
  overlay.id = 'moveDialogOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
  const box = document.createElement('div');
  box.style.cssText = 'padding:1.5rem;border-radius:12px;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,0.4);';
  const color = success ? '#059669' : '#DC2626';
  box.style.background = success ? '#f0fdf4' : '#fef2f2';
  box.style.borderLeft = '4px solid ' + color;
  let text = message;
  if (success && typeof removedCount === 'number') {
    const listName = (targetLabel || 'bypass') === 'block' ? 'block' : 'bypass';
    text = 'Domain moved to ' + listName + ' list. ' + removedCount + ' matching hostname' + (removedCount === 1 ? ' has' : 's have') + ' been removed from the autopilot list.';
  }
  box.innerHTML = '<p style="margin:0 0 1rem;color:#111;font-weight:500;">' + text.replace(/</g, '&lt;') + '</p><button id="moveDialogClose" style="padding:0.5rem 1rem;cursor:pointer;background:#333;color:white;border:none;border-radius:6px;">OK</button>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); };
  document.getElementById('moveDialogClose').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

function pickListByRole(lists, role) {
  const lower = (s) => String(s || '').toLowerCase();
  const score = (list, terms) => {
    const name = lower(list.name || list.description || '');
    return terms.reduce((n, t) => n + (name.includes(t) ? 1 : 0), 0);
  };
  const exclude = (list, terms) => terms.some(t => lower(list.name || '').includes(t));

  if (role === 'autopilot') {
    const terms = ['autopilot', 'tls hosts bypass', 'tls bypass', 'hosts bypass', 'bypass_client_tls_error'];
    const best = lists.reduce((a, b) => (score(b, terms) > score(a, terms) ? b : a));
    return score(best, terms) > 0 ? best.id : null;
  }
  if (role === 'bypass') {
    const autopilotId = pickListByRole(lists, 'autopilot');
    const candidates = lists.filter(l => l.id !== autopilotId && !exclude(l, ['autopilot', 'block', 'deny']));
    const best = candidates.reduce((a, b) =>
      score(b, ['bypass', 'allow', 'whitelist', 'allowlist', 'curated']) > score(a, ['bypass', 'allow', 'whitelist', 'allowlist', 'curated']) ? b : a
    );
    return score(best, ['bypass', 'allow', 'whitelist', 'allowlist', 'curated']) > 0 ? best.id : null;
  }
  if (role === 'block') {
    const best = lists.reduce((a, b) =>
      score(b, ['block', 'deny', 'blocklist']) > score(a, ['block', 'deny', 'blocklist']) ? b : a
    );
    return score(best, ['block', 'deny', 'blocklist']) > 0 ? best.id : null;
  }
  return null;
}

function initTlsAutopilot(lists) {
  let listsRef = lists;
  const container = document.getElementById('hostnameListContainer');
  const msg = document.getElementById('messageArea');
  const apiBase = window.CF_ANALYST_CONFIG?.apiBase || '';

  async function refetchLists() {
    try {
      const res = await fetch(apiBase + '/api/gateway/lists');
      const data = await res.json();
      if (data.lists) listsRef = data.lists;
    } catch (_) {}
  }

  function loadHostnames(listId) {
    const list = listsRef.find(l => l.id === listId);
    if (!list?.items?.length) {
      container.innerHTML = '<div class="loading">No hostnames in this list.</div>';
      return;
    }
    const bypassId = document.getElementById('bypassList')?.value;
    const blockId = document.getElementById('blockList')?.value;
    container.innerHTML = '<div style="display:flex;flex-direction:column;gap:0.5rem;">' +
      list.items.map(item => {
        const v = (item.value || item.hostname || '').replace(/"/g, '&quot;');
        const esc = v.replace(/'/g, "\\'");
        const domain = hostnameToDomain(v);
        return '<div class="hostname-row" data-host="' + esc + '" data-domain="' + domain.replace(/"/g, '&quot;') + '" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:0.5rem;padding:0.75rem;background:#f8f9fa;border-radius:8px;">' +
          '<div style="display:flex;flex-direction:column;gap:0.25rem;">' +
            '<span style="font-family:monospace">' + v + '</span>' +
            '<span class="domain-cat" data-domain="' + domain.replace(/"/g, '&quot;') + '" style="font-size:0.75rem;color:#666;">Loading categorization…</span>' +
          '</div>' +
          '<div style="display:flex;gap:0.5rem;">' +
            (bypassId ? '<button data-action="move" data-host="' + esc + '" data-target="' + bypassId + '" data-target-label="bypass" style="padding:0.4rem 0.75rem;background:#10B981;color:white;border:none;border-radius:6px;cursor:pointer">To Bypass</button>' : '') +
            (blockId ? '<button data-action="move" data-host="' + esc + '" data-target="' + blockId + '" data-target-label="block" style="padding:0.4rem 0.75rem;background:#EF4444;color:white;border:none;border-radius:6px;cursor:pointer">To Block</button>' : '') +
          '</div></div>';
      }).join('') + '</div>';

    // Fetch Cloudflare Intel categorization for each unique domain
    const domains = [...new Set(list.items.map(i => hostnameToDomain(i.value || i.hostname || '')))];
    const catCache = {};
    Promise.all(domains.map(async (d) => {
      try {
        const res = await fetch(apiBase + '/api/intel/domain?domain=' + encodeURIComponent(d));
        const data = await res.json();
        if (!data.error) catCache[d] = data;
      } catch (_) {}
    })).then(() => {
      container.querySelectorAll('.domain-cat').forEach(el => {
        const d = el.getAttribute('data-domain');
        const data = catCache[d];
        if (data) {
          const parts = [];
          if ((data.content_categories || []).length) parts.push('Content: ' + data.content_categories.join(', '));
          if ((data.security_categories || []).length) parts.push('Security: ' + data.security_categories.join(', '));
          if (data.application) parts.push('App: ' + data.application);
          if ((data.risk_types || []).length) parts.push('Risks: ' + data.risk_types.join(', '));
          el.textContent = parts.length ? parts.join(' • ') : 'No categorization';
          el.style.color = (data.security_categories || []).length ? '#B45309' : '#059669';
        } else {
          el.textContent = 'No categorization data';
          el.style.color = '#999';
        }
      });
    });

    container.querySelectorAll('[data-action="move"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const hostname = btn.getAttribute('data-host')?.replace(/\\'/g, "'");
        const targetId = btn.getAttribute('data-target');
        const targetLabel = btn.getAttribute('data-target-label') || 'bypass';
        const sourceId = document.getElementById('autopilotList')?.value;
        if (!sourceId) {
          showMoveDialog(false, 'Select Auto Pilot list first.', targetLabel);
          return;
        }
        try {
          const res = await fetch(apiBase + '/api/gateway/lists/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostname, sourceListId: sourceId, targetListId: targetId })
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          showMoveDialog(true, '', targetLabel, data.removedCount ?? 1);
          await refetchLists();
          loadHostnames(sourceId);
        } catch (e) {
          showMoveDialog(false, e.message, targetLabel);
        }
      });
    });
  }

  document.getElementById('autopilotList')?.addEventListener('change', function () {
    if (this.value) loadHostnames(this.value);
    else container.innerHTML = '<div class="loading">Select the TLS Hosts Bypass list above.</div>';
  });
  document.getElementById('bypassList')?.addEventListener('change', () => {
    const aid = document.getElementById('autopilotList')?.value;
    if (aid) loadHostnames(aid);
  });
  document.getElementById('blockList')?.addEventListener('change', () => {
    const aid = document.getElementById('autopilotList')?.value;
    if (aid) loadHostnames(aid);
  });
  document.getElementById('refreshLists')?.addEventListener('click', () => window.location.reload());

  // Pre-populate dropdowns by name and load hostnames if autopilot matched
  const autopilotId = pickListByRole(lists, 'autopilot');
  const bypassId = pickListByRole(lists, 'bypass');
  const blockId = pickListByRole(lists, 'block');
  const autopilotEl = document.getElementById('autopilotList');
  const bypassEl = document.getElementById('bypassList');
  const blockEl = document.getElementById('blockList');
  if (autopilotId && autopilotEl) autopilotEl.value = autopilotId;
  if (bypassId && bypassEl) bypassEl.value = bypassId;
  if (blockId && blockEl) blockEl.value = blockId;
  if (autopilotId) loadHostnames(autopilotId);
}
