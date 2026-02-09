#!/bin/bash
# Test Cloudflare Intel API domain categorization lookups.
# Run from project root: ./scripts/test-intel-domain.sh
# Requires: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .dev.vars
# Token must have: Account > Intel > Read (or Edit)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .dev.vars ]; then
  echo "Error: .dev.vars not found. Create it with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID"
  exit 1
fi
source .dev.vars

if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set in .dev.vars"
  exit 1
fi

BASE="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}"
HEADER="Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"

echo "=== Testing Intel domain API (nvidia.com, cursor.sh, rlcdn.com) ==="
echo "Token needs: Account > Intel > Read"
echo ""

for DOMAIN in nvidia.com cursor.sh rlcdn.com; do
  echo "--- Intel domain: $DOMAIN ---"
  curl -s "${BASE}/intel/domain?domain=${DOMAIN}" -H "$HEADER" | jq '.' 2>/dev/null || curl -s "${BASE}/intel/domain?domain=${DOMAIN}" -H "$HEADER"
  echo ""
  echo "--- Intel domain-history: $DOMAIN ---"
  curl -s "${BASE}/intel/domain-history?domain=${DOMAIN}" -H "$HEADER" | jq '.' 2>/dev/null || curl -s "${BASE}/intel/domain-history?domain=${DOMAIN}" -H "$HEADER"
  echo ""
done

echo "=== Summary ==="
echo "Domain categorization uses the Intel API (accounts/{id}/intel/domain and domain-history)."
echo "If you see 'Authentication error': Add Account > Intel > Read to your API token."
echo "  Dashboard: My Profile > API Tokens > Edit token > Permissions > Account > Intel > Read"
echo ""
echo "Once the token has Intel Read, re-run this script to verify nvidia.com, cursor.sh, rlcdn.com return categories."
