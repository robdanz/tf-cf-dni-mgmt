/**
 * CF1 Cockpit - Modern Web App UI
 * Main worker entry point with authentication and routing
 */

import psl from 'psl';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = ['https://cf-analyst.tancow.net', 'https://cf-analyst.pages.dev', 'http://localhost:8788', 'http://127.0.0.1:8788'];
    const isAllowed = allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
    const corsHeaders = {
      'Access-Control-Allow-Origin': isAllowed ? origin : '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, CF-Authorization',
      ...(isAllowed && { 'Access-Control-Allow-Credentials': 'true' }),
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
      // Route handling
      switch (url.pathname) {
        case '/api/auth/validate':
          return handleAuthValidation(request, corsHeaders);

        case '/api/menu':
          return new Response(JSON.stringify(getMenuData()), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });

        case '/api/traffic':
          return new Response(JSON.stringify({ summary: {}, timeline: [], applications: [], countries: [], actions: [], users: [], warning: 'Add traffic API implementation' }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });

        case '/api/network':
          return new Response(JSON.stringify({ totalSessions: 0, avgRtt: 0, totalBytes: 0, warning: 'Add network API implementation' }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });

        case '/api/gateway/lists':
          return handleGatewayLists(request, corsHeaders, env);

        case '/api/gateway/lists/move':
          return handleGatewayListMove(request, corsHeaders, env);

        case '/api/gateway/lists/remove':
          return handleGatewayListRemove(request, corsHeaders, env);

        case '/api/intel/domain':
          return handleIntelDomain(request, corsHeaders, env);

        case '/api/http-insights':
          return handleHttpInsights(request, corsHeaders, env);

        case '/api/user-insights':
          return handleUserInsights(request, corsHeaders, env);

        case '/api/network-insights':
          return handleNetworkInsights(request, corsHeaders, env);

        case '/api/dns-insights':
          return handleDnsInsights(request, corsHeaders, env);

        case '/api/gateway/rules':
          return handleGatewayRules(request, corsHeaders, env);

        case '/health':
          return new Response(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString()
          }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });

        default:
          if (url.pathname.startsWith('/api/')) {
            return new Response(JSON.stringify({ error: 'Not Found', path: url.pathname }), {
              status: 404,
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
          }
          if (url.hostname === 'cf-analyst.tancow.net') {
            return proxyToPages(request, url, corsHeaders);
          }
          return new Response(JSON.stringify({ error: 'Not Found', path: url.pathname }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
      }
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  },
};

const PAGES_ORIGIN = 'https://cf-analyst.pages.dev';

async function proxyToPages(request, url, corsHeaders) {
  const targetUrl = PAGES_ORIGIN + url.pathname + url.search;
  const headers = new Headers(request.headers);
  headers.set('Host', new URL(PAGES_ORIGIN).host);
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  });
  const response = await fetch(proxyRequest);
  const outHeaders = new Headers(response.headers);
  outHeaders.delete('content-encoding');
  if (!outHeaders.has('Cache-Control')) outHeaders.set('Cache-Control', 'public, max-age=60');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  });
}

/**
 * Validate Cloudflare Access token and extract user email
 * Reads from CF_Authorization cookie set by Cloudflare Access
 * For localhost, returns a test user without token validation
 */
