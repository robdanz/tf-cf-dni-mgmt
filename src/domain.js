/**
 * Domain helpers for list move logic.
 *
 * Uses tldts with its default ICANN-only suffix matching: private-section
 * PSL entries (googleapis.com, amazonaws.com, ...) are treated as normal
 * registrable domains so "Domain" moves can land on them, while ICANN
 * suffixes (com, co.uk, ...) remain hard floors.
 *
 * CommonJS so the Jest suite (no transforms) can require it directly;
 * wrangler's esbuild bundles it into the ESM Worker fine.
 */
const { getDomain } = require('tldts');

function getRegistrableDomain(hostname) {
  const s = String(hostname || '').trim();
  if (!s) return null;
  return getDomain(s) || null;
}

function stripFirstLabel(hostname) {
  const s = String(hostname || '').trim().toLowerCase();
  if (!s) return null;
  const dot = s.indexOf('.');
  if (dot < 0) return null;
  const stripped = s.slice(dot + 1);
  if (getDomain(stripped)) return stripped;
  return null;
}

module.exports = { getRegistrableDomain, stripFirstLabel };
