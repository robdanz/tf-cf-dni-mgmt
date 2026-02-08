export default async function render({ api }) {
  const fetch = () => api();
  let lists = [];
  try {
    const data = await fetch('/api/gateway/lists');
    lists = data.lists || [];
  } catch (e) {
    return '<div class="error">Failed to load lists: ' + e.message + '. Ensure the API Worker is running and CORS is enabled.</div>';
  }

  const opts = lists.map(l => '<option value="' + l.id + '">' + (l.name || l.id) + ' (' + (l.items?.length || 0) + ')</option>').join('');

  const html = `
    <div class="card">
      <h2 class="card-title">1. Assign list roles</h2>
      <p style="margin-bottom: 1rem; color: #666;">Select which hostname list corresponds to each role:</p>
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div><label>TLS Hosts Bypass (Auto Pilot):</label><select id="autopilotList"><option value="">-- Select --</option>${opts}</select></div>
        <div><label>Bypass Domains (curated):</label><select id="bypassList"><option value="">-- Select --</option>${opts}</select></div>
        <div><label>Block Domains:</label><select id="blockList"><option value="">-- Select --</option>${opts}</select></div>
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

  queueMicrotask(() => initTlsAutopilot(lists));
  return html;
}

function initTlsAutopilot(lists) {
  const container = document.getElementById('hostnameListContainer');
  const msg = document.getElementById('messageArea');
  const apiBase = window.CF_ANALYST_CONFIG?.apiBase || '';

  function loadHostnames(listId) {
    const list = lists.find(l => l.id === listId);
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
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;background:#f8f9fa;border-radius:8px;">' +
          '<span style="font-family:monospace">' + v + '</span>' +
          '<div style="display:flex;gap:0.5rem">' +
            (bypassId ? '<button data-action="move" data-host="' + esc + '" data-target="' + bypassId + '" style="padding:0.4rem 0.75rem;background:#10B981;color:white;border:none;border-radius:6px;cursor:pointer">To Bypass</button>' : '') +
            (blockId ? '<button data-action="move" data-host="' + esc + '" data-target="' + blockId + '" style="padding:0.4rem 0.75rem;background:#EF4444;color:white;border:none;border-radius:6px;cursor:pointer">To Block</button>' : '') +
          '</div></div>';
      }).join('') + '</div>';

    container.querySelectorAll('[data-action="move"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const hostname = btn.getAttribute('data-host')?.replace(/\\'/g, "'");
        const targetId = btn.getAttribute('data-target');
        const sourceId = document.getElementById('autopilotList')?.value;
        if (!sourceId) { msg.innerHTML = '<div class="error">Select Auto Pilot list first.</div>'; return; }
        try {
          const res = await fetch(apiBase + '/api/gateway/lists/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostname, sourceListId: sourceId, targetListId: targetId })
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          msg.innerHTML = '<div style="background:rgba(16,185,129,0.1);color:#059669;padding:1rem;border-radius:8px">Moved ' + hostname + ' → ' + data.domain + '</div>';
          setTimeout(() => { msg.innerHTML = ''; }, 4000);
          loadHostnames(sourceId);
        } catch (e) {
          msg.innerHTML = '<div class="error">' + e.message + '</div>';
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
}
