/**
 * DNI List Manager - Worker API
 * Manages Zero Trust Gateway Do-Not-Inspect hostname lists.
 * Serves both the REST API and static frontend (via Workers Static Assets).
 */

import psl from 'psl';
import { verifyAccessJwt } from './auth.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    // CORS only needed for local dev (frontend on :8788, worker on :8787)
    const corsHeaders = {};
    if (isLocal) {
      const origin = request.headers.get('Origin') || '';
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        corsHeaders['Access-Control-Allow-Origin'] = origin;
        corsHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type';
        corsHeaders['Access-Control-Allow-Credentials'] = 'true';
      }
    }

    if (request.method === 'OPTIONS' && isLocal) {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // Auth gate: all /api/* routes (except /health) require a valid Access JWT.
    // Localhost bypasses auth for local dev.
    if (url.pathname.startsWith('/api/') && !isLocal) {
      const user = await verifyAccessJwt(request, env);
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      // Attach user to request for downstream handlers
      request._user = user;
    }

    try {
      switch (url.pathname) {
        case '/api/auth/validate':
          return handleAuthValidation(request, corsHeaders, isLocal);

        case '/api/menu':
          return new Response(JSON.stringify(getMenuData()), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });

        case '/api/gateway/lists':
          return handleGatewayLists(request, corsHeaders, env);

        case '/api/gateway/lists/move':
          return handleGatewayListMove(request, corsHeaders, env);

        case '/api/gateway/lists/remove':
          return handleGatewayListRemove(request, corsHeaders, env);

        case '/api/gateway/lists/add':
          return handleGatewayListAdd(request, corsHeaders, env);

        case '/api/intel/domain':
          return handleIntelDomain(request, corsHeaders, env);

        case '/api/gateway/rules':
          return handleGatewayRules(request, corsHeaders, env);

        case '/health':
          return new Response(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString()
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });

        default:
          // Unknown /api/ paths -> 404
          if (url.pathname.startsWith('/api/')) {
            return new Response(JSON.stringify({ error: 'Not Found', path: url.pathname }), {
              status: 404,
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
          }
          // SPA fallback: serve index.html for client-side routes
          if (env.ASSETS) {
            return env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), request));
          }
          // No ASSETS binding (local dev without assets) -> 404
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  },
};

/**
 * Auth validation endpoint -- returns user info.
 * In production: reads from the verified JWT (already validated by middleware).
 * Localhost: returns a test user.
 */
