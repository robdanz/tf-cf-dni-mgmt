#!/bin/bash

# CF-Analyst Secret Management Script
# This script helps manage secrets for Cloudflare Workers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}Error: wrangler is not installed${NC}"
    echo "Install it with: npm install -g wrangler"
    exit 1
fi

# Function to list secrets
list_secrets() {
    local env=${1:-production}
    echo -e "${GREEN}Listing secrets for environment: $env${NC}"
    npx wrangler secret list --env $env
}

# Function to put a secret
put_secret() {
    local secret_name=$1
    local env=${2:-production}
    
    if [ -z "$secret_name" ]; then
        echo -e "${RED}Error: Secret name is required${NC}"
        echo "Usage: ./scripts/manage-secrets.sh put SECRET_NAME [environment]"
        exit 1
    fi
    
    echo -e "${GREEN}Setting secret '$secret_name' for environment: $env${NC}"
    echo -e "${YELLOW}Enter the secret value when prompted:${NC}"
    npx wrangler secret put "$secret_name" --env $env
}

# Function to delete a secret
delete_secret() {
    local secret_name=$1
    local env=${2:-production}
    
    if [ -z "$secret_name" ]; then
        echo -e "${RED}Error: Secret name is required${NC}"
        echo "Usage: ./scripts/manage-secrets.sh delete SECRET_NAME [environment]"
        exit 1
    fi
    
    echo -e "${YELLOW}Are you sure you want to delete secret '$secret_name' from environment: $env? (y/N)${NC}"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        npx wrangler secret delete "$secret_name" --env $env
        echo -e "${GREEN}Secret '$secret_name' deleted successfully${NC}"
    else
        echo -e "${YELLOW}Deletion cancelled${NC}"
    fi
}

# Main script logic
case "$1" in
    list)
        list_secrets "$2"
        ;;
    put)
        put_secret "$2" "$3"
        ;;
    delete)
        delete_secret "$2" "$3"
        ;;
    *)
        echo "CF-Analyst Secret Management"
        echo ""
        echo "Usage:"
        echo "  ./scripts/manage-secrets.sh list [environment]      - List all secrets"
        echo "  ./scripts/manage-secrets.sh put SECRET_NAME [env]   - Add/update a secret"
        echo "  ./scripts/manage-secrets.sh delete SECRET_NAME [env] - Delete a secret"
        echo ""
        echo "Environments: production (default), staging"
        echo ""
        echo "Examples:"
        echo "  ./scripts/manage-secrets.sh list production"
        echo "  ./scripts/manage-secrets.sh put API_KEY production"
        echo "  ./scripts/manage-secrets.sh put DATABASE_URL staging"
        echo "  ./scripts/manage-secrets.sh delete OLD_SECRET"
        exit 1
        ;;
esac
