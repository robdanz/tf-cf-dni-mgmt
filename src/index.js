/**
 * DNI List Manager - Worker API
 * Manages Zero Trust Gateway Do-Not-Inspect hostname lists
 */

import psl from 'psl';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = ['https://tf-cf-dni-mgmt.pages.dev', 'http://localhost:8788', 'http://127.0.0.1:8788'];
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
      switch (url.pathname) {
        case '/api/auth/validate':
          return handleAuthValidation(request, corsHeaders);

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
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  },
};

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
        label: 'DNI Lists',
        icon: '🛡️',
        subItems: [
          { id: 'sub1-1', label: 'List Manager', path: '/dni/lists' }
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
      // Remove source entries that are the domain itself or any subdomain of it.
      // e.g. valueToAdd=xx.fbcdn.net removes scontent-dfw5-2.xx.fbcdn.net, video.xx.fbcdn.net, xx.fbcdn.net
      toRemove = allItems.filter(i => {
        const v = (i.value || i.hostname || '').toLowerCase();
        return v === domainLower || v.endsWith('.' + domainLower);
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

    // For domain mode: if the value is already in the target (pre-check or API rejection),
    // still remove it from source rather than failing the whole operation.
    let addErr = null;
    if (!alreadyInTarget) {
      const addRes = await fetch(`${base}/${targetListId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ append: [{ value: valueToAdd }] })
      });
      if (!addRes.ok) {
        const errText = await addRes.text();
        const isDuplicate = /duplicate|already exist/i.test(errText);
        if (!isDuplicate) addErr = parseApiError(errText);
        // duplicate → fall through and still remove from source
      }
    }

    // Use PATCH remove (Gateway API expects remove as array of value strings)
    const removeValues = toRemove.map(i => i.value || i.hostname || '').filter(Boolean);
    const removeRes = removeValues.length > 0
      ? await fetch(`${base}/${sourceListId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ remove: removeValues })
        })
      : { ok: true };

    if (!removeRes.ok) {
      const remErr = await removeRes.text();
      throw new Error('Update failed (source list): ' + parseApiError(remErr));
    }
    if (addErr) {
      throw new Error('Update failed (target list): ' + addErr);
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

