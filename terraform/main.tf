terraform {
  required_version = ">= 1.5"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Fetch token permission groups via the API at plan time.
# The cloudflare_api_token_permission_groups data source requires Global API Key
# auth, which we avoid. This http call works with a scoped API token that has
# "API Tokens Edit" permission.
data "http" "token_permission_groups" {
  url = "https://api.cloudflare.com/client/v4/user/tokens/permission_groups"
  request_headers = {
    Authorization = "Bearer ${var.cloudflare_api_token}"
    Content-Type  = "application/json"
  }
}

locals {
  all_permission_groups = jsondecode(data.http.token_permission_groups.response_body).result
  # Build a name → id map for account-scoped permissions
  account_permissions = {
    for p in local.all_permission_groups :
    p.name => p.id
    if contains(p.scopes, "com.cloudflare.api.account")
  }
}
