// Tests for domain helpers used by the list move logic.
const { getRegistrableDomain, stripFirstLabel } = require('../domain.js');

describe('stripFirstLabel', () => {
  test('strips one label from a simple host', () => {
    expect(stripFirstLabel('host.domain.com')).toBe('domain.com');
  });

  test('strips only one label from a deep host', () => {
    expect(stripFirstLabel('sub.host.domain.com')).toBe('host.domain.com');
  });

  test('strips into a private-section public suffix (googleapis.com)', () => {
    expect(stripFirstLabel('www.googleapis.com')).toBe('googleapis.com');
  });

  test('strips deep googleapis host one label at a time', () => {
    expect(stripFirstLabel('a.oauth2.googleapis.com')).toBe('oauth2.googleapis.com');
  });

  test('refuses to strip below an ICANN suffix (co.uk)', () => {
    expect(stripFirstLabel('host.co.uk')).toBeNull();
  });

  test('refuses to strip below a bare TLD', () => {
    expect(stripFirstLabel('domain.com')).toBeNull();
  });

  test('returns null for single-label input', () => {
    expect(stripFirstLabel('localhost')).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(stripFirstLabel('')).toBeNull();
    expect(stripFirstLabel(null)).toBeNull();
  });

  test('trims and lowercases', () => {
    expect(stripFirstLabel(' Host.Domain.COM ')).toBe('domain.com');
  });
});

describe('getRegistrableDomain', () => {
  test('returns eTLD+1 for a normal host', () => {
    expect(getRegistrableDomain('host.domain.com')).toBe('domain.com');
  });

  test('treats private-section suffixes as registrable (googleapis.com)', () => {
    expect(getRegistrableDomain('googleapis.com')).toBe('googleapis.com');
  });

  test('respects ICANN multi-label suffixes', () => {
    expect(getRegistrableDomain('host.domain.co.uk')).toBe('domain.co.uk');
  });

  test('returns null for a bare public suffix', () => {
    expect(getRegistrableDomain('co.uk')).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(getRegistrableDomain('')).toBeNull();
    expect(getRegistrableDomain(undefined)).toBeNull();
  });
});

describe('domain-mode move value (stripFirstLabel with registrable fallback)', () => {
  const domainModeValue = (h) => stripFirstLabel(h) || getRegistrableDomain(h);

  test('www.googleapis.com moves googleapis.com, not the FQDN', () => {
    expect(domainModeValue('www.googleapis.com')).toBe('googleapis.com');
  });

  test('host.co.uk falls back to itself (cannot cross ICANN floor)', () => {
    expect(domainModeValue('host.co.uk')).toBe('host.co.uk');
  });

  test('googleapis.com itself resolves to googleapis.com', () => {
    expect(domainModeValue('googleapis.com')).toBe('googleapis.com');
  });
});
