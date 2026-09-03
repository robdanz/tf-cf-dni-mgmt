const { validateClaims } = require('../auth.js');

describe('validateClaims', () => {
  const validClaims = {
    email: 'user@tancow.net',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'https://tancow.cloudflareaccess.com',
    aud: ['test-aud-tag-123'],
    sub: 'user-id-456',
    name: 'Test User',
  };

  test('returns user info for valid claims', () => {
    const result = validateClaims(validClaims, 'test-aud-tag-123', 'tancow');
    expect(result).toEqual({
      email: 'user@tancow.net',
      name: 'Test User',
      groups: [],
    });
  });

  test('returns null for expired token', () => {
    const expired = { ...validClaims, exp: Math.floor(Date.now() / 1000) - 60 };
    const result = validateClaims(expired, 'test-aud-tag-123', 'tancow');
    expect(result).toBeNull();
  });

  test('returns null for wrong audience', () => {
    const result = validateClaims(validClaims, 'wrong-aud', 'tancow');
    expect(result).toBeNull();
  });

  test('returns null for wrong issuer', () => {
    const result = validateClaims(validClaims, 'test-aud-tag-123', 'wrong-team');
    expect(result).toBeNull();
  });

  test('returns null when email is missing', () => {
    const noEmail = { ...validClaims, email: undefined, sub: undefined };
    const result = validateClaims(noEmail, 'test-aud-tag-123', 'tancow');
    expect(result).toBeNull();
  });

  test('accepts aud as string (not array)', () => {
    const stringAud = { ...validClaims, aud: 'test-aud-tag-123' };
    const result = validateClaims(stringAud, 'test-aud-tag-123', 'tancow');
    expect(result).not.toBeNull();
    expect(result.email).toBe('user@tancow.net');
  });

  test('extracts groups from claims', () => {
    const withGroups = { ...validClaims, groups: ['admin', 'editors'] };
    const result = validateClaims(withGroups, 'test-aud-tag-123', 'tancow');
    expect(result.groups).toEqual(['admin', 'editors']);
  });

  test('falls back to email prefix for name', () => {
    const noName = { ...validClaims, name: undefined };
    const result = validateClaims(noName, 'test-aud-tag-123', 'tancow');
    expect(result.name).toBe('user');
  });
});

describe('claimRejectionReason', () => {
  const { claimRejectionReason, authFailureHint, AUTH_HINTS } = require('../auth.js');

  const validClaims = {
    email: 'user@tancow.net',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'https://tancow.cloudflareaccess.com',
    aud: ['test-aud-tag-123'],
    sub: 'user-id-456',
    name: 'Test User',
  };

  test('returns null for acceptable claims', () => {
    expect(claimRejectionReason(validClaims, 'test-aud-tag-123', 'tancow')).toBeNull();
  });

  test('distinguishes an expired token', () => {
    const expired = { ...validClaims, exp: Math.floor(Date.now() / 1000) - 60 };
    expect(claimRejectionReason(expired, 'test-aud-tag-123', 'tancow')).toBe('token_expired');
  });

  test('distinguishes an AUD mismatch — the stale-secret case', () => {
    expect(claimRejectionReason(validClaims, 'wrong-aud', 'tancow')).toBe('aud_mismatch');
  });

  test('distinguishes a team/issuer mismatch', () => {
    expect(claimRejectionReason(validClaims, 'test-aud-tag-123', 'wrong-team')).toBe('iss_mismatch');
  });

  test('distinguishes a token with no identity claim', () => {
    const noEmail = { ...validClaims, email: undefined, sub: undefined };
    expect(claimRejectionReason(noEmail, 'test-aud-tag-123', 'tancow')).toBe('no_identity');
  });

  test('agrees with validateClaims on accept/reject for every case', () => {
    const { validateClaims } = require('../auth.js');
    const cases = [
      [validClaims, 'test-aud-tag-123', 'tancow'],
      [{ ...validClaims, exp: 1 }, 'test-aud-tag-123', 'tancow'],
      [validClaims, 'wrong-aud', 'tancow'],
      [validClaims, 'test-aud-tag-123', 'wrong-team'],
      [{ ...validClaims, email: undefined, sub: undefined }, 'test-aud-tag-123', 'tancow'],
    ];
    for (const [claims, aud, team] of cases) {
      const rejected = claimRejectionReason(claims, aud, team) !== null;
      expect(validateClaims(claims, aud, team) === null).toBe(rejected);
    }
  });

  test('every reason code has a hint, and hints leak no secret values', () => {
    for (const [code, hint] of Object.entries(AUTH_HINTS)) {
      expect(authFailureHint(code)).toBe(hint);
      expect(hint.length).toBeGreaterThan(10);
    }
  });

  test('an unknown reason code degrades to a generic hint', () => {
    expect(authFailureHint('nonsense')).toBe('Access token could not be verified.');
    expect(authFailureHint(undefined)).toBe('Access token could not be verified.');
  });
});
