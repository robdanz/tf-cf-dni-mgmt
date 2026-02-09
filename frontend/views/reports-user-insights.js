/**
 * User Insights - HTTP by user (last 24 hours).
 * One user selector. Bar chart by hour → hostnames → request details.
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

export default async function render({ api }) {
  const apiFn = api();
  const html = `
    <div class="card">
      <h2 class="card-title">User Insights (last 24 hours)</h2>
      <p style="margin-bottom: 1rem; color: #666;">Select a user to see HTTP activity. One selector applies to the chart and drill-down below.</p>
      <div style="margin-bottom: 1rem;">
        <label for="userInsightsEmail" style="font-weight: 500; margin-right: 0.5rem;">User (email):</label>
        <select id="userInsightsEmail" style="min-width: 260px; padding: 0.4rem 0.5rem; font-size: 0.95rem;">
          <option value="">-- Select user --</option>
        </select>
      </div>
      <h3 style="font-size: 1rem; margin: 1rem 0 0.5rem; color: #333;">HTTP</h3>
      <p style="margin-bottom: 0.75rem; color: #666; font-size: 0.9rem;">Gateway L7 request volume by hour. Click a bar for hostname breakdown; click a hostname for timestamps and URLs.</p>
      <div id="userInsightsChart" style="min-height: 280px; position: relative; padding-top: 1.5rem;"></div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; color: #666;">
        <span id="userInsightsChartLabel">Select a user to load the chart.</span>
      </div>
    </div>
    <div class="card" id="userInsightsHostsCard" style="display: none;">
      <h2 class="card-title">Hostnames for <span id="userInsightsHourLabel">—</span></h2>
      <p style="margin-bottom: 0.75rem; color: #666; font-size: 0.9rem;">Click a hostname to see request timestamps and URLs.</p>
      <div id="userInsightsHosts" style="max-height: 320px; overflow: auto;"></div>
    </div>
    <div class="card" id="userInsightsDetailsCard" style="display: none;">
      <h2 class="card-title">Request details for <span id="userInsightsHostLabel">—</span></h2>
      <p style="margin-bottom: 0.75rem; color: #666; font-size: 0.85rem;">Date/time and URL for the selected hour and hostname.</p>
      <div id="userInsightsDetails" style="max-height: 360px; overflow: auto;"></div>
    </div>
  `;

  setTimeout(() => initUserInsights(apiFn), 0);
  return html;
}

function initUserInsights(apiFn) {
  const emailSelect = document.getElementById('userInsightsEmail');
  const chartEl = document.getElementById('userInsightsChart');
  const chartLabel = document.getElementById('userInsightsChartLabel');
  const hostsCard = document.getElementById('userInsightsHostsCard');
  const hostsEl = document.getElementById('userInsightsHosts');
  const hourLabel = document.getElementById('userInsightsHourLabel');
  const detailsCard = document.getElementById('userInsightsDetailsCard');
  const detailsEl = document.getElementById('userInsightsDetails');
  const hostLabel = document.getElementById('userInsightsHostLabel');

  let chartData = [];
  let selectedEmail = '';
  let activeDetailHour = null;
  let activeDetailHost = null;

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

  async function fetchEmails() {
    const { datetime_geq, datetime_leq } = buildTimeRange();
    const params = new URLSearchParams({ type: 'emails', datetime_geq, datetime_leq });
    const res = await apiFn('/api/user-insights?' + params.toString());
    if (res.error) throw new Error(res.error + (res.hint ? ' ' + res.hint : ''));
    return res.data || [];
  }

  async function fetchChart(email) {
    const { datetime_geq, datetime_leq } = buildTimeRange();
    const params = new URLSearchParams({ type: 'chart', email, datetime_geq, datetime_leq });
    const res = await apiFn('/api/user-insights?' + params.toString());
    if (res.error) throw new Error(res.error);
    return res.data || [];
  }

  async function fetchHosts(email, hourIso) {
    const { datetime_geq, datetime_leq } = buildHourRange(hourIso);
    const params = new URLSearchParams({ type: 'hosts', email, datetime_geq, datetime_leq });
    const res = await apiFn('/api/user-insights?' + params.toString());
    if (res.error) throw new Error(res.error);
    return res.data || [];
  }

  async function fetchDetails(email, httpHost, hourIso) {
    const { datetime_geq, datetime_leq } = buildHourRange(hourIso);
    const params = new URLSearchParams({ type: 'details', email, httpHost, datetime_geq, datetime_leq });
    const res = await apiFn('/api/user-insights?' + params.toString());
    if (res.error) throw new Error(res.error);
    return res.data || [];
  }

  function aggregateByHour(data) {
    const byHour = new Map();
    for (const row of data) {
      const hour = row.dimensions?.datetimeHour;
      const count = row.count ?? 0;
      if (hour == null) continue;
      const key = typeof hour === 'string' ? hour : new Date(hour).toISOString();
      byHour.set(key, (byHour.get(key) || 0) + count);
    }
    return [...byHour.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([hour, total]) => ({ hour, total }));
  }

  async function loadEmails() {
    try {
      const rows = await fetchEmails();
      const emails = [];
      const seen = new Set();
      for (const r of rows) {
        const email = r.dimensions?.email;
        if (email && !seen.has(email)) {
          seen.add(email);
          emails.push({ email, count: r.count ?? 0 });
        }
      }
      emails.sort((a, b) => (b.count - a.count));
      emailSelect.innerHTML = '<option value="">-- Select user --</option>' +
        emails.map(({ email, count }) => `<option value="${escapeHtml(email)}">${escapeHtml(email)} (${(count || 0).toLocaleString()} requests)</option>`).join('');
    } catch (e) {
      console.error('Failed to load emails:', e);
      emailSelect.innerHTML = '<option value="">-- Failed to load --</option>';
    }
  }

  function renderChart() {
    const hourly = aggregateByHour(chartData);
    if (hourly.length === 0) {
      chartEl.innerHTML = '<div class="loading">No data for this user in the last 24 hours.</div>';
      chartLabel.textContent = '';
      return;
    }

    const maxTotal = Math.max(...hourly.map(h => h.total), 1);
    const chartHeight = 200;
    const scale = chartHeight / maxTotal;
    const tickCount = 5;
    const tickValues = [];
    for (let i = 0; i <= tickCount; i++) {
      const v = Math.round((maxTotal * i) / tickCount);
      if (i === 0 || v !== tickValues[tickValues.length - 1]) tickValues.push(v);
    }

    chartEl.innerHTML = `
      <div style="display: flex; gap: 0.5rem; align-items: stretch;">
        <div style="display: flex; flex-direction: column-reverse; justify-content: space-between; height: ${chartHeight}px; padding: 1rem 0 0 0; font-size: 0.7rem; color: #666; text-align: right; min-width: 2.5rem;">
          ${tickValues.map(v => `<span>${v.toLocaleString()}</span>`).join('')}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: flex-end; gap: 2px; height: ${chartHeight}px; padding: 1rem 0;">
            ${hourly.map(({ hour, total }) => {
              const rangeStr = formatHourRange(hour);
              const h = Math.max(0, total * scale);
              return `
                <div class="user-insights-bar" data-hour="${hour}" style="flex: 1; min-width: 2px; display: flex; flex-direction: column-reverse; align-items: center;" title="${escapeHtml(rangeStr)} • ${total.toLocaleString()} requests">
                  <div style="width: 100%; height: ${h}px; min-height: ${h > 0 ? 2 : 0}px; background: #2563eb; border-radius: 1px; cursor: pointer;" title="${escapeHtml(rangeStr)}"></div>
                </div>
              `;
            }).join('')}
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem; color: #666;">
            <span>${formatHour(hourly[0]?.hour)}</span>
            <span>${formatHour(hourly[hourly.length - 1]?.hour)}</span>
          </div>
        </div>
      </div>
    `;

    chartEl.querySelectorAll('.user-insights-bar').forEach(bar => {
      bar.addEventListener('click', () => showHosts(bar.dataset.hour));
    });

    chartLabel.textContent = `${selectedEmail} — ${hourly.reduce((s, h) => s + h.total, 0).toLocaleString()} total requests`;
  }

  async function showHosts(hourIso) {
    if (!selectedEmail) return;
    activeDetailHour = hourIso;
    activeDetailHost = null;
    hostsCard.style.display = 'block';
    detailsCard.style.display = 'none';
    hourLabel.textContent = formatHourRange(hourIso);
    hostsEl.innerHTML = '<div class="loading">Loading hostnames...</div>';

    try {
      const rows = await fetchHosts(selectedEmail, hourIso);
      if (rows.length === 0) {
        hostsEl.innerHTML = '<p style="color:#666">No hostname data for this hour.</p>';
        return;
      }
      const sorted = [...rows].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
      const total = sorted.reduce((s, r) => s + (r.count ?? 0), 0);
      hostsEl.innerHTML = `
        <p style="margin-bottom: 0.75rem; color: #666;">Total: <strong>${total.toLocaleString()}</strong> requests</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
          <thead><tr style="text-align: left; border-bottom: 1px solid #ddd;"><th>Hostname</th><th style="text-align: right;">Count</th></tr></thead>
          <tbody>
            ${sorted.map(r => {
              const host = r.dimensions?.httpHost || '—';
              const cnt = r.count ?? 0;
              return `<tr class="user-insights-host-row" data-host="${escapeHtml(host)}" style="border-bottom: 1px solid #eee; cursor: pointer;"><td style="padding: 0.35rem 0; word-break: break-all; color: #1e40af;">${escapeHtml(host)}</td><td style="text-align: right; padding: 0.35rem 0;">${cnt.toLocaleString()}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      `;
      hostsEl.querySelectorAll('.user-insights-host-row').forEach(row => {
        row.addEventListener('click', () => showDetails(row.dataset.host));
      });
    } catch (e) {
      hostsEl.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
    }
  }

  async function showDetails(host) {
    activeDetailHost = host;
    hostLabel.textContent = host + (activeDetailHour ? ` (${formatHourRange(activeDetailHour)})` : '');
    detailsCard.style.display = 'block';
    detailsEl.innerHTML = '<div class="loading">Loading request details...</div>';
    detailsCard.scrollIntoView({ behavior: 'smooth' });

    try {
      const rows = await fetchDetails(selectedEmail, host, activeDetailHour);
      if (rows.length === 0) {
        detailsEl.innerHTML = '<p style="color:#666">No request details for this hostname.</p>';
        return;
      }
      detailsEl.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
          <thead><tr style="text-align: left; border-bottom: 1px solid #ddd;">
            <th style="padding: 0.35rem 0.5rem 0.35rem 0;">Date/Time</th>
            <th style="padding: 0.35rem 0.5rem;">URL</th>
            <th style="padding: 0.35rem 0; text-align: right;">Count</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => {
              const dt = r.dimensions?.datetime;
              const url = r.dimensions?.url || '—';
              const cnt = r.count ?? 0;
              const dtStr = dt ? new Date(dt).toLocaleString() : '—';
              return `<tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 0.35rem 0.5rem 0.35rem 0; white-space: nowrap;">${escapeHtml(dtStr)}</td>
                <td style="padding: 0.35rem 0.5rem; word-break: break-all; max-width: 400px;">${escapeHtml(url)}</td>
                <td style="padding: 0.35rem 0; text-align: right;">${cnt.toLocaleString()}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      detailsEl.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
    }
  }

  async function loadChart() {
    if (!selectedEmail) {
      chartEl.innerHTML = '<div style="padding: 2rem; color: #666;">Select a user above.</div>';
      chartLabel.textContent = '';
      hostsCard.style.display = 'none';
      detailsCard.style.display = 'none';
      return;
    }
    chartEl.innerHTML = '<div class="loading">Loading chart...</div>';
    chartLabel.textContent = '';
    hostsCard.style.display = 'none';
    detailsCard.style.display = 'none';

    try {
      chartData = await fetchChart(selectedEmail);
      renderChart();
    } catch (e) {
      chartEl.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
      chartLabel.textContent = '';
    }
  }

  emailSelect.addEventListener('change', () => {
    selectedEmail = (emailSelect.value || '').trim();
    loadChart();
  });

  loadEmails().then(() => {});
}
