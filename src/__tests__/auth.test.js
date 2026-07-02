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