function handleAuthValidation(request, corsHeaders, isLocal) {
  if (isLocal) {
    return new Response(JSON.stringify({
      authenticated: true,
      user: { email: 'testing@tancow.net', name: 'Testing User', groups: ['admin', 'testers'] },
      local: true
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const user = request._user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized', authenticated: false }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  return new Response(JSON.stringify({
    authenticated: true,
    user: { email: user.email, name: user.name, groups: user.groups }
  }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

function getMenuData() {
  return {
    items: [
      {
        id: 'item1',
        label: 'DNI Lists',
        icon: '\u{1F6E1}\uFE0F',
        subItems: [
          { id: 'sub1-1', label: 'List Manager', path: '/dni/lists' }
        ]
      }
    ]
  };
}

async function handleGatewayLists(request, corsHeaders, env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({
      error: 'Missing Cloudflare API credentials',
      lists: [],
      hint: 'Worker secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are not set'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/gateway/lists`,
      { headers: { 'Authorization': 'Bearer ' + apiToken } }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gateway API error ${response.status}: ${errText}`);
    }

    const result = await response.json();
    if (!result.success && result.errors?.length) {
      throw new Error(result.errors.map(e => e.message || e).join('; '));
    }
    let allLists = result.result || [];
    if (Array.isArray(result.result) === false && result.result && typeof result.result === 'object') {
      allLists = result.result.result || result.result.lists || [result.result] || [];
    }

    const typeLower = (t) => String(t || '').toLowerCase();
    const excluded = ['ip', 'url'];
    const hostnameLists = allLists.filter(l => {
      const t = typeLower(l.type);
      if (excluded.includes(t)) return false;
      return t === 'host' || t === 'hosts' || t === 'hostname' || t === 'domain' || t.includes('host') || t.includes('domain');
    });

    const listsWithItems = await Promise.all(
      hostnameLists.map(async (list) => {
        const detailRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/gateway/lists/${list.id}`,
          { headers: { 'Authorization': 'Bearer ' + apiToken } }
        );
        if (!detailRes.ok) return { ...list, items: [] };
        const detail = await detailRes.json();
        const items = (detail.result?.items || []).map(i => ({
          id: i.id || i.value,
          value: i.value || i.hostname || '',
          comment: i.comment || i.description || ''
        }));
        return { ...list, items };
      })
    );

    const debugMsg = allLists.length === 0
      ? 'API returned no lists; check Zero Trust Gateway lists exist'
      : hostnameLists.length === 0
        ? 'No hostname-type lists found. Types seen: ' + [...new Set(allLists.map(l => l.type || '(unknown)'))].join(', ')
        : undefined;

    return new Response(JSON.stringify({ lists: listsWithItems, debug: debugMsg }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Gateway lists error:', error);
    return new Response(JSON.stringify({
      error: error.message, lists: [],
      hint: 'Ensure API token has Zero Trust or Gateway Edit permission'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function handleGatewayListMove(request, corsHeaders, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({ error: 'Missing Cloudflare API credentials' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const body = await request.json();
    const { hostname, sourceListId, targetListId, mode = 'domain' } = body;
    if (!hostname || !sourceListId || !targetListId) {
      return new Response(JSON.stringify({ error: 'hostname, sourceListId, and targetListId are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/gateway/lists`;
    const headers = { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json' };

    const srcRes = await fetch(`${base}/${sourceListId}`, { headers });
    if (!srcRes.ok) throw new Error('Failed to fetch source list');
    const srcData = await srcRes.json();
    const allItems = srcData.result?.items || [];

    let valueToAdd;
    let toRemove;

    if (mode === 'host') {
      valueToAdd = hostname;
      toRemove = allItems.filter(i => (i.value || i.hostname || '') === hostname);
    } else {
      const domain = stripFirstLabel(hostname) || getRegistrableDomain(hostname);
      if (!domain) {
        return new Response(JSON.stringify({
          error: 'Could not extract domain from hostname',
          hint: 'Hostname may be an IP, invalid, or single-label. Use Remove to delete without moving.'
        }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      valueToAdd = domain;
      const domainLower = domain.toLowerCase();
      toRemove = allItems.filter(i => {
        const v = (i.value || i.hostname || '').toLowerCase();
        return v === domainLower || v.endsWith('.' + domainLower);
      });
    }

    const removedCount = toRemove.length;

    const tgtRes = await fetch(`${base}/${targetListId}`, { headers });
    if (!tgtRes.ok) throw new Error('Failed to fetch target list');
    const tgtData = await tgtRes.json();
    const existingValues = new Set((tgtData.result?.items || []).map(i => (i.value || i.hostname || '').toLowerCase()));
    const alreadyInTarget = existingValues.has(valueToAdd.toLowerCase());

    let addErr = null;
    if (!alreadyInTarget) {
      const addRes = await fetch(`${base}/${targetListId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ append: [{ value: valueToAdd }] })
      });
      if (!addRes.ok) {
        const errText = await addRes.text();
        if (!/duplicate|already exist/i.test(errText)) addErr = parseApiError(errText);
      }
    }

    const removeValues = toRemove.map(i => i.value || i.hostname || '').filter(Boolean);
    const removeRes = removeValues.length > 0
      ? await fetch(`${base}/${sourceListId}`, { method: 'PATCH', headers, body: JSON.stringify({ remove: removeValues }) })
      : { ok: true };

    if (!removeRes.ok) throw new Error('Update failed (source list): ' + parseApiError(await removeRes.text()));
    if (addErr) throw new Error('Update failed (target list): ' + addErr);

    return new Response(JSON.stringify({
      success: true, hostname, value: valueToAdd, removedCount, mode,
      message: `Moved ${hostname} \u2192 ${valueToAdd} in target list`
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Gateway list move error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function handleGatewayListRemove(request, corsHeaders, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({ error: 'Missing Cloudflare API credentials' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const body = await request.json();
    const { listId, value } = body;
    if (!listId || value == null || value === '') {
      return new Response(JSON.stringify({ error: 'listId and value are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/gateway/lists`;
    const headers = { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json' };

    const removeRes = await fetch(`${base}/${listId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ remove: [String(value).trim()] })
    });

    if (!removeRes.ok) throw new Error('Failed to remove entry: ' + parseApiError(await removeRes.text()));

    return new Response(JSON.stringify({ success: true, removed: String(value).trim(), message: 'Entry removed from list' }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Gateway list remove error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

/**
 * Add a value to a Gateway list. Used by undo to restore entries.
 */
async function handleGatewayListAdd(request, corsHeaders, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({ error: 'Missing Cloudflare API credentials' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const body = await request.json();
    const { listId, value } = body;
    if (!listId || value == null || value === '') {
      return new Response(JSON.stringify({ error: 'listId and value are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/gateway/lists`;
    const headers = { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json' };

    const addRes = await fetch(`${base}/${listId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ append: [{ value: String(value).trim() }] })
    });

    if (!addRes.ok) {
      const errText = await addRes.text();
      if (!/duplicate|already exist/i.test(errText)) {
        throw new Error('Failed to add entry: ' + parseApiError(errText));
      }
    }

    return new Response(JSON.stringify({ success: true, added: String(value).trim(), message: 'Entry added to list' }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Gateway list add error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

function parseApiError(text) {
  try {
    const j = JSON.parse(text);
    const msg = j.errors?.[0]?.message || j.message || text;
    return typeof msg === 'string' ? msg.slice(0, 200) : String(msg).slice(0, 200);
  } catch {
    return String(text).slice(0, 200);
  }
}

function getRegistrableDomain(hostname) {
  const s = String(hostname || '').trim();
  if (!s) return null;
  try { return psl.get(s) || null; } catch { return null; }
}

function stripFirstLabel(hostname) {
  const s = String(hostname || '').trim().toLowerCase();
  if (!s) return null;
  const dot = s.indexOf('.');
  if (dot < 0) return null;
  const stripped = s.slice(dot + 1);
  if (psl.get(stripped)) return stripped;
  return null;
}

async function handleIntelDomain(request, corsHeaders, env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const url = new URL(request.url);
  const domainParam = url.searchParams.get('domain');

  if (!domainParam || !domainParam.trim()) {
    return new Response(JSON.stringify({ error: 'domain query parameter required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({
      error: 'Missing Cloudflare API credentials',
      hint: 'Worker secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are not set'
    }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  const headers = { 'Authorization': 'Bearer ' + apiToken };

  function extractCategories(d) {
    const toNames = (arr) => (arr || []).map(c => (c && (c.name || c.label || String(c)))).filter(Boolean);
    return {
      contentCats: toNames(d.content_categories || d.contentCategories),
      securityCats: toNames(d.security_categories || d.securityCategories),
      app: d.application && (typeof d.application === 'string' ? d.application : (d.application.name || d.application.label || null)),
      riskTypes: toNames(d.risk_types || d.riskTypes),
    };
  }

  function extractFromHistory(hist) {
    const cats = [];
    const items = Array.isArray(hist) ? hist : (hist?.result ? hist.result : []);
    for (const h of items) {
      for (const c of (h.categorizations || [])) {
        for (const x of (c.categories || [])) cats.push(x.name || x);
      }
    }
    return [...new Set(cats)];
  }

  async function fetchDomain(q) {
    const r = await fetch(`${base}/intel/domain?domain=${encodeURIComponent(q)}`, { headers });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.success && j.result) ? j.result : null;
  }

  async function fetchDomainHistory(q) {
    const r = await fetch(`${base}/intel/domain-history?domain=${encodeURIComponent(q)}`, { headers });
    if (!r.ok) return null;
    const j = await r.json();
    return j.success ? j : null;
  }

  try {
    const domain = domainParam.trim();
    let contentCats = [], securityCats = [], application = null, riskTypes = [];
    const apex = getRegistrableDomain(domain) || domain;
    const tryApexFirst = apex !== domain;

    async function tryDomain(q) {
      let cats = { contentCats: [], securityCats: [], app: null, riskTypes: [] };
      const d = await fetchDomain(q);
      if (d) cats = extractCategories(d);
      if (cats.contentCats.length === 0 && cats.securityCats.length === 0) {
        const hist = await fetchDomainHistory(q);
        const histCats = extractFromHistory(hist);
        if (histCats.length) cats.contentCats = histCats;
      }
      return cats;
    }

    if (tryApexFirst) {
      const apexCats = await tryDomain(apex);
      if (apexCats.contentCats.length || apexCats.securityCats.length) {
        contentCats = apexCats.contentCats; securityCats = apexCats.securityCats;
        application = apexCats.app; riskTypes = apexCats.riskTypes;
      }
    }

    if (contentCats.length === 0 && securityCats.length === 0) {
      const subCats = await tryDomain(domain);
      contentCats = subCats.contentCats; securityCats = subCats.securityCats;
      application = application || subCats.app;
      riskTypes = riskTypes.length ? riskTypes : subCats.riskTypes;
    }

    if (contentCats.length === 0 && securityCats.length === 0 && tryApexFirst) {
      const hist = await fetchDomainHistory(apex);
      const histCats = extractFromHistory(hist);
      if (histCats.length) contentCats = histCats;
    }

    return new Response(JSON.stringify({
      domain, content_categories: contentCats, security_categories: securityCats,
      application, risk_types: riskTypes
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Intel domain error:', error);
    return new Response(JSON.stringify({ error: error.message, hint: 'Ensure API token has Intel Read permission' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function handleGatewayRules(request, corsHeaders, env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({ error: 'Missing Cloudflare API credentials', rules: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/gateway/rules`,
      { headers: { 'Authorization': 'Bearer ' + apiToken } }
    );
    if (!response.ok) throw new Error(`Gateway rules API ${response.status}: ${await response.text()}`);
    const result = await response.json();
    if (!result.success && result.errors?.length) throw new Error(result.errors.map(e => e.message || e).join('; '));

    const rules = result.result || [];
    const policyMap = {};
    for (const r of rules) { if (r.id && r.name) policyMap[r.id] = r.name; }

    return new Response(JSON.stringify({ rules, policyMap }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Gateway rules error:', error);
    return new Response(JSON.stringify({ error: error.message, rules: [], policyMap: {} }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
