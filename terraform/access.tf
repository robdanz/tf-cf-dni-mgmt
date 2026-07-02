resource "cloudflare_access_application" "dni_mgmt" {
  account_id       = var.cloudflare_account_id
  name             = "DNI List Manager"
  domain           = "${var.worker_name}.${var.cloudflare_workers_subdomain}.workers.dev"
  type             = "self_hosted"
  session_duration = "24h"
}
