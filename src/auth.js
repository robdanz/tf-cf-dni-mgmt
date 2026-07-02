/**
 * Cloudflare Access JWT verification with JWKS signature validation.
 *
 * Exports:
 *   verifyAccessJwt(request, env) → { email, name, groups } | null
 *   validateClaims(claims, expectedAud, teamName) → { email, name, groups } | null
 */

// In-memory JWKS cache (lives for the Worker's lifetime, refreshed on cold start)
let cachedKeys = null;
let cachedKeysTeam = null;

/**
 * Fetch JWKS public keys from Cloudflare Access.
 * Caches keys in module scope — refreshed on Worker cold start.
 */
async function fetchJwks(teamName) {
  if (cachedKeys && cachedKeysTeam === teamName) return cachedKeys;

  const url = `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = await res.json();

  // Import each RSA key for verification
  const keys = {};
  for (const jwk of (data.keys || [])) {
    if (jwk.kty !== 'RSA' || jwk.use !== 'sig') continue;
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    keys[jwk.kid] = key;
  }

  cachedKeys = keys;
  cachedKeysTeam = teamName;
  return keys;
}

/**
 * Decode a base64url string to a Uint8Array.
 */
function base64urlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Validate JWT claims: audience, issuer, expiration, and extract user info.
 * Exported for unit testing (does not require Web Crypto).
 */
function validateClaims(claims, expectedAud, teamName) {
  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now) return null;

  // Check audience
  const audList = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audList.includes(expectedAud)) return null;

  // Check issuer
  const expectedIss = `https://${teamName}.cloudflareaccess.com`;
  if (claims.iss !== expectedIss) return null;

  // Extract email
  const email = claims.email || claims.sub;
  if (!email) return null;

  return {
    email,
    name: claims.name || claims.common_name || claims.preferred_username || email.split('@')[0],
    groups: claims.groups || claims['custom:groups'] || [],
  };
}

/**
 * Verify the Access JWT: signature + claims.
 * Returns user info { email, name, groups } or null.
 */
async function verifyAccessJwt(request, env) {
  const teamName = env.ACCESS_TEAM;
  const expectedAud = env.ACCESS_AUD;
  if (!teamName || !expectedAud) return null;

  // Extract token from Cf-Access-Jwt-Assertion header (injected by Access)
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  // Decode header to get kid
  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0])));
  } catch {
    return null;
  }
  if (!header.kid) return null;

  // Fetch JWKS and find the matching key
  let keys;
  try {
    keys = await fetchJwks(teamName);
  } catch (e) {
    console.error('JWKS fetch error:', e);
    return null;
  }
  const key = keys[header.kid];
  if (!key) return null;

  // Verify signature
  const signatureBytes = base64urlDecode(parts[2]);
  const dataBytes = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  let valid;
  try {
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signatureBytes, dataBytes);
  } catch {
    return null;
  }
  if (!valid) return null;

  // Decode and validate claims
  let claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
  } catch {
    return null;
  }

  return validateClaims(claims, expectedAud, teamName);
}

// CommonJS export — Jest requires this; wrangler's esbuild bundler also handles it fine
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { verifyAccessJwt, validateClaims };
}
