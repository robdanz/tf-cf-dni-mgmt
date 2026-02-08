export default async function render({ api }) {
  const fetch = () => api();
  let data = {};
  try {
    data = await fetch('/api/network?range=24h');
  } catch (e) {
    return '<div class="error">Failed to load network data: ' + e.message + '</div>';
  }
  return `
    <div class="card">
      <h2 class="card-title">Network analytics (24h)</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem;">
        <div><div style="font-size: 1.5rem; font-weight: 700;">${(data.totalSessions || 0).toLocaleString()}</div><div style="color:#666">Sessions</div></div>
        <div><div style="font-size: 1.5rem; font-weight: 700;">${data.avgRtt || 0}</div><div style="color:#666">Avg RTT (ms)</div></div>
        <div><div style="font-size: 1.5rem; font-weight: 700;">${formatBytes(data.totalBytes || 0)}</div><div style="color:#666">Bytes</div></div>
      </div>
      ${data.warning ? '<div style="margin-top: 1rem; padding: 0.75rem; background: rgba(255,193,7,0.1); border-radius: 8px;">' + data.warning + '</div>' : ''}
    </div>
  `;
}

function formatBytes(b) {
  if (b >= 1e9) return (b/1e9).toFixed(1) + ' GB';
  if (b >= 1e6) return (b/1e6).toFixed(1) + ' MB';
  if (b >= 1e3) return (b/1e3).toFixed(1) + ' KB';
  return b + ' B';
}
