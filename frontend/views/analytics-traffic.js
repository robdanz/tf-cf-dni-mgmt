export default async function render({ api }) {
  const fetch = () => api();
  let data = { summary: {}, timeline: [], applications: [], countries: [], actions: [], users: [] };
  try {
    data = await fetch('/api/traffic?range=24h');
  } catch (e) {
    return '<div class="error">Failed to load traffic data: ' + e.message + '</div>';
  }
  const s = data.summary || {};
  const apps = (data.applications || []).slice(0, 5);
  return `
    <div class="card">
      <h2 class="card-title">Traffic overview (24h)</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
        <div><div style="font-size: 1.5rem; font-weight: 700;">${(s.totalRequests || 0).toLocaleString()}</div><div style="color:#666">Total requests</div></div>
        <div><div style="font-size: 1.5rem; font-weight: 700;">${(s.totalBlocked || 0).toLocaleString()}</div><div style="color:#666">Blocked</div></div>
        <div><div style="font-size: 1.5rem; font-weight: 700;">${s.blockRate || 0}%</div><div style="color:#666">Block rate</div></div>
      </div>
      <div><strong>Top applications:</strong></div>
      <ul style="margin-top: 0.5rem; list-style: none;">
        ${apps.map(a => '<li style="padding: 0.25rem 0;">' + (a.name || a.id) + ' – ' + (a.requests || 0).toLocaleString() + '</li>').join('')}
      </ul>
      ${data.warning ? '<div style="margin-top: 1rem; padding: 0.75rem; background: rgba(255,193,7,0.1); border-radius: 8px;">' + data.warning + '</div>' : ''}
    </div>
  `;
}
