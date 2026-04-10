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
        <div style="display: flex; align-items: center; gap: 1rem;"><label style="min-width: 220px;">Bypass Hosts (curated):</label><select id="bypassHostList" style="flex: 1; max-width: 360px;"><option value="">-- Select --</option>${opts}</select></div>
        <div style="display: flex; align-items: center; gap: 1rem;"><label style="min-width: 220px;">Block Domains:</label><select id="blockList" style="flex: 1; max-width: 360px;"><option value="">-- Select --</option>${opts}</select></div>
        <div style="display: flex; align-items: center; gap: 1rem;"><label style="min-width: 220px;">Block Hosts:</label><select id="blockHostList" style="flex: 1; max-width: 360px;"><option value="">-- Select --</option>${opts}</select></div>
      </div>
      <button id="refreshLists" style="margin-top: 1rem; padding: 0.5rem 1rem; cursor: pointer;">Refresh</button>
    </div>
    <div class="card">
      <h2 class="card-title">2. Move hostnames</h2>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <p style="margin:0;color:#666;">Select the Auto Pilot list above, then move hostnames to Bypass or Block.</p>
        <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;color:#666;cursor:pointer;white-space:nowrap;">
          <input type="checkbox" id="showConfirmation" checked style="cursor:pointer;"> Show confirmation
        </label>
      </div>
      <div id="hostnameListContainer"><div class="loading">Select the TLS Hosts Bypass list above.</div></div>
    </div>
    <div id="messageArea"></div>
  `;

  setTimeout(() => initTlsAutopilot(lists), 0);
  return html;
}

function showMoveDialog(success, message, targetLabel, removedCount, isRemove) {
  const overlay = document.createElement('div');
  overlay.id = 'moveDialogOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
  const box = document.createElement('div');
  box.style.cssText = 'padding:1.5rem;border-radius:12px;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,0.4);';
  const color = success ? '#059669' : '#DC2626';
  box.style.background = success ? '#f0fdf4' : '#fef2f2';
  box.style.borderLeft = '4px solid ' + color;
  let text = message;
  if (success && isRemove) {
    text = 'Entry removed from the autopilot list.';
  } else if (success && typeof removedCount === 'number') {
    if (targetLabel === 'host-bypass' || targetLabel === 'host-block') {
      const listName = targetLabel === 'host-bypass' ? 'host bypass' : 'host block';
      text = 'Hostname moved to ' + listName + ' list. Removed from the autopilot list.';
    } else {
      const listName = targetLabel === 'domain-block' ? 'domain block' : 'domain bypass';
      text = 'Domain moved to ' + listName + ' list. ' + removedCount + ' matching hostname' + (removedCount === 1 ? ' has' : 's have') + ' been removed from the autopilot list.';
    }
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
  if (role === 'bypassHost') {
    const autopilotId = pickListByRole(lists, 'autopilot');
    const candidates = lists.filter(l => l.id !== autopilotId && !exclude(l, ['autopilot', 'block', 'deny']));
    // inspection is the key differentiator for 01-BYPASS-INSPECTION-HOSTS
    const best = candidates.reduce((a, b) =>
      score(b, ['inspection', 'bypass', 'host']) > score(a, ['inspection', 'bypass', 'host']) ? b : a
    );
    return score(best, ['inspection', 'bypass', 'host']) > 0 ? best.id : null;
  }
  if (role === 'bypass') {
    const autopilotId = pickListByRole(lists, 'autopilot');
    const bypassHostId = pickListByRole(lists, 'bypassHost');
    const candidates = lists.filter(l =>
      l.id !== autopilotId && l.id !== bypassHostId &&
      !exclude(l, ['autopilot', 'block', 'deny'])
    );
    // domain/inspection are key differentiators for 01-BYPASS-INSPECTION-DOMAINS
    const best = candidates.reduce((a, b) =>
      score(b, ['bypass', 'domain', 'inspection', 'allow', 'whitelist', 'allowlist', 'curated']) > score(a, ['bypass', 'domain', 'inspection', 'allow', 'whitelist', 'allowlist', 'curated']) ? b : a
    );
    return score(best, ['bypass', 'domain', 'inspection', 'allow', 'whitelist', 'allowlist', 'curated']) > 0 ? best.id : null;
  }
  if (role === 'blockHost') {
    const autopilotId = pickListByRole(lists, 'autopilot');
    const candidates = lists.filter(l => l.id !== autopilotId && !exclude(l, ['autopilot', 'bypass', 'inspection']));
    // host is the key differentiator for 01-BLOCK-HOST-LIST
    const best = candidates.reduce((a, b) =>
      score(b, ['block', 'host']) > score(a, ['block', 'host']) ? b : a
    );
    return score(best, ['block', 'host']) > 0 ? best.id : null;
  }
  if (role === 'block') {
    const autopilotId = pickListByRole(lists, 'autopilot');
    const blockHostId = pickListByRole(lists, 'blockHost');
    const candidates = lists.filter(l =>
      l.id !== autopilotId && l.id !== blockHostId &&
      !exclude(l, ['autopilot', 'bypass'])
    );
    const best = candidates.reduce((a, b) =>
      score(b, ['block', 'deny', 'blocklist']) > score(a, ['block', 'deny', 'blocklist']) ? b : a
    );
    return score(best, ['block', 'deny', 'blocklist']) > 0 ? best.id : null;
  }
  return null;
}

function initTlsAutopilot(lists) {
  let listsRef = lists;
  const container = document.getElementById('hostnameListContainer');
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
    const bypassHostId = document.getElementById('bypassHostList')?.value;
    const blockId = document.getElementById('blockList')?.value;
    const blockHostId = document.getElementById('blockHostList')?.value;
    const sourceId = document.getElementById('autopilotList')?.value;

    container.innerHTML = '<div style="display:flex;flex-direction:column;gap:0.5rem;">' +
      list.items.map(item => {
        const v = (item.value || item.hostname || '').replace(/"/g, '&quot;');
        const esc = v.replace(/'/g, "\\'");
        return '<div class="hostname-row" data-host="' + esc + '" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:0.5rem;padding:0.75rem;background:#f8f9fa;border-radius:8px;">' +
          '<div style="display:flex;flex-direction:column;gap:0.25rem;">' +
            '<span style="font-family:monospace">' + v + '</span>' +
            '<span class="domain-cat" data-host="' + esc + '" style="font-size:0.75rem;color:#666;">Loading categorization…</span>' +
          '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;">' +
            (bypassHostId ? '<button data-action="move" data-host="' + esc + '" data-target="' + bypassHostId + '" data-target-label="host-bypass" data-mode="host" style="padding:0.4rem 0.75rem;background:#059669;color:white;border:none;border-radius:6px;cursor:pointer">To Host Bypass</button>' : '') +
            (bypassId ? '<button data-action="move" data-host="' + esc + '" data-target="' + bypassId + '" data-target-label="domain-bypass" data-mode="domain" style="padding:0.4rem 0.75rem;background:#10B981;color:white;border:none;border-radius:6px;cursor:pointer">To Domain Bypass</button>' : '') +
            (blockHostId ? '<button data-action="move" data-host="' + esc + '" data-target="' + blockHostId + '" data-target-label="host-block" data-mode="host" style="padding:0.4rem 0.75rem;background:#DC2626;color:white;border:none;border-radius:6px;cursor:pointer">To Host Block</button>' : '') +
            (blockId ? '<button data-action="move" data-host="' + esc + '" data-target="' + blockId + '" data-target-label="domain-block" data-mode="domain" style="padding:0.4rem 0.75rem;background:#EF4444;color:white;border:none;border-radius:6px;cursor:pointer">To Domain Block</button>' : '') +
            (sourceId ? '<button data-action="remove" data-host="' + esc + '" data-list="' + sourceId + '" style="padding:0.4rem 0.75rem;background:#6B7280;color:white;border:none;border-radius:6px;cursor:pointer">Remove</button>' : '') +
          '</div></div>';
      }).join('') + '</div>';

    // Fetch Cloudflare Intel categorization for each unique hostname
    const hostnames = [...new Set(list.items.map(i => (i.value || i.hostname || '').trim()).filter(Boolean))];
    const catCache = {};
    Promise.all(hostnames.map(async (h) => {
      try {
        const res = await fetch(apiBase + '/api/intel/domain?domain=' + encodeURIComponent(h));
        const data = await res.json();
        if (!data.error) catCache[h] = data;
      } catch (_) {}
    })).then(() => {
      container.querySelectorAll('.domain-cat').forEach(el => {
        const h = el.getAttribute('data-host')?.replace(/&quot;/g, '"').replace(/\\'/g, "'");
        const data = catCache[h];
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
        const hostname = btn.getAttribute('data-host')?.replace(/&quot;/g, '"').replace(/\\'/g, "'");
        const targetId = btn.getAttribute('data-target');
        const targetLabel = btn.getAttribute('data-target-label') || 'domain-bypass';
        const mode = btn.getAttribute('data-mode') || 'domain';
        const sourceId = document.getElementById('autopilotList')?.value;
        if (!sourceId) {
          showMoveDialog(false, 'Select Auto Pilot list first.', targetLabel);
          return;
        }
        try {
          const res = await fetch(apiBase + '/api/gateway/lists/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostname, sourceListId: sourceId, targetListId: targetId, mode })
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          if (document.getElementById('showConfirmation')?.checked) {
            showMoveDialog(true, '', targetLabel, data.removedCount ?? 1);
          }
          await refetchLists();
          loadHostnames(sourceId);
        } catch (e) {
          showMoveDialog(false, e.message, targetLabel);
        }
      });
    });

    container.querySelectorAll('[data-action="remove"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const value = btn.getAttribute('data-host')?.replace(/&quot;/g, '"').replace(/\\'/g, "'");
        const listId = btn.getAttribute('data-list');
        if (!listId) {
          showMoveDialog(false, 'Select Auto Pilot list first.', null, null, true);
          return;
        }
        try {
          const res = await fetch(apiBase + '/api/gateway/lists/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listId, value })
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          if (document.getElementById('showConfirmation')?.checked) {
            showMoveDialog(true, '', null, null, true);
          }
          await refetchLists();
          loadHostnames(listId);
        } catch (e) {
          showMoveDialog(false, e.message, null, null, true);
        }
      });
    });
  }

  const reloadIfActive = () => {
    const aid = document.getElementById('autopilotList')?.value;
    if (aid) loadHostnames(aid);
  };

  document.getElementById('autopilotList')?.addEventListener('change', function () {
    if (this.value) loadHostnames(this.value);
    else container.innerHTML = '<div class="loading">Select the TLS Hosts Bypass list above.</div>';
  });
  document.getElementById('bypassList')?.addEventListener('change', reloadIfActive);
  document.getElementById('bypassHostList')?.addEventListener('change', reloadIfActive);
  document.getElementById('blockList')?.addEventListener('change', reloadIfActive);
  document.getElementById('blockHostList')?.addEventListener('change', reloadIfActive);
  document.getElementById('refreshLists')?.addEventListener('click', () => window.location.reload());

  // Pre-populate dropdowns by heuristic name matching
  const autopilotId = pickListByRole(lists, 'autopilot');
  const bypassId = pickListByRole(lists, 'bypass');
  const bypassHostId = pickListByRole(lists, 'bypassHost');
  const blockId = pickListByRole(lists, 'block');
  const blockHostId = pickListByRole(lists, 'blockHost');

  if (autopilotId) document.getElementById('autopilotList').value = autopilotId;
  if (bypassId) document.getElementById('bypassList').value = bypassId;
  if (bypassHostId) document.getElementById('bypassHostList').value = bypassHostId;
  if (blockId) document.getElementById('blockList').value = blockId;
  if (blockHostId) document.getElementById('blockHostList').value = blockHostId;

  if (autopilotId) loadHostnames(autopilotId);
}
