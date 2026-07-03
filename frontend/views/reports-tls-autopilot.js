/**
 * DNI List Manager - Triage view.
 * Master-detail: hostname list on left, detail + actions on right.
 */
export default function render({ api, showToast }) {
  let lists = [];
  let hostItems = [];
  let catCache = {};
  let selectedIdx = -1;
  let filterText = '';
  let activeSourceId = '';

  const listBody = document.getElementById('listBody');
  const detailPanel = document.getElementById('detailPanel');
  const sourceLabel = document.getElementById('sourceLabel');
  const searchInput = document.getElementById('searchInput');
  const entryCount = document.getElementById('entryCount');
  const settingsBtn = document.getElementById('settingsBtn');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const drawer = document.getElementById('drawer');
  const drawerClose = document.getElementById('drawerClose');

  // --- Settings drawer ---
  function openDrawer() {
    drawer.classList.add('open');
    drawerOverlay.classList.add('open');
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
  }

  settingsBtn.addEventListener('click', openDrawer);
  drawerClose.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);

  // --- Data loading ---
  async function loadLists() {
    try {
      const data = await api('/api/gateway/lists');
      lists = data.lists || [];
      if (data.error) showToast(data.error + (data.hint ? ' — ' + data.hint : ''), 'error');
    } catch (e) {
      showToast('Failed to load lists: ' + e.message, 'error');
      return;
    }
    populateRoleSelects();
    const autopilotId = document.getElementById('autopilotList')?.value;
    if (autopilotId) {
      activeSourceId = autopilotId;
      updateSourceLabel();
      loadHostnames(autopilotId);
    }
  }

  function populateRoleSelects() {
    const opts = '<option value="">-- Select --</option>' +
      lists.map(l => '<option value="' + l.id + '">' + (l.name || l.id) + ' (' + (l.items?.length || 0) + ')</option>').join('');

    ['autopilotList', 'bypassList', 'bypassHostList', 'blockList', 'blockHostList', 'inspectList', 'inspectHostList'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });

    const autopilotId = pickListByRole(lists, 'autopilot');
    const bypassId = pickListByRole(lists, 'bypass');
    const bypassHostId = pickListByRole(lists, 'bypassHost');
    const blockId = pickListByRole(lists, 'block');
    const blockHostId = pickListByRole(lists, 'blockHost');
    const inspectId = pickListByRole(lists, 'inspect');
    const inspectHostId = pickListByRole(lists, 'inspectHost');

    if (autopilotId) document.getElementById('autopilotList').value = autopilotId;
    if (bypassId) document.getElementById('bypassList').value = bypassId;
    if (bypassHostId) document.getElementById('bypassHostList').value = bypassHostId;
    if (blockId) document.getElementById('blockList').value = blockId;
    if (blockHostId) document.getElementById('blockHostList').value = blockHostId;
    if (inspectId) document.getElementById('inspectList').value = inspectId;
    if (inspectHostId) document.getElementById('inspectHostList').value = inspectHostId;
  }

  function updateSourceLabel() {
    const list = lists.find(l => l.id === activeSourceId);
    sourceLabel.textContent = list ? (list.name || list.id) + ' (' + (list.items?.length || 0) + ')' : 'No list selected';
  }

  function loadHostnames(listId) {
    const list = lists.find(l => l.id === listId);
    hostItems = (list?.items || []).map(i => ({
      value: (i.value || i.hostname || '').trim(),
      cat: null
    }));
    catCache = {};
    selectedIdx = -1;
    filterText = '';
    searchInput.value = '';
    renderList();
    if (hostItems.length > 0) selectItem(0);
    else renderDetail();
  }

  // --- Intel categorization (on-demand per hostname) ---
  async function fetchCategory(hostname) {
    if (catCache[hostname] !== undefined) return;
    catCache[hostname] = null; // mark as fetching
    try {
      const data = await api('/api/intel/domain?domain=' + encodeURIComponent(hostname));
      if (!data.error) catCache[hostname] = data;
    } catch (_) {}
  }

  function catSummary(cat) {
    if (!cat) return '';
    const parts = [];
    if (cat.content_categories?.length) parts.push(cat.content_categories.join(', '));
    if (cat.security_categories?.length) parts.push(cat.security_categories.join(', '));
    if (cat.application) parts.push(cat.application);
    return parts.join(' · ') || '';
  }

  // --- Client-side domain preview ---
  function previewDomain(hostname) {
    const s = hostname.toLowerCase();
    const dot = s.indexOf('.');
    if (dot < 0) return hostname;
    const stripped = s.slice(dot + 1);
    if (stripped.indexOf('.') < 0) return hostname;
    return stripped;
  }

  // --- List rendering ---
  function getFilteredItems() {
    if (!filterText) return hostItems;
    const q = filterText.toLowerCase();
    return hostItems.filter(item => {
      if (item.value.toLowerCase().includes(q)) return true;
      const summary = catSummary(item.cat).toLowerCase();
      return summary.includes(q);
    });
  }

  function renderList() {
    const filtered = getFilteredItems();
    entryCount.textContent = filterText
      ? filtered.length + ' / ' + hostItems.length
      : String(hostItems.length);

    if (filtered.length === 0) {
      listBody.innerHTML = '<div class="loading-msg">' +
        (hostItems.length === 0 ? 'Queue empty — all entries triaged' : 'No matches') +
        '</div>';
      return;
    }

    listBody.innerHTML = filtered.map((item, i) => {
      const globalIdx = hostItems.indexOf(item);
      const selected = globalIdx === selectedIdx ? ' selected' : '';
      const summary = catSummary(item.cat);
      const catText = summary || '';
      return '<div class="list-item' + selected + '" data-idx="' + globalIdx + '">' +
        '<div class="list-item-host">' + escHtml(item.value) + '</div>' +
        (catText ? '<div class="list-item-cat">' + escHtml(catText) + '</div>' : '') +
      '</div>';
    }).join('');

    listBody.querySelectorAll('.list-item').forEach(el => {
      el.addEventListener('click', () => {
        selectItem(parseInt(el.getAttribute('data-idx'), 10));
      });
    });
  }

  async function selectItem(idx) {
    selectedIdx = idx;
    renderList();
    const sel = listBody.querySelector('.list-item.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });

    if (idx >= 0 && idx < hostItems.length) {
      const item = hostItems[idx];
      // Fetch category on demand if not cached
      if (catCache[item.value] === undefined) {
        renderDetail(); // show loading state
        await fetchCategory(item.value);
        item.cat = catCache[item.value] || null;
        // Only re-render if still selected (user may have clicked elsewhere)
        if (selectedIdx === idx) {
          renderList();
          renderDetail();
        }
      } else {
        item.cat = catCache[item.value] || null;
        renderDetail();
      }
    } else {
      renderDetail();
    }
  }

  // --- Detail panel ---
  function renderDetail() {
    if (selectedIdx < 0 || selectedIdx >= hostItems.length) {
      detailPanel.innerHTML = '<div class="detail-empty">' +
        (hostItems.length === 0 ? 'Queue empty — all entries triaged' : 'Select a hostname to view details') +
        '</div>';
      return;
    }

    const item = hostItems[selectedIdx];
    const hostname = item.value;
    const domain = previewDomain(hostname);
    const cat = item.cat;

    const bypassId = document.getElementById('bypassList')?.value;
    const bypassHostId = document.getElementById('bypassHostList')?.value;
    const blockId = document.getElementById('blockList')?.value;
    const blockHostId = document.getElementById('blockHostList')?.value;
    const inspectId = document.getElementById('inspectList')?.value;
    const inspectHostId = document.getElementById('inspectHostList')?.value;
    const sourceId = activeSourceId;

    function listName(id) {
      const l = lists.find(x => x.id === id);
      return l ? (l.name || l.id) : id;
    }

    let pillsHtml = '';
    if (cat) {
      (cat.content_categories || []).forEach(c => { pillsHtml += '<span class="pill pill-content">' + escHtml(c) + '</span>'; });
      (cat.security_categories || []).forEach(c => { pillsHtml += '<span class="pill pill-security">' + escHtml(c) + '</span>'; });
      (cat.risk_types || []).forEach(c => { pillsHtml += '<span class="pill pill-risk">' + escHtml(c) + '</span>'; });
    }

    const appHtml = cat?.application
      ? '<span class="pill pill-app">' + escHtml(cat.application) + '</span>'
      : '';

    const noCat = cat && !pillsHtml && !appHtml;

    detailPanel.innerHTML =
      '<div class="detail-header">' +
        '<div>' +
          '<div class="detail-hostname">' + escHtml(hostname) + '</div>' +
          '<div class="detail-domain">Domain: ' + escHtml(domain) + '</div>' +
        '</div>' +
        '<a class="detail-radar" href="https://radar.cloudflare.com/domains/domain/' + encodeURIComponent(hostname) + '" target="_blank" rel="noopener noreferrer">Radar &#8599;</a>' +
      '</div>' +

      '<div class="detail-section">' +
        '<div class="detail-label">Categories</div>' +
        (cat === null ? '<span style="color:var(--text-muted);font-size:0.8125rem;font-style:italic;">Loading...</span>' :
         noCat ? '<span style="color:var(--text-muted);font-size:0.8125rem;">No categorization</span>' :
         pillsHtml) +
      '</div>' +

      (cat?.application ? '<div class="detail-section"><div class="detail-label">Application</div>' + appHtml + '</div>' : '') +

      '<div class="detail-actions">' +
        '<div class="action-group-label">Bypass</div>' +
        '<div class="action-row">' +
          (bypassId ? '<button class="action-btn bypass-domain" data-action="move" data-target="' + bypassId + '" data-mode="domain" data-label="domain bypass" title="Target: ' + escHtml(listName(bypassId)) + '">Domain<span class="action-btn-value">' + escHtml(domain) + '</span></button>' : '') +
          (bypassHostId ? '<button class="action-btn bypass-host" data-action="move" data-target="' + bypassHostId + '" data-mode="host" data-label="host bypass" title="Target: ' + escHtml(listName(bypassHostId)) + '">Host<span class="action-btn-value">' + escHtml(hostname) + '</span></button>' : '') +
        '</div>' +
        '<div class="action-group-label">Block</div>' +
        '<div class="action-row">' +
          (blockId ? '<button class="action-btn block-domain" data-action="move" data-target="' + blockId + '" data-mode="domain" data-label="domain block" title="Target: ' + escHtml(listName(blockId)) + '">Domain<span class="action-btn-value">' + escHtml(domain) + '</span></button>' : '') +
          (blockHostId ? '<button class="action-btn block-host" data-action="move" data-target="' + blockHostId + '" data-mode="host" data-label="host block" title="Target: ' + escHtml(listName(blockHostId)) + '">Host<span class="action-btn-value">' + escHtml(hostname) + '</span></button>' : '') +
        '</div>' +
        '<div class="action-group-label">Always Inspect</div>' +
        '<div class="action-row">' +
          (inspectId ? '<button class="action-btn inspect-domain" data-action="move" data-target="' + inspectId + '" data-mode="domain" data-label="domain inspect" title="Target: ' + escHtml(listName(inspectId)) + '">Domain<span class="action-btn-value">' + escHtml(domain) + '</span></button>' : '') +
          (inspectHostId ? '<button class="action-btn inspect-host" data-action="move" data-target="' + inspectHostId + '" data-mode="host" data-label="host inspect" title="Target: ' + escHtml(listName(inspectHostId)) + '">Host<span class="action-btn-value">' + escHtml(hostname) + '</span></button>' : '') +
        '</div>' +
        (sourceId ? '<button class="action-btn remove" data-action="remove">Remove from queue</button>' : '') +
      '</div>';

    detailPanel.querySelectorAll('[data-action="move"]').forEach(btn => {
      btn.addEventListener('click', () => handleMove(btn, hostname, sourceId));
    });
    detailPanel.querySelectorAll('[data-action="remove"]').forEach(btn => {
      btn.addEventListener('click', () => handleRemove(hostname, sourceId));
    });
  }

  // --- Actions ---
  async function handleMove(btn, hostname, sourceId) {
    const targetId = btn.getAttribute('data-target');
    const mode = btn.getAttribute('data-mode');
    const label = btn.getAttribute('data-label');
    if (!sourceId) { showToast('No source list selected', 'error'); return; }

    detailPanel.querySelectorAll('.action-btn').forEach(b => b.disabled = true);

    try {
      const data = await api('/api/gateway/lists/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname, sourceListId: sourceId, targetListId: targetId, mode })
      });
      if (data.error) throw new Error(data.error);

      const removedCount = data.removedCount ?? 1;
      const value = data.value || hostname;
      const undoMove = async () => {
        // Remove the value from target list
        await api('/api/gateway/lists/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listId: targetId, value })
        });
        // Add the original hostname back to source list
        await api('/api/gateway/lists/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listId: sourceId, value: hostname })
        });
        await refetchAndReload(sourceId);
      };
      showToast('Moved to ' + label + ': ' + value + ' (' + removedCount + ' entr' + (removedCount === 1 ? 'y' : 'ies') + ' removed)', 'success', undoMove);

      await refetchAndReload(sourceId);
    } catch (e) {
      showToast(e.message, 'error');
      detailPanel.querySelectorAll('.action-btn').forEach(b => b.disabled = false);
    }
  }

  async function handleRemove(hostname, sourceId) {
    if (!sourceId) { showToast('No source list selected', 'error'); return; }

    detailPanel.querySelectorAll('.action-btn').forEach(b => b.disabled = true);

    try {
      const data = await api('/api/gateway/lists/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: sourceId, value: hostname })
      });
      if (data.error) throw new Error(data.error);

      const undoRemove = async () => {
        await api('/api/gateway/lists/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listId: sourceId, value: hostname })
        });
        await refetchAndReload(sourceId);
      };
      showToast('Removed from queue: ' + hostname, 'success', undoRemove);
      await refetchAndReload(sourceId);
    } catch (e) {
      showToast(e.message, 'error');
      detailPanel.querySelectorAll('.action-btn').forEach(b => b.disabled = false);
    }
  }

  async function refetchAndReload(sourceId) {
    try {
      const data = await api('/api/gateway/lists');
      if (data.lists) lists = data.lists;
    } catch (_) {}

    const list = lists.find(l => l.id === sourceId);
    const oldIdx = selectedIdx;
    hostItems = (list?.items || []).map(i => ({
      value: (i.value || i.hostname || '').trim(),
      cat: catCache[(i.value || i.hostname || '').trim()] || null
    }));

    if (hostItems.length === 0) {
      selectedIdx = -1;
    } else if (oldIdx >= hostItems.length) {
      selectedIdx = hostItems.length - 1;
    } else {
      selectedIdx = oldIdx;
    }

    updateSourceLabel();
    renderList();
    renderDetail();
  }

  // --- Search ---
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filterText = searchInput.value.trim();
      renderList();
    }, 150);
  });

  // --- Escape ---
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- pickListByRole (preserved from original) ---
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
      const best = candidates.reduce((a, b) =>
        score(b, ['bypass', 'domain', 'inspection', 'allow', 'whitelist', 'allowlist', 'curated']) > score(a, ['bypass', 'domain', 'inspection', 'allow', 'whitelist', 'allowlist', 'curated']) ? b : a
      );
      return score(best, ['bypass', 'domain', 'inspection', 'allow', 'whitelist', 'allowlist', 'curated']) > 0 ? best.id : null;
    }
    if (role === 'blockHost') {
      const autopilotId = pickListByRole(lists, 'autopilot');
      const candidates = lists.filter(l => l.id !== autopilotId && !exclude(l, ['autopilot', 'bypass', 'inspection']));
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
    if (role === 'inspectHost') {
      const candidates = lists.filter(l => !exclude(l, ['autopilot', 'bypass', 'block', 'deny']));
      const best = candidates.reduce((a, b) =>
        score(b, ['always', 'inspect', 'host']) > score(a, ['always', 'inspect', 'host']) ? b : a
      );
      return score(best, ['always', 'inspect', 'host']) > 0 ? best.id : null;
    }
    if (role === 'inspect') {
      const inspectHostId = pickListByRole(lists, 'inspectHost');
      const candidates = lists.filter(l =>
        l.id !== inspectHostId &&
        !exclude(l, ['autopilot', 'bypass', 'block', 'deny'])
      );
      const best = candidates.reduce((a, b) =>
        score(b, ['always', 'inspect', 'domain']) > score(a, ['always', 'inspect', 'domain']) ? b : a
      );
      return score(best, ['always', 'inspect', 'domain']) > 0 ? best.id : null;
    }
    return null;
  }

  // --- Autopilot dropdown change in settings reloads the source ---
  document.getElementById('autopilotList')?.addEventListener('change', function () {
    if (this.value) {
      activeSourceId = this.value;
      updateSourceLabel();
      loadHostnames(this.value);
    }
  });

  // --- Init ---
  loadLists();
}
