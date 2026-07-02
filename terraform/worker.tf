locals {
  src_files      = fileset("${path.module}/..", "src/**/*.js")
  frontend_files = fileset("${path.module}/../frontend", "**")

  deploy_hash = sha256(join(",", concat(
    [for f in local.src_files : filesha256("${path.module}/../${f}")],
    [for f in local.frontend_files : filesha256("${path.module}/../frontend/${f}")],
    [
      filesha256("${path.module}/../package.json"),
      filesha256("${path.module}/../package-lock.json"),
      filesha256("${path.module}/../wrangler.toml"),
    ]
  )))
}

resource "null_resource" "worker_deploy" {
  depends_on = [cloudflare_zero_trust_access_application.dni_mgmt]

  triggers = {
    deploy_hash = local.deploy_hash
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npm run stamp && npx wrangler deploy"
    environment = {
      CLOUDFLARE_API_TOKEN  = var.cloudflare_api_token
      CLOUDFLARE_ACCOUNT_ID = var.cloudflare_account_id
    }
  }
}

resource "null_resource" "worker_secrets" {
  depends_on = [null_resource.worker_deploy]

  triggers = {
    token_hash  = sha256(var.cloudflare_api_token)
    account_id  = var.cloudflare_account_id
    access_aud  = cloudflare_zero_trust_access_application.dni_mgmt.aud
    access_team = var.cloudflare_access_team
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = <<-EOT
      echo "$WORKER_CF_TOKEN" | npx wrangler secret put CLOUDFLARE_API_TOKEN &&
      echo "$WORKER_ACCOUNT_ID" | npx wrangler secret put CLOUDFLARE_ACCOUNT_ID &&
      echo "$WORKER_ACCESS_AUD" | npx wrangler secret put ACCESS_AUD &&
      echo "$WORKER_ACCESS_TEAM" | npx wrangler secret put ACCESS_TEAM
    EOT
    environment = {
      CLOUDFLARE_API_TOKEN  = var.cloudflare_api_token
      CLOUDFLARE_ACCOUNT_ID = var.cloudflare_account_id
      WORKER_CF_TOKEN       = var.cloudflare_api_token
      WORKER_ACCOUNT_ID     = var.cloudflare_account_id
      WORKER_ACCESS_AUD     = cloudflare_zero_trust_access_application.dni_mgmt.aud
      WORKER_ACCESS_TEAM    = var.cloudflare_access_team
    }
  }
}
