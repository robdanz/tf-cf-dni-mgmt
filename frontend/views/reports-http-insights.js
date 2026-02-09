/**
 * HTTP Insights - Stacked bar chart of Gateway L7 HTTP status codes (hourly, 24h).
 * Filter by status code; show hostname breakdown for selected code and time bin.
 */
const STATUS_COLORS = {
  200: '#22c55e',
  201: '#16a34a',
  204: '#15803d',
  301: '#0ea5e9',
  302: '#0284c7',
  304: '#0369a1',
  400: '#f59e0b',
  401: '#eab308',
  403: '#d97706',
  404: '#ca8a04',
  405: '#b45309',
  408: '#a16207',
  429: '#ea580c',
  500: '#ef4444',
  502: '#dc2626',
  503: '#b91c1c',
  504: '#991b1b',
};

function statusColor(code) {
  return STATUS_COLORS[code] || (code >= 500 ? '#ef4444' : code >= 400 ? '#f59e0b' : '#22c55e');
}

const STATUS_DESCRIPTIONS = {
  200: 'OK', 201: 'Created', 204: 'No Content',
  301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 408: 'Request Timeout', 429: 'Too Many Requests',
  500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout'
};
function statusDescription(code) {
  return STATUS_DESCRIPTIONS[code] ? `${code} ${STATUS_DESCRIPTIONS[code]}` : String(code);
}

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

export default async function render({ api }) {
  const apiFn = api();
  const html = `
    <div class="card">
      <h2 class="card-title">HTTP status codes (last 24 hours, hourly)</h2>
      <p style="margin-bottom: 1rem; color: #666;">Gateway L7 request counts by status code. Click a bar segment to see hostname breakdown for that hour; click a hostname for request details.</p>
      <div id="httpInsightsChart" style="min-height: 280px; position: relative; padding-top: 1.5rem;"></div>
      <div id="httpInsightsLegend" style="margin-top: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.5rem;"></div>
    </div>
    <div class="card" id="httpInsightsDetails" style="display: none;">
      <h2 class="card-title">Hostname breakdown for status <span id="detailsStatusCode">—</span></h2>
      <p style="margin-bottom: 0.75rem; color: #666; font-size: 0.9rem;">Click a hostname to see request details (date/time, URL, action, user).</p>
      <div id="httpInsightsHosts" style="max-height: 320px; overflow: auto;"></div>
    </div>
    <div class="card" id="httpInsightsRequestDetails" style="display: none;">
      <h2 class="card-title">Request details for <span id="detailsHostname">—</span></h2>
      <p style="margin-bottom: 0.75rem; color: #666; font-size: 0.85rem;">Note: HTTP method and policy name are available in Logpush (gateway_http dataset); the Analytics API provides the fields below.</p>
      <div id="httpInsightsRequestRows" style="max-height: 360px; overflow: auto;"></div>
    </div>
  `;

  setTimeout(() => initHttpInsights(apiFn), 0);
  return html;
}