async function handleAuthValidation(request, corsHeaders) {
  try {
    const url = new URL(request.url);
    
    // If running locally (localhost), return test user without token validation
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return new Response(JSON.stringify({
        authenticated: true,
        user: {
          email: 'testing@tancow.net',
          name: 'Testing User',
          groups: ['admin', 'testers']
        },
        local: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    
    // 1. Cf-Access-Jwt-Assertion: injected by Cloudflare when Access protects the Worker
    // 2. CF_Authorization cookie: set by Access when user visits protected app
    // 3. CF-Authorization header: manual Bearer token (e.g. from frontend passing cookie value)
    let token = request.headers.get('Cf-Access-Jwt-Assertion') || request.headers.get('cf-access-jwt-assertion');
    
    if (!token) {
      const cookieHeader = request.headers.get('Cookie') || '';
      const cookies = cookieHeader.split(';').map(c => c.trim());
      for (const cookie of cookies) {
        if (cookie.startsWith('CF_Authorization=')) {
          token = cookie.substring('CF_Authorization='.length);
          break;
        }
      }
    }
    
    if (!token) {
      const authHeader = request.headers.get('CF-Authorization');
      if (authHeader) token = authHeader.replace(/^Bearer\s+/i, '').trim();
    }
    
    if (!token) {
      return new Response(JSON.stringify({
        error: 'No authorization token found',
        authenticated: false
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Decode and validate the token
    const userInfo = await validateCloudflareToken(token);
    
    if (!userInfo || !userInfo.email) {
      return new Response(JSON.stringify({
        error: 'Invalid token',
        authenticated: false
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    return new Response(JSON.stringify({
      authenticated: true,
      user: {
        email: userInfo.email,
        name: userInfo.name || userInfo.email.split('@')[0],
        groups: userInfo.groups || []
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Authentication failed',
      message: error.message,
      authenticated: false
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

/**
 * Decode and validate Cloudflare Access JWT token
 * Extracts user email from the JWT payload
 */
async function validateCloudflareToken(token) {
  try {
    // Cloudflare Access tokens are JWTs with 3 parts: header.payload.signature
    const parts = token.split('.');
    
    if (parts.length !== 3) {
      console.error('Invalid JWT format');
      return null;
    }

    // Decode the payload (base64url encoded)
    // Note: In production, you should also verify the signature!
    const payload = parts[1];
    
    // Add padding if needed for base64 decoding
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    
    // Decode the payload
    const decodedPayload = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(decodedPayload);
    
    // Extract user information from JWT claims
    const email = claims.email || claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] || claims.sub;
    
    if (!email) {
      console.error('No email found in token claims');
      return null;
    }

    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) {
      console.error('Token has expired');
      return null;
    }

    return {
      email: email,
      name: claims.name || claims.common_name || claims.preferred_username || claims.given_name || email.split('@')[0],
      groups: claims.groups || claims['custom:groups'] || [],
      claims: claims
    };

  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
}

/**
 * Get menu data structure
 */
function getMenuData() {
  return {
    items: [
      {
        id: 'item1',
        label: 'Analytics Dashboard',
        icon: '📊',
        subItems: [
          { id: 'sub1-1', label: 'Traffic Overview', path: '/analytics/traffic' },
          { id: 'sub1-2', label: 'Performance Metrics', path: '/analytics/performance' }
        ]
      },
      {
        id: 'item3',
        label: 'Reports & Insights',
        icon: '📈',
        subItems: [
          { id: 'sub3-1', label: 'HTTP Insights', path: '/reports/http-insights' },
          { id: 'sub3-2', label: 'DNS Insights', path: '/reports/dns-insights' },
          { id: 'sub3-3', label: 'User Insights', path: '/reports/user-insights' }
        ]
      },
      {
        id: 'item4',
        label: 'Admin Tools',
        icon: '⚙️',
        subItems: [
          { id: 'sub4-1', label: 'TLS Auto Pilot List Manager', path: '/reports/tls-autopilot' }
        ]
      }
    ]
  };
}

/**
 * Fetch hostname-based Zero Trust Gateway lists from Cloudflare API
 */
async function handleGatewayLists(request, corsHeaders, env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({
      error: 'Missing Cloudflare API credentials',
      lists: []
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

    // Include hostname/domain lists (used for hostnames), exclude IP and URL
    const typeLower = (t) => String(t || '').toLowerCase();
    const excluded = ['ip', 'url'];
    const hostnameLists = allLists.filter(l => {
      const t = typeLower(l.type);
      if (excluded.includes(t)) return false;
      return t === 'host' || t === 'hosts' || t === 'hostname' || t === 'domain' || t.includes('host') || t.includes('domain');
    });
    const listsToFetch = hostnameLists;

    // Fetch items for each list
    const listsWithItems = await Promise.all(
      listsToFetch.map(async (list) => {
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

    return new Response(JSON.stringify({
      lists: listsWithItems,
      debug: debugMsg
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Gateway lists error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      lists: [],
      hint: 'Ensure API token has Zero Trust or Gateway Edit permission'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

/**
 * Move hostname from TLS Hosts Bypass to Bypass or Block domain list.
 * Strips the first label: client.wns.windows.com → wns.windows.com
 * PSL-safe: will not truncate below registrable domain (e.g. foo.co.uk stays).
 */
async function handleGatewayListMove(request, corsHeaders, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({ error: 'Missing Cloudflare API credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const body = await request.json();
    const { hostname, sourceListId, targetListId, mode = 'domain' } = body;
    if (!hostname || !sourceListId || !targetListId) {
      return new Response(JSON.stringify({
        error: 'hostname, sourceListId, and targetListId are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/gateway/lists`;
    const headers = {
      'Authorization': 'Bearer ' + apiToken,
      'Content-Type': 'application/json'
    };

    // Get source list items
    const srcRes = await fetch(`${base}/${sourceListId}`, { headers });
    if (!srcRes.ok) throw new Error('Failed to fetch source list');
    const srcData = await srcRes.json();
    const allItems = srcData.result?.items || [];

    let valueToAdd;
    let toRemove;

    if (mode === 'host') {
      // Host mode: add exact hostname, remove only exact match from source
      valueToAdd = hostname;
      toRemove = allItems.filter(i => (i.value || i.hostname || '') === hostname);
    } else {
      // Domain mode: strip first label, remove all matching-domain entries from source
      const domain = stripFirstLabel(hostname) || getRegistrableDomain(hostname);
      if (!domain) {
        return new Response(JSON.stringify({
          error: 'Could not extract domain from hostname',
          hint: 'Hostname may be an IP, invalid, or single-label. Use Remove to delete without moving.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      valueToAdd = domain;
      const domainLower = domain.toLowerCase();
      toRemove = allItems.filter(i => {
        const v = (i.value || i.hostname || '').toLowerCase();
        const itemDomain = getRegistrableDomain(v);
        return itemDomain && itemDomain.toLowerCase() === domainLower;
      });
    }

    const removedCount = toRemove.length;

    // Get target list and add value (avoid duplicates)
    const tgtRes = await fetch(`${base}/${targetListId}`, { headers });
    if (!tgtRes.ok) throw new Error('Failed to fetch target list');
    const tgtData = await tgtRes.json();
    const tgtList = tgtData.result;
    const existingValues = new Set((tgtList?.items || []).map(i => (i.value || i.hostname || '').toLowerCase()));
    const alreadyInTarget = existingValues.has(valueToAdd.toLowerCase());

    // Use PATCH remove/append (Gateway API expects remove as array of value strings)
    const removeValues = toRemove.map(i => i.value || i.hostname || '').filter(Boolean);
    const removeRes = removeValues.length > 0
      ? await fetch(`${base}/${sourceListId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ remove: removeValues })
        })
      : { ok: true };
    const addRes = !alreadyInTarget
      ? await fetch(`${base}/${targetListId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ append: [{ value: valueToAdd }] })
        })
      : { ok: true };

    if (!removeRes.ok || !addRes.ok) {
      const remErr = await removeRes.text();
      const addErr = await addRes.text();
      let errMsg = 'Update failed';
      if (!removeRes.ok) errMsg += ' (source list): ' + parseApiError(remErr);
      if (!addRes.ok) errMsg += (errMsg !== 'Update failed' ? '; ' : ' ') + '(target list): ' + parseApiError(addErr);
      throw new Error(errMsg);
    }

    return new Response(JSON.stringify({
      success: true,
      hostname,
      value: valueToAdd,
      removedCount,
      mode,
      message: `Moved ${hostname} → ${valueToAdd} in target list`
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Gateway list move error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

/**
 * Remove a single entry from a Gateway list by exact value.
 * No domain extraction; removes only the matching list item.
 */
async function handleGatewayListRemove(request, corsHeaders, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({ error: 'Missing Cloudflare API credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const body = await request.json();
    const { listId, value } = body;
    if (!listId || value == null || value === '') {
      return new Response(JSON.stringify({
        error: 'listId and value are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/gateway/lists`;
    const headers = {
      'Authorization': 'Bearer ' + apiToken,
      'Content-Type': 'application/json'
    };

    const removeRes = await fetch(`${base}/${listId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ remove: [String(value).trim()] })
    });

    if (!removeRes.ok) {
      const errText = await removeRes.text();
      throw new Error('Failed to remove entry: ' + parseApiError(errText));
    }

    return new Response(JSON.stringify({
      success: true,
      removed: String(value).trim(),
      message: 'Entry removed from list'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Gateway list remove error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
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

/**
 * Extract registrable domain (eTLD+1) using Public Suffix List.
 * www.example.com → example.com, example.co.uk → example.co.uk (not co.uk)
 * Returns null for IPs, invalid hostnames, or when extraction fails.
 */
function getRegistrableDomain(hostname) {
  const s = String(hostname || '').trim();
  if (!s) return null;
  try {
    const result = psl.get(s);
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Strip the leading host label from a hostname.
 * client.wns.windows.com → wns.windows.com
 * Falls back to null if stripping would leave only a public suffix
 * (e.g. foo.co.uk cannot be stripped to co.uk).
 */
function stripFirstLabel(hostname) {
  const s = String(hostname || '').trim().toLowerCase();
  if (!s) return null;
  const dot = s.indexOf('.');
  if (dot < 0) return null;
  const stripped = s.slice(dot + 1);
  if (psl.get(stripped)) return stripped;
  return null;
}

/**
 * Fetch Cloudflare Intel/Radar domain categorization.
 * FQDN → drop host (first label) → query subdomain. If empty, fallback to apex.
 * Uses Intel domain + domain-history APIs. Requires Intel Read permission.
 */
async function handleIntelDomain(request, corsHeaders, env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const url = new URL(request.url);
  const domainParam = url.searchParams.get('domain');

  if (!domainParam || !domainParam.trim()) {
    return new Response(JSON.stringify({ error: 'domain query parameter required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({
      error: 'Missing Cloudflare API credentials',
      hint: 'Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to .dev.vars / secrets'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  const headers = { 'Authorization': 'Bearer ' + apiToken };

  function extractCategories(d) {
    const toNames = (arr) => (arr || []).map(c => (c && (c.name || c.label || String(c)))).filter(Boolean);
    const contentCats = toNames(d.content_categories || d.contentCategories);
    const securityCats = toNames(d.security_categories || d.securityCategories);
    const app = d.application && (d.application.name || d.application.label || d.application);
    const riskTypes = toNames(d.risk_types || d.riskTypes);
    return { contentCats, securityCats, app, riskTypes };
  }

  function extractFromHistory(hist) {
    const cats = [];
    const items = Array.isArray(hist) ? hist : (hist?.result ? hist.result : []);
    for (const h of items) {
      const catz = h.categorizations || [];
      for (const c of catz) {
        const arr = c.categories || [];
        for (const x of arr) cats.push(x.name || x);
      }
    }
    return [...new Set(cats)];
  }

  async function fetchDomain(q) {
    const r = await fetch(`${base}/intel/domain?domain=${encodeURIComponent(q)}`, { headers });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.success || !j.result) return null;
    return j.result;
  }

  async function fetchDomainHistory(q) {
    const r = await fetch(`${base}/intel/domain-history?domain=${encodeURIComponent(q)}`, { headers });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.success) return null;
    return j;
  }

  try {
    const domain = domainParam.trim();
    let contentCats = [];
    let securityCats = [];
    let application = null;
    let riskTypes = [];

    // Radar categorizes at apex; subdomains inherit (e.g. gx.nvidia.com inherits from nvidia.com)
    // Try apex first for multi-label domains
    const apex = getRegistrableDomain(domain) || domain;
    const tryApexFirst = apex !== domain;

    async function tryDomain(q) {
      let cats = { contentCats: [], securityCats: [], app: null, riskTypes: [] };
      const d = await fetchDomain(q);
      if (d) {
        const ex = extractCategories(d);
        cats = { contentCats: ex.contentCats, securityCats: ex.securityCats, app: ex.app, riskTypes: ex.riskTypes };
      }
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
        contentCats = apexCats.contentCats;
        securityCats = apexCats.securityCats;
        application = apexCats.app;
        riskTypes = apexCats.riskTypes;
      }
    }

    if (contentCats.length === 0 && securityCats.length === 0) {
      const subCats = await tryDomain(domain);
      contentCats = subCats.contentCats;
      securityCats = subCats.securityCats;
      application = application || subCats.app;
      riskTypes = riskTypes.length ? riskTypes : subCats.riskTypes;
    }

    if (contentCats.length === 0 && securityCats.length === 0 && tryApexFirst) {
      // Last resort: apex domain-history
      const hist = await fetchDomainHistory(apex);
      const histCats = extractFromHistory(hist);
      if (histCats.length) contentCats = histCats;
    }

    return new Response(JSON.stringify({
      domain,
      content_categories: contentCats,
      security_categories: securityCats,
      application,
      risk_types: riskTypes
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Intel domain error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      hint: 'Ensure API token has Intel Read permission'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

/**
 * HTTP Insights - Gateway L7 GraphQL proxy.
 * GET /api/http-insights?type=chart&datetime_geq=...&datetime_leq=...&statusCodes=200,401,500
 * GET /api/http-insights?type=hosts&statusCode=403&datetime_geq=...&datetime_leq=...
 */
async function handleHttpInsights(request, corsHeaders, env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({
      error: 'Missing Cloudflare API credentials',
      hint: 'Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'chart';
  const datetimeGeq = url.searchParams.get('datetime_geq');
  const datetimeLeq = url.searchParams.get('datetime_leq');
  const statusCodesParam = url.searchParams.get('statusCodes');
  const statusCodeParam = url.searchParams.get('statusCode');
  const httpHostParam = url.searchParams.get('httpHost');

  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  start.setHours(start.getHours() - 24);
  const defaultGeq = start.toISOString();
  const defaultLeq = end.toISOString();
  const geq = datetimeGeq || defaultGeq;
  const leq = datetimeLeq || defaultLeq;

  const filter = {
    datetime_geq: geq,
    datetime_leq: leq,
    httpStatusCode_neq: 0
  };

  if (type === 'hosts' && statusCodeParam) {
    const sc = parseInt(statusCodeParam, 10);
    if (!isNaN(sc)) filter.httpStatusCode_in = [sc];
  } else if (statusCodesParam) {
    const arr = statusCodesParam.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    if (arr.length) filter.httpStatusCode_in = arr;
  }

  if (type === 'details' && httpHostParam && statusCodeParam) {
    filter.httpHost = httpHostParam.trim();
    const sc = parseInt(statusCodeParam, 10);
    if (!isNaN(sc)) filter.httpStatusCode_in = [sc];
  }

  let query;
  if (type === 'details') {
    query = `query HttpInsightsDetails($accountTag: string!, $filter: AccountGatewayL7RequestsAdaptiveGroupsFilter_InputObject) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            gatewayL7RequestsAdaptiveGroups(limit: 500, filter: $filter, orderBy: [datetime_DESC]) {
              count
              dimensions { datetime url action email }
            }
          }
        }
      }`;
  } else if (type === 'hosts') {
    query = `query HttpInsightsHosts($accountTag: string!, $filter: AccountGatewayL7RequestsAdaptiveGroupsFilter_InputObject) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            gatewayL7RequestsAdaptiveGroups(limit: 1000, filter: $filter, orderBy: [count_DESC]) {
              count
              dimensions { httpHost }
            }
          }
        }
      }`;
  } else {
    query = `query HttpInsightsChart($accountTag: string!, $filter: AccountGatewayL7RequestsAdaptiveGroupsFilter_InputObject) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            gatewayL7RequestsAdaptiveGroups(limit: 2000, filter: $filter, orderBy: [datetimeHour_ASC]) {
              count
              dimensions { datetimeHour httpStatusCode }
            }
          }
        }
      }`;
  }

  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        variables: { accountTag: accountId, filter }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GraphQL ${response.status}: ${text}`);
    }

    const json = await response.json();
    if (json.errors?.length) {
      throw new Error(json.errors.map(e => e.message || JSON.stringify(e)).join('; '));
    }

    const accounts = json?.data?.viewer?.accounts || [];
    const groups = accounts[0]?.gatewayL7RequestsAdaptiveGroups || [];

    return new Response(JSON.stringify({
      data: groups,
      filter: { datetime_geq: geq, datetime_leq: leq }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('HTTP Insights error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      hint: 'Ensure API token has Analytics Read (Gateway) permission'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

/**
 * User Insights - L7 Gateway traffic by user (email).
 * GET /api/user-insights?type=emails&datetime_geq=...&datetime_leq=...
 * GET /api/user-insights?type=chart&email=...&datetime_geq=...&datetime_leq=...
 * GET /api/user-insights?type=hosts&email=...&datetime_geq=...&datetime_leq=...
 * GET /api/user-insights?type=details&email=...&httpHost=...&datetime_geq=...&datetime_leq=...
 */
async function handleUserInsights(request, corsHeaders, env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({
      error: 'Missing Cloudflare API credentials',
      hint: 'Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'emails';
  const emailParam = url.searchParams.get('email');
  const datetimeGeq = url.searchParams.get('datetime_geq');
  const datetimeLeq = url.searchParams.get('datetime_leq');
  const httpHostParam = url.searchParams.get('httpHost');

  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  start.setHours(start.getHours() - 24);
  const defaultGeq = start.toISOString();
  const defaultLeq = end.toISOString();
  const geq = datetimeGeq || defaultGeq;
  const leq = datetimeLeq || defaultLeq;

  const filter = {
    datetime_geq: geq,
    datetime_leq: leq,
    httpStatusCode_neq: 0
  };

  if (emailParam && emailParam.trim()) {
    filter.email = emailParam.trim();
  }

  if (type === 'details' && httpHostParam) {
    filter.httpHost = httpHostParam.trim();
  }

  let query;
  if (type === 'emails') {
    query = `query UserInsightsEmails($accountTag: string!, $filter: AccountGatewayL7RequestsAdaptiveGroupsFilter_InputObject) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            gatewayL7RequestsAdaptiveGroups(limit: 500, filter: $filter, orderBy: [count_DESC]) {
              count
              dimensions { email }
            }
          }
        }
      }`;
  } else if (type === 'chart') {
    query = `query UserInsightsChart($accountTag: string!, $filter: AccountGatewayL7RequestsAdaptiveGroupsFilter_InputObject) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            gatewayL7RequestsAdaptiveGroups(limit: 500, filter: $filter, orderBy: [datetimeHour_ASC]) {
              count
              dimensions { datetimeHour }
            }
          }
        }
      }`;
  } else if (type === 'hosts') {
    query = `query UserInsightsHosts($accountTag: string!, $filter: AccountGatewayL7RequestsAdaptiveGroupsFilter_InputObject) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            gatewayL7RequestsAdaptiveGroups(limit: 1000, filter: $filter, orderBy: [count_DESC]) {
              count
              dimensions { httpHost }
            }
          }
        }
      }`;
  } else if (type === 'details') {
    query = `query UserInsightsDetails($accountTag: string!, $filter: AccountGatewayL7RequestsAdaptiveGroupsFilter_InputObject) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            gatewayL7RequestsAdaptiveGroups(limit: 500, filter: $filter, orderBy: [datetime_DESC]) {
              count
              dimensions { datetime url }
            }
          }
        }
      }`;
  } else {
    return new Response(JSON.stringify({ error: 'Invalid type', hint: 'Use type=emails|chart|hosts|details' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  if ((type === 'chart' || type === 'hosts' || type === 'details') && !filter.email) {
    return new Response(JSON.stringify({ error: 'email is required for type=chart, hosts, details' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        variables: { accountTag: accountId, filter }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GraphQL ${response.status}: ${text}`);
    }

    const json = await response.json();
    if (json.errors?.length) {
      throw new Error(json.errors.map(e => e.message || JSON.stringify(e)).join('; '));
    }

    const accounts = json?.data?.viewer?.accounts || [];
    const groups = accounts[0]?.gatewayL7RequestsAdaptiveGroups || [];

    return new Response(JSON.stringify({
      data: groups,
      filter: { datetime_geq: geq, datetime_leq: leq, email: filter.email || null }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('User Insights error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      hint: 'Ensure API token has Analytics Read (Gateway) permission'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

/**
 * Network Insights - L4 Gateway session volume (last 24h).
 * type=chart → volume (bytes) by hour
 * type=origins → volume by origin IP (optionally for one hour)
 * type=ports → for a given origin IP, volume by origin port
 */
async function handleNetworkInsights(request, corsHeaders, env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({
      error: 'Missing Cloudflare API credentials',
      hint: 'Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'chart';
  const datetimeGeq = url.searchParams.get('datetime_geq');
  const datetimeLeq = url.searchParams.get('datetime_leq');
  const originIpParam = url.searchParams.get('originIp');
  // Note: gatewayL4DownstreamSessionsAdaptiveGroups filter does not support email; L4 data is account-scoped.

  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  start.setHours(start.getHours() - 24);
  const defaultGeq = start.toISOString();
  const defaultLeq = end.toISOString();
  const geq = datetimeGeq || defaultGeq;
  const leq = datetimeLeq || defaultLeq;

  const filterWithRange = { datetime_geq: geq, datetime_leq: leq };
  if (originIpParam && originIpParam.trim()) {
    filterWithRange.ipSourceAddress = originIpParam.trim();
  }
  // L4 chart: try range filter first; if empty, retry with single bound (datetime_gt) in case API ignores _leq.
  let filter = filterWithRange;

  // L4 adaptive groups: dimensions datetimeHour, ipSourceAddress, sourcePort. Fallback to count for volume.
  let query;
  if (type === 'chart') {
    query = `query NetworkInsightsChart($accountTag: string!, $filter: AccountGatewayL4DownstreamSessionsAdaptiveGroupsFilter_InputObject) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            gatewayL4DownstreamSessionsAdaptiveGroups(limit: 500, filter: $filter, orderBy: [datetimeHour_ASC]) {
              count
              dimensions { datetimeHour }
            }
          }
        }
      }`;
  } else if (type === 'origins') {
    query = `query NetworkInsightsOrigins($accountTag: string!, $filter: AccountGatewayL4DownstreamSessionsAdaptiveGroupsFilter_InputObject) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            gatewayL4DownstreamSessionsAdaptiveGroups(limit: 500, filter: $filter, orderBy: [count_DESC]) {
              count
              dimensions { ipSourceAddress }
            }
          }
        }
      }`;
  } else if (type === 'ports') {
    if (!originIpParam || !originIpParam.trim()) {
      return new Response(JSON.stringify({ error: 'originIp is required for type=ports' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    query = `query NetworkInsightsPorts($accountTag: string!, $filter: AccountGatewayL4DownstreamSessionsAdaptiveGroupsFilter_InputObject) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            gatewayL4DownstreamSessionsAdaptiveGroups(limit: 500, filter: $filter, orderBy: [count_DESC]) {
              count
              dimensions { sourcePort }
            }
          }
        }
      }`;
  } else {
    return new Response(JSON.stringify({ error: 'Invalid type', hint: 'Use type=chart|origins|ports' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        variables: { accountTag: accountId, filter }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GraphQL ${response.status}: ${text}`);
    }

    const json = await response.json();
    if (json.errors?.length) {
      const errMessages = json.errors.map(e => e.message || JSON.stringify(e)).join('; ');
      const errDetails = json.errors.map(e => ({ message: e.message, path: e.path }));
      return new Response(JSON.stringify({
        error: errMessages,
        hint: 'Check GraphQL schema for gatewayL4DownstreamSessionsAdaptiveGroups (dimensions/sum).',
        details: errDetails
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    let accounts = json?.data?.viewer?.accounts || [];
    let groups = accounts[0]?.gatewayL4DownstreamSessionsAdaptiveGroups || [];

    // If chart returned empty, retry with single-bound filter (datetime_gt) in case this account's L4 API ignores _leq.
    if (type === 'chart' && groups.length === 0 && !originIpParam) {
      const filterSingle = { datetime_gt: geq };
      const res2 = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { accountTag: accountId, filter: filterSingle }
        })
      });
      if (res2.ok) {
        const json2 = await res2.json();
        if (!json2.errors?.length) {
          const acc2 = json2?.data?.viewer?.accounts || [];
          const groups2 = acc2[0]?.gatewayL4DownstreamSessionsAdaptiveGroups || [];
          if (groups2.length > 0) {
            groups = groups2;
          }
        }
      }
    }

    return new Response(JSON.stringify({
      data: groups,
      filter: { datetime_geq: geq, datetime_leq: leq, originIp: filter.ipSourceAddress || null }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Network Insights error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      hint: 'Ensure API token has Analytics Read (Gateway) permission. L4 dataset may use different dimension/sum names.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

/**
 * DNS Insights - Gateway DNS query volume over time, stacked by response result; drill to hostnames with category.
 * GET /api/dns-insights?type=chart&datetime_geq=...&datetime_leq=...&email=...
 * GET /api/dns-insights?type=hostnames&datetime_geq=...&datetime_leq=...&email=...
 */
async function handleDnsInsights(request, corsHeaders, env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({
      error: 'Missing Cloudflare API credentials',
      hint: 'Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'chart';
  const datetimeGeq = url.searchParams.get('datetime_geq');
  const datetimeLeq = url.searchParams.get('datetime_leq');
  // Note: gatewayResolverQueriesAdaptiveGroups filter does not support email; DNS data is account-scoped.

  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  start.setHours(start.getHours() - 24);
  const defaultGeq = start.toISOString();
  const defaultLeq = end.toISOString();
  const geq = datetimeGeq || defaultGeq;
  const leq = datetimeLeq || defaultLeq;

  const filter = { datetime_geq: geq, datetime_leq: leq };

  let query;
  if (type === 'chart') {
    query = `query DnsInsightsChart($accountTag: string!, $filter: AccountGatewayResolverQueriesAdaptiveGroupsFilter_InputObject) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            gatewayResolverQueriesAdaptiveGroups(limit: 1000, filter: $filter, orderBy: [datetimeHour_ASC]) {
              count
              dimensions { datetimeHour resolverDecision }
            }
          }
        }
      }`;
  } else if (type === 'hostnames') {
    // Note: AccountGatewayResolverQueriesAdaptiveGroups does not expose identity (email/userId) in dimensions or filter; hostnames are account-wide.
    query = `query DnsInsightsHostnames($accountTag: string!, $filter: AccountGatewayResolverQueriesAdaptiveGroupsFilter_InputObject) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            gatewayResolverQueriesAdaptiveGroups(limit: 1000, filter: $filter, orderBy: [count_DESC]) {
              count
              dimensions { queryName queryNameReversed resolverDecision }
            }
          }
        }
      }`;
  } else {
    return new Response(JSON.stringify({ error: 'Invalid type', hint: 'Use type=chart|hostnames' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        variables: { accountTag: accountId, filter }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GraphQL ${response.status}: ${text}`);
    }

    const json = await response.json();
    if (json.errors?.length) {
      const errMessages = json.errors.map(e => e.message || JSON.stringify(e)).join('; ');
      const errDetails = json.errors.map(e => ({ message: e.message, path: e.path }));
      return new Response(JSON.stringify({
        error: errMessages,
        hint: 'Check GraphQL schema for gatewayResolverQueriesAdaptiveGroups (filter/dimensions).',
        details: errDetails
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const accounts = json?.data?.viewer?.accounts || [];
    const groups = accounts[0]?.gatewayResolverQueriesAdaptiveGroups || [];

    return new Response(JSON.stringify({
      data: groups,
      filter: { datetime_geq: geq, datetime_leq: leq }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('DNS Insights error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      hint: 'Ensure API token has Analytics Read (Gateway) permission.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

/**
 * Gateway rules - list Zero Trust Gateway rules for policy name lookup.
 * GET /api/gateway/rules
 */
async function handleGatewayRules(request, corsHeaders, env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return new Response(JSON.stringify({
      error: 'Missing Cloudflare API credentials',
      rules: []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/gateway/rules`,
      { headers: { 'Authorization': 'Bearer ' + apiToken } }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gateway rules API ${response.status}: ${text}`);
    }

    const result = await response.json();
    if (!result.success && result.errors?.length) {
      throw new Error(result.errors.map(e => e.message || e).join('; '));
    }

    const rules = result.result || [];
    const policyMap = {};
    for (const r of rules) {
      if (r.id && r.name) policyMap[r.id] = r.name;
    }

    return new Response(JSON.stringify({
      rules,
      policyMap
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Gateway rules error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      rules: [],
      policyMap: {}
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

/**
 * Generate the main HTML page
 */
async function getMainPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CF1 Cockpit</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
            min-height: 100vh;
            color: #333;
        }

        .app-container {
            display: flex;
            min-height: 100vh;
        }

        /* Sidebar */
        .sidebar {
            width: 280px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-right: 1px solid rgba(255, 255, 255, 0.2);
            display: flex;
            flex-direction: column;
            box-shadow: 2px 0 20px rgba(0, 0, 0, 0.1);
        }

        .sidebar-header {
            padding: 2rem 1.5rem;
            border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }

        .logo {
            font-size: 1.5rem;
            font-weight: 700;
            color: #1e40af;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .logo-icon {
            font-size: 2rem;
        }

        .menu {
            flex: 1;
            padding: 1rem 0;
            overflow-y: auto;
        }

        .menu-item {
            margin: 0.25rem 1rem;
        }

        .menu-item-header {
            display: flex;
            align-items: center;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-weight: 500;
            color: #555;
        }

        .menu-item-header:hover {
            background: rgba(37, 99, 235, 0.1);
            color: #1e40af;
        }

        .menu-item-header.active {
            background: rgba(37, 99, 235, 0.15);
            color: #1e40af;
        }

        .menu-item-icon {
            font-size: 1.2rem;
            margin-right: 0.75rem;
            width: 20px;
            text-align: center;
        }

        .menu-item-label {
            flex: 1;
        }

        .menu-item-arrow {
            transition: transform 0.2s ease;
            font-size: 0.8rem;
            color: #999;
        }

        .menu-item-arrow.expanded {
            transform: rotate(90deg);
        }

        .submenu {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
            background: rgba(0, 0, 0, 0.02);
            border-radius: 8px;
            margin: 0.25rem 0;
        }

        .submenu.expanded {
            max-height: 200px;
        }

        .submenu-item {
            display: block;
            padding: 0.5rem 1rem 0.5rem 3rem;
            color: #666;
            text-decoration: none;
            transition: all 0.2s ease;
            border-radius: 6px;
            margin: 0.125rem 0.5rem;
        }

        .submenu-item:hover {
            background: rgba(37, 99, 235, 0.1);
            color: #1e40af;
        }

        .submenu-item.active {
            background: rgba(37, 99, 235, 0.15);
            color: #1e40af;
            font-weight: 500;
        }

        .sidebar-footer {
            padding: 1.5rem;
            border-top: 1px solid rgba(0, 0, 0, 0.1);
            background: rgba(0, 0, 0, 0.02);
        }

        .user-info {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem;
            background: rgba(37, 99, 235, 0.1);
            border-radius: 8px;
        }

        .user-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: linear-gradient(135deg, #1e3a5f, #2563eb);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 600;
            font-size: 0.9rem;
        }

        .user-details {
            flex: 1;
            min-width: 0;
        }

        .user-name {
            font-weight: 500;
            color: #333;
            font-size: 0.9rem;
        }

        .user-email {
            font-size: 0.8rem;
            color: #666;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* Main Content */
        .main-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
        }

        .content-header {
            padding: 2rem;
            background: rgba(255, 255, 255, 0.95);
            border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }

        .content-title {
            font-size: 2rem;
            font-weight: 700;
            color: #333;
            margin-bottom: 0.5rem;
        }

        .content-subtitle {
            color: #666;
            font-size: 1.1rem;
        }

        .content-body {
            flex: 1;
            padding: 2rem;
            overflow-y: auto;
        }

        .welcome-card {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
        }

        .welcome-title {
            font-size: 1.5rem;
            font-weight: 600;
            color: #333;
            margin-bottom: 1rem;
        }

        .welcome-text {
            color: #666;
            line-height: 1.6;
            margin-bottom: 1.5rem;
        }

        .feature-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-top: 2rem;
        }

        .feature-card {
            background: rgba(255, 255, 255, 0.9);
            border-radius: 8px;
            padding: 1.5rem;
            text-align: center;
            transition: transform 0.2s ease;
        }

        .feature-card:hover {
            transform: translateY(-2px);
        }

        .feature-icon {
            font-size: 2rem;
            margin-bottom: 1rem;
        }

        .feature-title {
            font-weight: 600;
            color: #333;
            margin-bottom: 0.5rem;
        }

        .feature-description {
            color: #666;
            font-size: 0.9rem;
        }

        /* Loading and Error States */
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
            color: #666;
        }

        .error {
            background: rgba(255, 0, 0, 0.1);
            color: #d32f2f;
            padding: 1rem;
            border-radius: 8px;
            margin: 1rem 0;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
            .sidebar {
                width: 100%;
                position: fixed;
                left: -100%;
                transition: left 0.3s ease;
                z-index: 1000;
            }

            .sidebar.open {
                left: 0;
            }

            .main-content {
                width: 100%;
            }

            .content-header {
                padding: 1rem;
            }

            .content-body {
                padding: 1rem;
            }
        }
    </style>
</head>
<body>
    <div class="app-container">
        <!-- Sidebar -->
        <nav class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <div class="logo">
                    <span class="logo-icon">☁️</span>
                    <span>CF1 Cockpit</span>
                </div>
            </div>

            <div class="menu" id="menu">
                <!-- Menu items will be populated by JavaScript -->
            </div>

            <div class="sidebar-footer">
                <div class="user-info" id="userInfo">
                    <div class="user-avatar" id="userAvatar">U</div>
                    <div class="user-details">
                        <div class="user-name" id="userName">Loading...</div>
                        <div class="user-email" id="userEmail">user@example.com</div>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Main Content -->
        <main class="main-content">
            <div class="content-header">
                <h1 class="content-title">Welcome to CF1 Cockpit</h1>
                <p class="content-subtitle">Your comprehensive analytics and insights platform</p>
            </div>

            <div class="content-body">
                <div class="welcome-card">
                    <h2 class="welcome-title">Getting Started</h2>
                    <p class="welcome-text">
                        CF1 Cockpit provides powerful tools for analyzing your Cloudflare data through intuitive visualizations. 
                        Use the sidebar menu to explore different sections and features.
                    </p>

                    <div class="feature-grid">
                        <div class="feature-card">
                            <div class="feature-icon">📊</div>
                            <h3 class="feature-title">Analytics Dashboard</h3>
                            <p class="feature-description">Comprehensive traffic, performance, and security analytics</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon">🔍</div>
                            <h3 class="feature-title">GraphQL Explorer</h3>
                            <p class="feature-description">Build and execute custom GraphQL queries with ease</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon">📈</div>
                            <h3 class="feature-title">Reports & Insights</h3>
                            <p class="feature-description">Generate custom reports and export data for analysis</p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <script>
        // Global state
        let currentUser = null;
        let menuData = null;

        // Initialize the application
        async function init() {
            try {
                await validateAuth();
                await loadMenu();
                setupEventListeners();
            } catch (error) {
                console.error('Initialization error:', error);
                showError('Failed to initialize application');
            }
        }

        // Validate authentication
        async function validateAuth() {
            try {
                const response = await fetch('/api/auth/validate', {
                    headers: {
                        'CF-Authorization': 'Bearer ' + getAuthToken()
                    }
                });

                if (!response.ok) {
                    throw new Error('Authentication failed');
                }

                const data = await response.json();
                currentUser = data.user;
                updateUserDisplay();
            } catch (error) {
                console.error('Auth validation error:', error);
                // For demo purposes, use mock user
                currentUser = {
                    email: 'user@example.com',
                    name: 'Demo User'
                };
                updateUserDisplay();
            }
        }

        // Get auth token (mock implementation)
        function getAuthToken() {
            // In production, this would come from Cloudflare Access
            return 'mock-token-' + Date.now();
        }

        // Load menu data
        async function loadMenu() {
            try {
                const response = await fetch('/api/menu');
                menuData = await response.json();
                renderMenu();
            } catch (error) {
                console.error('Menu loading error:', error);
                showError('Failed to load menu');
            }
        }

        // Render the menu
        function renderMenu() {
            const menuContainer = document.getElementById('menu');
            
            if (!menuData || !menuData.items) {
                menuContainer.innerHTML = '<div class="loading">Loading menu...</div>';
                return;
            }

            menuContainer.innerHTML = menuData.items.map(item => \`
                <div class="menu-item">
                    <div class="menu-item-header" onclick="toggleSubmenu('\${item.id}')">
                        <span class="menu-item-icon">\${item.icon}</span>
                        <span class="menu-item-label">\${item.label}</span>
                        <span class="menu-item-arrow" id="arrow-\${item.id}">▶</span>
                    </div>
                    <div class="submenu" id="submenu-\${item.id}">
                        \${item.subItems.map(subItem => \`
                            <a href="\${subItem.path}" class="submenu-item" onclick="selectSubmenuItem('\${subItem.id}')">
                                \${subItem.label}
                            </a>
                        \`).join('')}
                    </div>
                </div>
            \`).join('');
        }

        // Toggle submenu visibility
        function toggleSubmenu(itemId) {
            const submenu = document.getElementById(\`submenu-\${itemId}\`);
            const arrow = document.getElementById(\`arrow-\${itemId}\`);
            const header = submenu.previousElementSibling;

            if (submenu.classList.contains('expanded')) {
                submenu.classList.remove('expanded');
                arrow.classList.remove('expanded');
                header.classList.remove('active');
            } else {
                // Close other submenus
                document.querySelectorAll('.submenu.expanded').forEach(menu => {
                    menu.classList.remove('expanded');
                });
                document.querySelectorAll('.menu-item-arrow.expanded').forEach(arrow => {
                    arrow.classList.remove('expanded');
                });
                document.querySelectorAll('.menu-item-header.active').forEach(header => {
                    header.classList.remove('active');
                });

                // Open current submenu
                submenu.classList.add('expanded');
                arrow.classList.add('expanded');
                header.classList.add('active');
            }
        }

        // Select submenu item
        function selectSubmenuItem(itemId) {
            // Remove active class from all submenu items
            document.querySelectorAll('.submenu-item.active').forEach(item => {
                item.classList.remove('active');
            });

            // Add active class to selected item
            event.target.classList.add('active');
        }

        // Update user display
        function updateUserDisplay() {
            if (!currentUser) return;

            const userAvatar = document.getElementById('userAvatar');
            const userName = document.getElementById('userName');
            const userEmail = document.getElementById('userEmail');

            if (userAvatar) {
                userAvatar.textContent = currentUser.name.charAt(0).toUpperCase();
            }
            if (userName) {
                userName.textContent = currentUser.name;
            }
            if (userEmail) {
                userEmail.textContent = currentUser.email;
            }
        }

        // Show error message
        function showError(message) {
            const contentBody = document.querySelector('.content-body');
            contentBody.innerHTML = \`
                <div class="error">
                    <strong>Error:</strong> \${message}
                </div>
            \`;
        }

        // Setup event listeners
        function setupEventListeners() {
            // Add any additional event listeners here
        }

        // Initialize when DOM is loaded
        document.addEventListener('DOMContentLoaded', init);
    </script>
</body>
</html>`;
}