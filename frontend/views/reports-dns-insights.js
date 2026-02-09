/**
 * DNS Insights - Gateway DNS query volume over time (stacked by result), drill to queried hostnames.
 * Account-wide; the Gateway DNS API does not support filtering by user.
 */
function formatHour(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' });
}

function formatHourRange(iso) {
  if (!iso) return '';
  const start = new Date(iso);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  return start.toLocaleString('en-US', fmt) + ' – ' + end.toLocaleString('en-US', fmt);
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function toDisplayHostname(row) {
  const normal = row?.dimensions?.queryName;
  if (normal && String(normal).trim()) return String(normal).trim();
  const reversed = row?.dimensions?.queryNameReversed;
  if (!reversed || reversed === '.') return '—';
  const parts = String(reversed).split('.').filter(Boolean);
  if (parts.length === 0) return reversed;
  return parts.reverse().join('.');
}

export default async function render({ api }) {
  const apiFn = api();
  const html = `
    <div class="card">
      <h2 class="card-title">DNS Insights (last 24 hours)</h2>
      <p style="margin-bottom: 1rem; color: #666;">Gateway DNS query volume over time, stacked by response result. Click a bar to see queried hostnames for that hour. Data is account-wide; the API does not support filtering by user.</p>
      <div id="dnsChart" style="min-height: 240px; position: relative; padding-top: 1rem;"></div>
      <div id="dnsLegend" style="margin-top: 0.5rem; display: flex; flex-wrap: wrap; gap: 0.5rem; font-size: 0.75rem;"></div>
      <div style="margin-top: 0.25rem; font-size: 0.75rem; color: #666;">
        <span id="dnsChartLabel">Loading...</span>
      </div>
    </div>
    <div class="card" id="dnsHostnamesCard" style="display: none;">
      <h2 class="card-title">Queried hostnames — <span id="dnsHourLabel">—</span></h2>
      <p style="margin-bottom: 0.75rem; color: #666; font-size: 0.9rem;">Queried hostname, result, and count for the selected hour.</p>
      <div id="dnsHostnames" style="max-height: 360px; overflow: auto;"></div>
    </div>
  `;

  setTimeout(() => initDnsInsights(apiFn), 0);
  return html;
}

function initDnsInsights(apiFn) {
  const dnsChartEl = document.getElementById('dnsChart');
  const dnsChartLabel = document.getElementById('dnsChartLabel');
  const dnsLegendEl = document.getElementById('dnsLegend');
  const dnsHostnamesCard = document.getElementById('dnsHostnamesCard');
  const dnsHostnamesEl = document.getElementById('dnsHostnames');
  const dnsHourLabel = document.getElementById('dnsHourLabel');

  let dnsChartData = [];

  function buildTimeRange() {
    const end = new Date();
    const start = new Date(end);
    start.setHours(start.getHours() - 24);
    return { datetime_geq: start.toISOString(), datetime_leq: end.toISOString() };
  }

  function buildHourRange(hourIso) {
    if (!hourIso) return buildTimeRange();
    const start = new Date(hourIso);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { datetime_geq: start.toISOString(), datetime_leq: end.toISOString() };
  }

  async function fetchDnsChart() {
    const { datetime_geq, datetime_leq } = buildTimeRange();
    const params = new URLSearchParams({ type: 'chart', datetime_geq, datetime_leq });
    const res = await apiFn('/api/dns-insights?' + params.toString());
    if (res.error) throw new Error(res.error + (res.hint ? ' ' + res.hint : ''));
    return res.data || [];
  }

  async function fetchDnsHostnames(hourIso) {
    const { datetime_geq, datetime_leq } = buildHourRange(hourIso);
    const params = new URLSearchParams({ type: 'hostnames', datetime_geq, datetime_leq });
    const res = await apiFn('/api/dns-insights?' + params.toString());
    if (res.error) throw new Error(res.error);
    return res.data || [];
  }

  function aggregateDnsByHourAndResult(data) {
    const byHour = new Map();
    for (const row of data) {
      const hour = row.dimensions?.datetimeHour;
      if (hour == null) continue;
      const d = new Date(hour);
      const key = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())).toISOString();
      const result = row.dimensions?.resolverDecision ?? '—';
      const count = row.count ?? 0;
      if (!byHour.has(key)) byHour.set(key, { total: 0, byResult: {} });
      const entry = byHour.get(key);
      entry.total += count;
      entry.byResult[result] = (entry.byResult[result] || 0) + count;
    }
    return [...byHour.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([hour, v]) => ({ hour, ...v }));
  }

  const DNS_RESULT_COLORS = {
    allowed: '#22c55e',
    blocked: '#ef4444',
    override: '#f59e0b',
    default: '#94a3b8'
  };
  function dnsResultColor(result) {
    if (!result || result === '—') return DNS_RESULT_COLORS.default;
    const r = String(result).toLowerCase();
    if (r.includes('allow')) return DNS_RESULT_COLORS.allowed;
    if (r.includes('block')) return DNS_RESULT_COLORS.blocked;
    if (r.includes('override') || r.includes('safe')) return DNS_RESULT_COLORS.override;
    return DNS_RESULT_COLORS.default;
  }

  function renderDnsChart() {
    const hourly = aggregateDnsByHourAndResult(dnsChartData);
    if (hourly.length === 0) {
      dnsChartEl.innerHTML = '<div class="loading">No DNS query data in the last 24 hours.</div>';
      dnsChartLabel.textContent = '';
      dnsLegendEl.innerHTML = '';
      return;
    }
    const allResults = new Set();
    hourly.forEach(h => Object.keys(h.byResult || {}).forEach(r => allResults.add(r)));
    const resultOrder = [...allResults].sort((a, b) => (a === '—' ? 1 : b === '—' ? -1 : a.localeCompare(b)));
    const maxTotal = Math.max(...hourly.map(h => h.total), 1);
    const chartHeight = 180;
    const scale = chartHeight / maxTotal;

    dnsChartEl.innerHTML = `
      <div style="display: flex; gap: 0.5rem; align-items: stretch;">
        <div style="display: flex; flex-direction: column-reverse; justify-content: space-between; height: ${chartHeight}px; padding: 1rem 0 0 0; font-size: 0.7rem; color: #666; text-align: right; min-width: 2.5rem;">
          ${[0, 0.25, 0.5, 0.75, 1].map(i => `<span>${Math.round((maxTotal * i)).toLocaleString()}</span>`).join('')}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: flex-end; gap: 2px; height: ${chartHeight}px; padding: 1rem 0;">
            ${hourly.map(({ hour, total, byResult }) => {
              const segs = resultOrder.map(result => {
                const cnt = byResult[result] || 0;
                const h = Math.max(0, cnt * scale);
                return { result, cnt, h, color: dnsResultColor(result) };
              }).filter(s => s.cnt > 0);
              const rangeStr = formatHourRange(hour);
              return `<div class="dns-bar" data-hour="${escapeHtml(hour)}" style="flex: 1; min-width: 2px; display: flex; flex-direction: column-reverse; align-items: stretch; gap: 0; cursor: pointer;" title="${escapeHtml(rangeStr)} • ${total.toLocaleString()} queries">
                ${segs.map(s => `<div style="height: ${s.h}px; min-height: ${s.h > 0 ? 2 : 0}px; background: ${s.color}; border-radius: 0;"></div>`).join('')}
              </div>`;
            }).join('')}
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem; color: #666;">
            <span>${formatHour(hourly[0]?.hour)}</span>
            <span>${formatHour(hourly[hourly.length - 1]?.hour)}</span>
          </div>
        </div>
      </div>
    `;
    dnsChartEl.querySelectorAll('.dns-bar').forEach(bar => {
      bar.addEventListener('click', () => showDnsHostnames(bar.dataset.hour));
    });

    dnsLegendEl.innerHTML = resultOrder.map(result => `<span style="display: flex; align-items: center; gap: 0.35rem;"><span style="width: 10px; height: 10px; border-radius: 2px; background: ${dnsResultColor(result)};"></span>${escapeHtml(result)}</span>`).join('');

    const totalQueries = hourly.reduce((s, h) => s + h.total, 0);
    dnsChartLabel.textContent = `Total: ${totalQueries.toLocaleString()} queries`;
  }

  async function showDnsHostnames(hourIso) {
    dnsHostnamesCard.style.display = 'block';
    dnsHourLabel.textContent = formatHourRange(hourIso);
    dnsHostnamesEl.innerHTML = '<div class="loading">Loading hostnames...</div>';
    dnsHostnamesCard.scrollIntoView({ behavior: 'smooth' });
    try {
      const rows = await fetchDnsHostnames(hourIso);
      if (rows.length === 0) {
        dnsHostnamesEl.innerHTML = '<p style="color:#666">No DNS hostname data for this hour.</p>';
        return;
      }
      const sorted = [...rows].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
      const total = sorted.reduce((s, r) => s + (r.count ?? 0), 0);
      dnsHostnamesEl.innerHTML = `
        <p style="margin-bottom: 0.75rem; color: #666;">Total: <strong>${total.toLocaleString()}</strong> queries</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
          <thead><tr style="text-align: left; border-bottom: 1px solid #ddd;"><th>Hostname</th><th>Result</th><th style="text-align: right;">Count</th></tr></thead>
          <tbody>
            ${sorted.map(r => {
              const hostname = toDisplayHostname(r);
              const result = r.dimensions?.resolverDecision ?? '—';
              const cnt = r.count ?? 0;
              return `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 0.35rem 0; word-break: break-all; color: #1e40af;">${escapeHtml(hostname)}</td><td style="padding: 0.35rem 0.5rem 0; color: #64748b;">${escapeHtml(String(result))}</td><td style="text-align: right; padding: 0.35rem 0;">${cnt.toLocaleString()}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      dnsHostnamesEl.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
    }
  }

  async function loadDnsChart() {
    dnsChartEl.innerHTML = '<div class="loading">Loading...</div>';
    dnsChartLabel.textContent = '';
    dnsLegendEl.innerHTML = '';
    dnsHostnamesCard.style.display = 'none';
    try {
      dnsChartData = await fetchDnsChart();
      renderDnsChart();
    } catch (e) {
      dnsChartEl.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
      dnsChartLabel.textContent = '';
    }
  }

  loadDnsChart();
}
