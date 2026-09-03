/**
 * Cloudflare Access JWT verification with JWKS signature validation.
 *
 * Exports:
 *   verifyAccessJwt(request, env) → { user, reason }
 *       user is { email, name, groups } on success, null on failure.
 *       reason is a stable code (see AUTH_HINTS) explaining *why* it failed.
 *   validateClaims(claims, expectedAud, teamName) → { email, name, groups } | null
 *   claimRejectionReason(claims, expectedAud, teamName) → reason code | null
 *   authFailureHint(reason) → operator-facing string
 *
 * Auth here fails closed and, historically, silently: every misconfiguration
 * produced an identical bare 401. The reason codes exist so a deployment that
 * is missing its Access app or its secrets says so instead of looking like a
 * rejected user.
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
 * Operator-facing hints, keyed by reason code. Deliberately describes the
 * deployment fault, never the token contents or any secret value.
 */
const AUTH_HINTS = {
  not_configured:
    'Worker secrets ACCESS_TEAM and/or ACCESS_AUD are not set. This account was never fully provisioned — run `terraform apply` in terraform/.',
  no_token:
    'No Cf-Access-Jwt-Assertion header on the request, so this hostname is not behind a Cloudflare Access application. Verify with: curl -sI <url> — expect a 302 to <team>.cloudflareaccess.com, not a 200.',
  malformed_token:
    'The Cf-Access-Jwt-Assertion header is not a well-formed JWT.',
  jwks_unavailable:
    'Could not fetch JWKS from https://<ACCESS_TEAM>.cloudflareaccess.com. ACCESS_TEAM must be the bare team name (e.g. "myteam"), not the full domain ("myteam.cloudflareaccess.com").',
  unknown_key:
    'The token was signed by a key absent from this team\'s JWKS — it was likely issued by a different Access team than ACCESS_TEAM names.',
  bad_signature:
    'JWT signature verification failed.',
  token_expired:
    'The Access token has expired. Re-authenticate and retry.',
  aud_mismatch:
    'Token audience does not match ACCESS_AUD. The secret must hold the AUD tag of the Access application actually serving this hostname — a stale value from a different or recreated app is the usual cause.',
  iss_mismatch:
    'Token issuer does not match ACCESS_TEAM. The Access app protecting this hostname belongs to a different team.',
  no_identity:
    'The Access token carries no email or subject claim.',
};

/**
 * Why a set of claims is unacceptable, or null if they are fine.
 * Split out from validateClaims so failures can be reported precisely;
 * validateClaims is defined in terms of it so the two cannot drift.
 */
function claimRejectionReason(claims, expectedAud, teamName) {
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now) return 'token_expired';

  const audList = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audList.includes(expectedAud)) return 'aud_mismatch';

  if (claims.iss !== `https://${teamName}.cloudflareaccess.com`) return 'iss_mismatch';

  if (!(claims.email || claims.sub)) return 'no_identity';

  return null;
}

/**
 * Map a reason code to an operator-facing hint. Unknown codes degrade to a
 * generic string rather than leaking the raw code.
 */
function authFailureHint(reason) {
  return AUTH_HINTS[reason] || 'Access token could not be verified.';
}

/**
 * Validate JWT claims: audience, issuer, expiration, and extract user info.
 * Exported for unit testing (does not require Web Crypto).
 */
function validateClaims(claims, expectedAud, teamName) {
  if (claimRejectionReason(claims, expectedAud, teamName)) return null;

  const email = claims.email || claims.sub;
  return {
    email,
    name: claims.name || claims.common_name || claims.preferred_username || email.split('@')[0],
    groups: claims.groups || claims['custom:groups'] || [],
  };
}

/**
 * Verify the Access JWT: signature + claims.
 * Returns { user, reason } — user is null on failure and reason says why.
 */
async function verifyAccessJwt(request, env) {
  const fail = (reason) => ({ user: null, reason });

  const teamName = env.ACCESS_TEAM;
  const expectedAud = env.ACCESS_AUD;
  if (!teamName || !expectedAud) return fail('not_configured');

  // Extract token from Cf-Access-Jwt-Assertion header (injected by Access)
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return fail('no_token');

  const parts = token.split('.');
  if (parts.length !== 3) return fail('malformed_token');

  // Decode header to get kid
  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0])));
  } catch {
    return fail('malformed_token');
  }
  if (!header.kid) return fail('malformed_token');

  // Fetch JWKS and find the matching key
  let keys;
  try {
    keys = await fetchJwks(teamName);
  } catch (e) {
    console.error('JWKS fetch error:', e);
    return fail('jwks_unavailable');
  }
  const key = keys[header.kid];
  if (!key) return fail('unknown_key');

  // Verify signature
  const signatureBytes = base64urlDecode(parts[2]);
  const dataBytes = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  let valid;
  try {
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signatureBytes, dataBytes);
  } catch {
    return fail('bad_signature');
  }
  if (!valid) return fail('bad_signature');

  // Decode and validate claims
  let claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
  } catch {
    return fail('malformed_token');
  }

  const reason = claimRejectionReason(claims, expectedAud, teamName);
  if (reason) return fail(reason);

  return { user: validateClaims(claims, expectedAud, teamName), reason: null };
}

// CommonJS export — Jest requires this; wrangler's esbuild bundler also handles it fine
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { verifyAccessJwt, validateClaims, claimRejectionReason, authFailureHint, AUTH_HINTS };
}