function initHttpInsights(apiFn) {
  const chartEl = document.getElementById('httpInsightsChart');
  const legendEl = document.getElementById('httpInsightsLegend');
  const detailsEl = document.getElementById('httpInsightsDetails');
  const hostsEl = document.getElementById('httpInsightsHosts');
  const detailsCodeEl = document.getElementById('detailsStatusCode');
  const requestDetailsEl = document.getElementById('httpInsightsRequestDetails');
  const requestRowsEl = document.getElementById('httpInsightsRequestRows');
  const detailsHostnameEl = document.getElementById('detailsHostname');

  let chartData = [];
  let activeDetailCode = null;
  let activeDetailHost = null;
  let activeDetailHour = null;

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

  async function fetchChart() {
    const { datetime_geq, datetime_leq } = buildTimeRange();
    const params = new URLSearchParams({ type: 'chart', datetime_geq, datetime_leq });
    const res = await apiFn('/api/http-insights?' + params.toString());
    if (res.error) throw new Error(res.error + (res.hint ? ' ' + res.hint : ''));
    return res.data || [];
  }

  async function fetchHosts(statusCode, hourIso) {
    const { datetime_geq, datetime_leq } = buildHourRange(hourIso);
    const params = new URLSearchParams({
      type: 'hosts',
      statusCode: String(statusCode),
      datetime_geq,
      datetime_leq
    });
    const res = await apiFn('/api/http-insights?' + params.toString());
    if (res.error) throw new Error(res.error);
    return res.data || [];
  }

  async function fetchRequestDetails(statusCode, httpHost, hourIso) {
    const { datetime_geq, datetime_leq } = buildHourRange(hourIso);
    const params = new URLSearchParams({
      type: 'details',
      statusCode: String(statusCode),
      httpHost: httpHost,
      datetime_geq,
      datetime_leq
    });
    const res = await apiFn('/api/http-insights?' + params.toString());
    if (res.error) throw new Error(res.error);
    return res.data || [];
  }

  function aggregateByHour(data) {
    const byHour = new Map();
    for (const row of data) {
      const hour = row.dimensions?.datetimeHour;
      const code = row.dimensions?.httpStatusCode;
      const count = row.count ?? 0;
      if (hour == null || code == null) continue;
      const key = typeof hour === 'string' ? hour : new Date(hour).toISOString();
      if (!byHour.has(key)) byHour.set(key, new Map());
      const codeMap = byHour.get(key);
      codeMap.set(code, (codeMap.get(code) || 0) + count);
    }
    const sorted = [...byHour.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return sorted.map(([hour, codeMap]) => ({
      hour,
      codes: Object.fromEntries([...codeMap.entries()].sort((a, b) => a[0] - b[0]))
    }));
  }

  function getAllCodes(data) {
    const codes = new Set();
    for (const row of data) {
      const code = row.dimensions?.httpStatusCode;
      if (code != null) codes.add(code);
    }
    return [...codes].sort((a, b) => a - b);
  }

  function renderLegend(codes) {
    legendEl.innerHTML = codes.map(code => `
      <span class="http-insights-legend-item" data-code="${code}" style="display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.2rem 0.5rem; background: rgba(0,0,0,0.05); border-radius: 4px; cursor: pointer; font-size: 0.85rem;">
        <span style="width: 8px; height: 8px; border-radius: 2px; background: ${statusColor(code)};"></span>
        <span>${code}</span>
      </span>
    `).join('');
    legendEl.querySelectorAll('.http-insights-legend-item').forEach(el => {
      el.addEventListener('click', () => showHostDetails(parseInt(el.dataset.code, 10), null));
    });
  }

  function renderChart() {
    const hourly = aggregateByHour(chartData);
    if (hourly.length === 0) {
      chartEl.innerHTML = '<div class="loading">No data for the selected time range.</div>';
      return;
    }

    const codes = getAllCodes(chartData);
    const filtered = codes;

    let maxTotal = 0;
    for (const { codes: codeMap } of hourly) {
      let t = 0;
      for (const c of filtered) t += codeMap[c] || 0;
      if (t > maxTotal) maxTotal = t;
    }
    const chartHeight = 200;
    const scale = maxTotal > 0 ? chartHeight / maxTotal : 0;
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
        ${hourly.map(({ hour, codes: codeMap }) => {
          const rangeStr = formatHourRange(hour);
          const segments = filtered.map(code => {
            const cnt = codeMap[code] || 0;
            const h = Math.max(0, cnt * scale);
            return { code, count: cnt, height: h };
          }).filter(s => s.count > 0);
          return `
            <div class="http-insights-bar" data-hour="${hour}" style="flex: 1; min-width: 4px; max-width: 24px; display: flex; flex-direction: column-reverse; align-items: center; gap: 0;" title="${escapeHtml(rangeStr)}">
              ${segments.map(s => `
                <div class="http-insights-segment" data-code="${s.code}" data-count="${s.count}"
                  style="width: 100%; height: ${s.height}px; min-height: ${s.height > 0 ? 2 : 0}px; background: ${statusColor(s.code)}; border-radius: 1px; cursor: pointer;"
                  title="${escapeHtml(rangeStr)} • ${s.code}: ${s.count.toLocaleString()}"></div>
              `).join('')}
            </div>
          `;
        }).join('')}
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem; color: #666; padding-left: 0;">
        <span>${formatHour(hourly[0]?.hour)}</span>
        <span>${formatHour(hourly[hourly.length - 1]?.hour)}</span>
      </div>
        </div>
      </div>
    `;

    chartEl.querySelectorAll('.http-insights-segment').forEach(el => {
      el.addEventListener('click', () => {
        const bar = el.closest('.http-insights-bar');
        const hour = bar ? bar.dataset.hour : null;
        showHostDetails(parseInt(el.dataset.code, 10), hour);
      });
    });

    renderLegend(codes);
  }

  async function showHostDetails(code, hourIso) {
    activeDetailCode = code;
    activeDetailHour = hourIso;
    detailsCodeEl.textContent = statusDescription(code) + (hourIso ? ` (${formatHourRange(hourIso)})` : '');
    detailsEl.style.display = 'block';
    requestDetailsEl.style.display = 'none';
    hostsEl.innerHTML = '<div class="loading">Loading hostname breakdown...</div>';

    try {
      const rows = await fetchHosts(code, hourIso);
      if (rows.length === 0) {
        hostsEl.innerHTML = '<p style="color:#666">No hostname data for this status code.</p>';
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
              return `<tr class="http-insights-host-row" data-host="${escapeHtml(host)}" style="border-bottom: 1px solid #eee; cursor: pointer;"><td style="padding: 0.35rem 0; word-break: break-all; color: #1e40af;">${escapeHtml(host)}</td><td style="text-align: right; padding: 0.35rem 0;">${cnt.toLocaleString()}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      `;
      hostsEl.querySelectorAll('.http-insights-host-row').forEach(row => {
        row.addEventListener('click', () => showRequestDetails(code, row.dataset.host, activeDetailHour));
      });
    } catch (e) {
      hostsEl.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
    }
  }

  async function showRequestDetails(code, host, hourIso) {
    activeDetailHost = host;
    detailsHostnameEl.textContent = host + (hourIso ? ` (${formatHourRange(hourIso)})` : '');
    requestDetailsEl.style.display = 'block';
    requestRowsEl.innerHTML = '<div class="loading">Loading request details...</div>';
    requestDetailsEl.scrollIntoView({ behavior: 'smooth' });

    try {
      const rows = await fetchRequestDetails(code, host, hourIso);
      if (rows.length === 0) {
        requestRowsEl.innerHTML = '<p style="color:#666">No request details for this hostname.</p>';
        return;
      }
      requestRowsEl.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
          <thead><tr style="text-align: left; border-bottom: 1px solid #ddd;">
            <th style="padding: 0.35rem 0.5rem 0.35rem 0;">Date/Time</th>
            <th style="padding: 0.35rem 0.5rem;">URL</th>
            <th style="padding: 0.35rem 0.5rem;">Action</th>
            <th style="padding: 0.35rem 0.5rem;">User Email</th>
            <th style="padding: 0.35rem 0; text-align: right;">Count</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => {
              const dt = r.dimensions?.datetime;
              const url = r.dimensions?.url || '—';
              const action = r.dimensions?.action || '—';
              const email = r.dimensions?.email || '—';
              const cnt = r.count ?? 0;
              const dtStr = dt ? new Date(dt).toLocaleString() : '—';
              return `<tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 0.35rem 0.5rem 0.35rem 0; white-space: nowrap;">${escapeHtml(dtStr)}</td>
                <td style="padding: 0.35rem 0.5rem; word-break: break-all; max-width: 300px;">${escapeHtml(url)}</td>
                <td style="padding: 0.35rem 0.5rem;">${escapeHtml(action)}</td>
                <td style="padding: 0.35rem 0.5rem;">${escapeHtml(email)}</td>
                <td style="padding: 0.35rem 0; text-align: right;">${cnt.toLocaleString()}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      requestRowsEl.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function load() {
    chartEl.innerHTML = '<div class="loading">Loading HTTP insights...</div>';
    try {
      chartData = await fetchChart();
      const codes = getAllCodes(chartData);
      renderChart();
      if (codes.length === 0) {
        chartEl.innerHTML = '<div style="padding: 2rem; color: #666;">No Gateway L7 data for the last 24 hours. Ensure Gateway proxy is configured and Analytics is enabled.</div>';
      }
    } catch (e) {
      chartEl.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
    }
  }

  load();
}
